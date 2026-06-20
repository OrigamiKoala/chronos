import { BigQuery } from '@google-cloud/bigquery';
import { executeWithRetry } from './_gemini.js';
import crypto from 'crypto';

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
  } catch (err) {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    const jwtSecret = process.env.JWT_SECRET || 'development-only-secret-key';
    const tokenClaims = verifyTeacherJwt(authHeader, jwtSecret);

    if (!tokenClaims) {
      return res.status(401).json({ error: 'Unauthorized token.' });
    }

    const { message, teacherId, studentId, sessionId, history } = req.body;
    if (!message || !teacherId || !sessionId) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    if (tokenClaims.teacherId !== teacherId) {
      return res.status(403).json({ error: 'Forbidden authorization payload mismatch.' });
    }

    // Build SQL Statement Context (Using exact schema matching)
    let studentFilterClause = '';
    if (studentId) {
      const targetIds = Array.isArray(studentId) ? studentId : [studentId];
      if (targetIds.length > 0) {
        const idList = targetIds.map(id => `'${id}'`).join(',');
        studentFilterClause = `AND v.student_id IN (${idList})`;
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
      params: { teacherId }
    });

    let contextData = '';
    if (bqRows && bqRows.length > 0) {
      const rawJsonArray = bqRows.map(row => JSON.parse(row.json_row));
      contextData = JSON.stringify(rawJsonArray);
    } else {
      contextData = "[]";
    }

    const hasData = contextData && contextData !== "[]" && contextData !== "[{}]";

    const systemPrompt = `You are a diagnostic assistant for the stress-sandbox app.
Contextual Performance Dataset: ${contextData}

The dataset includes:
- "past_5_exams": The student's 5 most recent exam attempts.
- "last_homework": The student's last submitted homework assignment (if any), including question results.

ANTI-HALLUCINATION PROTOCOL:
- ${hasData ?
        "Synthesize observations strictly from metrics populated in the JSON payload above. Do not invent missing data blocks." :
        "CRITICAL: The context string contains no valid database entries. Explicitly notify the user that no active table records were found for this selection in BigQuery."
      }
Keep answers clear, highly metric-accurate, and under 3 sentences.`;

    const modelId = process.env.GEMINI_MODEL || 'gemini-3.1-flash';
    const models = [...new Set([modelId, 'gemini-3.1-flash-lite', 'gemini-3-flash-preview'])];

    const contents = [];
    if (Array.isArray(history)) {
      for (const msg of history) {
        if (msg.text && msg.sender) {
          contents.push({
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
          });
        }
      }
    }
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const response = await executeWithRetry(models, (ai, currentModel) => ai.models.generateContent({
      model: currentModel,
      contents: contents,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 256,
        temperature: 0.3
      }
    }), req);

    return res.status(200).json({
      response: response.text,
      _debug: { rowCount: bqRows?.length || 0, studentIdReceived: studentId, teacherId }
    });

  } catch (err) {
    console.error('Chat endpoint error:', err);
    return res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
}
