import { BigQuery } from '@google-cloud/bigquery';
import crypto from 'crypto';
import { executeWithRetry, parseJSONResponse } from './_gemini.js';

const projectId = process.env.BIGQUERY_PROJECT_ID || 'chronos-stress-sandbox';

const bq = new BigQuery({
  projectId,
  credentials: {
    client_email: process.env.BIGQUERY_CLIENT_EMAIL,
    private_key: process.env.BIGQUERY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

function verifyTeacherJwt(authHeader, secretString) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', secretString)
    .update(`${header}.${payload}`)
    .digest('base64url');

  if (signature !== expectedSignature) return null;

  try {
    const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (decodedPayload.exp && Math.floor(Date.now() / 1000) > decodedPayload.exp) return null;
    return decodedPayload;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  // Handle CORS options request
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const isChatRoute = req.query.route === 'chat' || req.body?.teacherId !== undefined;

  if (isChatRoute) {
    // --- Teacher Chat Logic (formerly chat.js) ---
    try {
      const authHeader = req.headers.authorization;
      const jwtSecret = process.env.JWT_SECRET || 'development-only-secret-key';
      const tokenClaims = verifyTeacherJwt(authHeader, jwtSecret);

      if (!tokenClaims) {
        return res.status(401).json({ error: 'Unauthorized token.' });
      }

      const { message, teacherId, studentId, sessionId, previousInteractionId } = req.body;
      if (!message || !teacherId || !sessionId) {
        return res.status(400).json({ error: 'Missing parameters' });
      }

      if (tokenClaims.teacherId !== teacherId) {
        return res.status(403).json({ error: 'Forbidden authorization payload mismatch.' });
      }

      // Build SQL Statement Context (Using exact schema matching)
      let studentFilterClause = '';
      const queryParams = { teacherId };
      if (studentId) {
        const targetIds = Array.isArray(studentId) ? studentId : [studentId];
        if (targetIds.length > 0) {
          studentFilterClause = `AND v.student_id IN UNNEST(@studentIds)`;
          queryParams.studentIds = targetIds;
        }
      }

      const bqQuery = `
        SELECT TO_JSON_STRING(STRUCT(
          v.student_id as user_id,
          
          (SELECT ARRAY_AGG(STRUCT(h.exam_id, h.subject, h.accuracy, h.avg_time, h.rating_change, h.new_rating, h.created_at) ORDER BY h.created_at DESC LIMIT 5) 
           FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_history\` h
           WHERE h.user_id = v.student_id) as past_5_exams,
           
          (SELECT STRUCT(
             h.exam_id, h.subject, h.accuracy, h.avg_time, h.rating_change, h.new_rating, h.created_at, h.assignment_id,
             r.results_json
           )
           FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_history\` h
           LEFT JOIN \`${projectId}\`.\`chronos_users\`.\`user_exam_results\` r ON h.exam_id = r.exam_id AND h.user_id = r.user_id
           WHERE h.user_id = v.student_id AND h.assignment_id IS NOT NULL AND h.assignment_id != ''
           ORDER BY h.created_at DESC
           LIMIT 1) as last_homework,
           
          (SELECT ARRAY_AGG(STRUCT(m.exam_id, m.subject, m.mistake_patterns)) 
           FROM \`${projectId}\`.\`chronos_users\`.\`user_mistake_analysis\` m
           WHERE m.user_id = v.student_id) as mistakes,
           
          (SELECT ARRAY_AGG(STRUCT(t.subject, t.topic, t.good_at, t.not_good_at)) 
           FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\` t
           WHERE t.user_id = v.student_id) as topics,
           
          (SELECT ARRAY_AGG(STRUCT(w.subject, w.detailed_analysis)) 
           FROM \`${projectId}\`.\`chronos_users\`.\`user_weakness_analysis\` w
           WHERE w.user_id = v.student_id) as weaknesses,
           
          (SELECT ARRAY_AGG(STRUCT(i.lesson_id, i.summary, i.suggestions, i.progress_status)) 
           FROM \`${projectId}\`.\`chronos_users\`.\`student_insights\` i
           WHERE i.student_id = v.student_id) as insights
        )) as json_row
        FROM \`${projectId}\`.\`chronos_users\`.\`teacher_students\` v
        WHERE v.teacher_id = @teacherId ${studentFilterClause}
      `;

      const [bqRows] = await bq.query({
        query: bqQuery,
        params: queryParams
      });

      let contextData = '';
      if (bqRows && bqRows.length > 0) {
        const rawJsonArray = bqRows.map(row => JSON.parse(row.json_row));
        contextData = JSON.stringify(rawJsonArray);
      } else {
        contextData = "[]";
      }

      const hasData = contextData && contextData !== "[]" && contextData !== "[{}]";

      const systemPrompt = `
<role>
You are a diagnostic assistant for the stress-sandbox app.
</role>

<contextual_performance_dataset>
${contextData}
</contextual_performance_dataset>

<dataset_description>
  <dataset_item name="past_5_exams">The student's 5 most recent exam attempts.</dataset_item>
  <dataset_item name="last_homework">The student's last submitted homework assignment (if any), including question results.</dataset_item>
</dataset_description>

<anti_hallucination_protocol>
${hasData ?
          "Synthesize observations strictly from metrics populated in the JSON payload above. Do not invent missing data blocks." :
          "CRITICAL: The context string contains no valid database entries. Explicitly notify the user that no active table records were found for this selection in BigQuery."
        }
</anti_hallucination_protocol>

<instructions>
  <constraint>Keep answers clear, highly metric-accurate, and under 3 sentences.</constraint>
</instructions>`;

      const modelId = process.env.GEMINI_MODEL || 'gemini-3.1-flash';
      const models = [...new Set([modelId, 'gemini-3.1-flash-lite', 'gemini-3-flash-preview'])];

      const input = [{
        type: 'user_input',
        content: [{ type: 'text', text: message }]
      }];

      const interactionOptions = {
        model: undefined, // set per model in retry
        input,
        system_instruction: systemPrompt,
        generation_config: {
          maxOutputTokens: 256,
          temperature: 0.3
        }
      };
      if (previousInteractionId) {
        interactionOptions.previous_interaction_id = previousInteractionId;
      }

      const response = await executeWithRetry(models, (ai, currentModel) => ai.interactions.create({
        ...interactionOptions,
        model: currentModel,
      }), req);

      return res.status(200).json({
        response: response.output_text || 'Sorry, I could not generate a response. Please try again.',
        interactionId: response.id || null,
        _debug: { rowCount: bqRows?.length || 0, studentIdReceived: studentId, teacherId }
      });

    } catch (err) {
      console.error('Chat endpoint error:', err);
      return res.status(500).json({ error: 'Internal Server Error', details: err.message });
    }
  }

  // --- Student Explain Logic (formerly explain.js) ---
  const { question, answer, userAnswer, isCorrect, userQuery, subject, history, previousInteractionId } = req.body;

  if (!previousInteractionId && (!question || answer === undefined || answer === null)) {
    return res.status(400).json({ error: 'Missing question or answer' });
  }

  try {
    let subjectInstructions = 'Represent formulas in LaTeX.';
    const normSubject = String(subject || '').trim().toLowerCase();
    if (normSubject === 'chemistry') {
      subjectInstructions = 'Represent organic molecules strictly using SMILES notation wrapped in <smiles>...</smiles> tags where appropriate (e.g., <smiles>C(C)O</smiles> for ethanol, <smiles>CC(=O)O</smiles> for acetic acid). Represent inorganic molecules, structures, and reaction equations strictly using LaTeX (e.g., $\\text{H}_2\\text{SO}_4$, $\\text{Fe}^{3+}$).';
    }

    let prompt = '';
    if (previousInteractionId) {
      prompt = `<query>${userQuery || 'Explain the correct answer, step-by-step, and why it is correct.'}</query>`;
    } else {
      let historyContext = '';
      if (Array.isArray(history) && history.length > 0) {
        historyContext = '\n\n<conversation_history>\n' + history.map(msg => `  <message sender="${msg.sender === 'user' ? 'User' : 'Tutor'}">${msg.text}</message>`).join('\n') + '\n</conversation_history>';
      }

      prompt = `<role>
You are a world-class tutor in science and mathematics.
</role>

<context>
  <analysis_target>
    <question>${question}</question>
    <correct_answer>${answer}</correct_answer>
    <user_answer>${userAnswer || 'No answer'}</user_answer>
    <attempt_status>${isCorrect ? 'Correct' : 'Incorrect'}</attempt_status>${historyContext}
  </analysis_target>
</context>

<query>
${userQuery || 'Explain the correct answer, step-by-step, and why it is correct.'}
</query>

<tasks>
  <task id="1">
    <description>Provide a highly clear, detailed, and pedagogically sound explanation of the problem, the concepts involved, and why the correct answer is indeed correct.</description>
    <subject_specific_instructions>${subjectInstructions}</subject_specific_instructions>
  </task>
  <task id="2">Critically review the user's answer. If their attempt was marked 'Incorrect', determine if it is actually mathematically, chemically, or scientifically equivalent to the correct answer (for example: minor rounding differences, spelling variations, standard hyphen vs unicode minus sign, spacing or symbol differences, or alternative valid representations). If it is indeed equivalent and correct, set 'shouldRemarkCorrect' to true. Otherwise, set it to false.</task>
</tasks>

<output_requirements>
  <format>json</format>
  <schema>
    {
      "explanation": "Clear, detailed step-by-step explanation (without markdown headers or greetings)",
      "shouldRemarkCorrect": true or false
    }
  </schema>
</output_requirements>`;
    }

    const modelId = 'gemini-3.1-flash-lite';
    const models = [modelId, 'gemini-3-flash-preview'];
    const response = await executeWithRetry(models, (ai, currentModel) => ai.interactions.create({
      model: currentModel,
      input: prompt,
      previous_interaction_id: previousInteractionId || undefined,
      response_format: {
        type: 'text',
        mime_type: 'application/json'
      },
      generation_config: {
        temperature: 0.3
      }
    }), req);

    let explanationText = '';
    let shouldRemarkCorrectVal = false;

    const parsed = parseJSONResponse(response.output_text || '');
    if (parsed) {
      explanationText = parsed.explanation;
      shouldRemarkCorrectVal = parsed.shouldRemarkCorrect || false;
    } else if (response.output_text) {
      console.warn('Failed to parse JSON response from Gemini, using robust extractors as fallback.');
      explanationText = extractExplanationFallback(response.output_text);
      shouldRemarkCorrectVal = extractShouldRemarkCorrectFallback(response.output_text);
    } else {
      explanationText = 'The AI did not return a response. The request may have been blocked by safety filters. Please try again.';
    }

    if (isCorrect) {
      shouldRemarkCorrectVal = false;
    }

    return res.status(200).json({
      explanation: explanationText,
      shouldRemarkCorrect: shouldRemarkCorrectVal,
      interactionId: response.id || null
    });
  } catch (err) {
    console.error('Explanation error:', err);
    const isBusyOrRateLimited = err.status === 503 || err.status === 500 || err.status === 429 ||
      (err.message && (err.message.toLowerCase().includes('demand') ||
        err.message.includes('503') ||
        err.message.includes('500') ||
        err.message.includes('429') ||
        err.message.includes('overloaded') ||
        err.message.includes('rate limit') ||
        err.message.includes('busy') ||
        err.message.includes('limit')));
    if (isBusyOrRateLimited) {
      return res.status(503).json({
        error: "Sorry, the bot is busy right now. Try again later.",
        explanation: "Sorry, the bot is busy right now. Try again later.",
        shouldRemarkCorrect: false
      });
    }
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}

function extractExplanationFallback(text) {
  if (!text) return 'No explanation available.';
  const keyIndex = text.indexOf('"explanation"');
  if (keyIndex === -1) return text;

  const afterKey = text.substring(keyIndex + '"explanation"'.length);
  const colonIndex = afterKey.indexOf(':');
  if (colonIndex === -1) return text;

  const afterColon = afterKey.substring(colonIndex + 1).trim();
  if (!afterColon.startsWith('"')) return text;

  let val = '';
  let escape = false;
  for (let i = 1; i < afterColon.length; i++) {
    const ch = afterColon.charAt(i);
    if (escape) {
      if (ch === 'n') val += '\n';
      else if (ch === 'r') val += '\r';
      else if (ch === 't') val += '\t';
      else val += ch;
      escape = false;
    } else if (ch === '\\') {
      escape = true;
    } else if (ch === '"') {
      return val;
    } else {
      val += ch;
    }
  }
  return val || text;
}

function extractShouldRemarkCorrectFallback(text) {
  if (!text) return false;
  const match = text.match(/"shouldRemarkCorrect"\s*:\s*(true|false)/i);
  if (match) {
    return match[1].toLowerCase() === 'true';
  }
  return false;
}
