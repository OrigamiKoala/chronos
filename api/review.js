import { BigQuery } from '@google-cloud/bigquery';
import { executeWithRetry, parseJSONResponse } from './_gemini.js';

const projectId = process.env.BIGQUERY_PROJECT_ID || 'chronos-stress-sandbox';

const bq = new BigQuery({
  projectId: projectId,
  credentials: {
    client_email: process.env.BIGQUERY_CLIENT_EMAIL,
    private_key: process.env.BIGQUERY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

let schemaEnsured = false;

export default async function handler(req, res) {
  // Ensure table updates are applied on startup (once per cold start)
  if (!schemaEnsured) {
    try {
      await bq.query(`
        ALTER TABLE \`${projectId}\`.\`chronos_users\`.\`user_wrong_problems\`
        ADD COLUMN IF NOT EXISTS options STRING,
        ADD COLUMN IF NOT EXISTS question_type STRING,
        ADD COLUMN IF NOT EXISTS ai_explanation STRING,
        ADD COLUMN IF NOT EXISTS repetitions INT64,
        ADD COLUMN IF NOT EXISTS interval_days INT64,
        ADD COLUMN IF NOT EXISTS ease_factor FLOAT64,
        ADD COLUMN IF NOT EXISTS next_review_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS frq_submission_json STRING
      `);
      schemaEnsured = true;
    } catch (err) {
      console.warn("Alter table error in review.js startup:", err);
    }
  }

  if (req.method === 'GET') {
    const { username } = req.query;
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }
    const sanitizedUser = username.trim().toLowerCase();

    try {
      // Fetch wrong problems, tags, and exam results in a single consolidated query using UNION ALL
      const consolidatedQuery = `
        WITH wrongProblems AS (
          SELECT 'wrong' AS type, TO_JSON_STRING(STRUCT(
            exam_id, question_id, subject, topic, question_text, user_answer, correct_answer, created_at,
            options, question_type, ai_explanation, repetitions, interval_days, ease_factor, next_review_at,
            frq_submission_json
          )) AS data
          FROM \`${projectId}\`.\`chronos_users\`.\`user_wrong_problems\`
          WHERE user_id = @username
        ),
        tags AS (
          SELECT 'tags' AS type, TO_JSON_STRING(STRUCT(exam_id, question_index, tag)) AS data
          FROM \`${projectId}\`.\`chronos_users\`.\`user_problem_tags\`
          WHERE user_id = @username
        ),
        results AS (
          SELECT 'results' AS type, TO_JSON_STRING(STRUCT(exam_id, results_json)) AS data
          FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`
          WHERE user_id = @username
        )
        SELECT type, data FROM wrongProblems
        UNION ALL
        SELECT type, data FROM tags
        UNION ALL
        SELECT type, data FROM results
      `;

      const [rows] = await bq.query({
        query: consolidatedQuery,
        params: { username: sanitizedUser }
      });

      const wrongRows = [];
      const tagRows = [];
      const resultsRows = [];

      for (const r of rows) {
        try {
          const parsed = JSON.parse(r.data);
          if (r.type === 'wrong') wrongRows.push(parsed);
          else if (r.type === 'tags') tagRows.push(parsed);
          else if (r.type === 'results') resultsRows.push(parsed);
        } catch (parseErr) {
          console.error("Failed to parse row data in review query:", r, parseErr);
        }
      }

      // Build mapping structures:
      // Map: exam_id -> question_id -> questionIndex (index in results_json)
      const indexMap = {};
      const resultsMap = {}; // exam_id -> results array
      for (const row of resultsRows) {
        try {
          const results = JSON.parse(row.results_json || '[]');
          resultsMap[row.exam_id] = results;
          indexMap[row.exam_id] = {};
          results.forEach((q, idx) => {
            if (q && q.id) {
              indexMap[row.exam_id][q.id] = idx;
            }
          });
        } catch (e) {
          console.error("Failed to parse results_json for exam:", row.exam_id, e);
        }
      }

      // Map: exam_id -> questionIndex -> tag
      const tagMap = {};
      for (const tagRow of tagRows) {
        if (!tagMap[tagRow.exam_id]) {
          tagMap[tagRow.exam_id] = {};
        }
        tagMap[tagRow.exam_id][Number(tagRow.question_index)] = tagRow.tag;
      }

      // Construct return array
      const consolidated = wrongRows.map(w => {
        const examId = w.exam_id;
        const qId = w.question_id;

        // Find index of this question in the exam
        const idx = (indexMap[examId] && indexMap[examId][qId] !== undefined) ? indexMap[examId][qId] : -1;
        const tag = (idx !== -1 && tagMap[examId] && tagMap[examId][idx]) ? tagMap[examId][idx] : null;

        // Fallback fields for legacy questions
        let options = null;
        try {
          options = w.options ? JSON.parse(w.options) : null;
        } catch {
          console.warn("Failed to parse options string", w.options);
        }
        let questionType = w.question_type || 'multiple_choice';
        let aiExplanation = w.ai_explanation || null;
        let frqSubmission = null;
        try {
          frqSubmission = w.frq_submission_json ? JSON.parse(w.frq_submission_json) : null;
        } catch {
          console.warn("Failed to parse frq_submission_json", w.frq_submission_json);
        }

        if (idx !== -1 && resultsMap[examId] && resultsMap[examId][idx]) {
          const qObj = resultsMap[examId][idx];
          if (!options && qObj.options) {
            options = qObj.options;
          }
          if (!w.question_type && qObj.type) {
            questionType = qObj.type;
          }
          if (!aiExplanation && qObj.aiExplanation) {
            aiExplanation = qObj.aiExplanation;
          }
          // Fallback: pull frq submission from results_json if not stored directly
          if (!w.frq_submission_json && qObj.frqSubmission) {
            frqSubmission = qObj.frqSubmission;
          }
        }

        return {
          exam_id: examId,
          question_id: qId,
          subject: w.subject,
          topic: w.topic,
          question_text: w.question_text,
          options,
          question_type: questionType,
          user_answer: w.user_answer,
          correct_answer: w.correct_answer,
          ai_explanation: aiExplanation,
          frq_submission: frqSubmission,
          tag,
          created_at: w.created_at?.value || w.created_at,
          spaced_rep: {
            repetitions: w.repetitions !== null ? Number(w.repetitions) : 0,
            interval_days: w.interval_days !== null ? Number(w.interval_days) : 0,
            ease_factor: w.ease_factor !== null ? Number(w.ease_factor) : 2.5,
            next_review_at: w.next_review_at?.value || w.next_review_at || w.created_at?.value || w.created_at
          }
        };
      });

      return res.status(200).json(consolidated);
    } catch (err) {
      console.error('Fetch review questions error:', err);
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  if (req.method === 'POST') {
    const { action } = req.query;

    if (action === 'submit-results') {
      const { username, reviews } = req.body;
      if (!username || !Array.isArray(reviews)) {
        return res.status(400).json({ error: 'Missing username or reviews list' });
      }
      const sanitizedUser = username.trim().toLowerCase();

      try {
        for (const review of reviews) {
          const { questionId, isCorrect } = review;
          if (!questionId) continue;

          // Fetch current SM-2 state
          const stateQuery = `
            SELECT repetitions, interval_days, ease_factor
            FROM \`${projectId}\`.\`chronos_users\`.\`user_wrong_problems\`
            WHERE user_id = @username AND question_id = @questionId
            LIMIT 1
          `;
          const [rows] = await bq.query({
            query: stateQuery,
            params: { username: sanitizedUser, questionId }
          });

          let repetitions = 0;
          let interval_days = 0;
          let ease_factor = 2.5;

          if (rows && rows.length > 0) {
            repetitions = rows[0].repetitions !== null ? Number(rows[0].repetitions) : 0;
            interval_days = rows[0].interval_days !== null ? Number(rows[0].interval_days) : 0;
            ease_factor = rows[0].ease_factor !== null ? Number(rows[0].ease_factor) : 2.5;
          }

          // Apply SM-2 algorithm
          if (isCorrect) {
            repetitions += 1;
            if (repetitions === 1) {
              interval_days = 1;
            } else if (repetitions === 2) {
              interval_days = 6;
            } else {
              interval_days = Math.round(interval_days * ease_factor);
            }
            ease_factor = ease_factor + 0.1;
          } else {
            repetitions = 0;
            interval_days = 1;
            ease_factor = Math.max(1.3, ease_factor - 0.2);
          }
          ease_factor = Math.min(3.0, Math.max(1.3, ease_factor));

          // Update user_wrong_problems row
          const updateQuery = `
            UPDATE \`${projectId}\`.\`chronos_users\`.\`user_wrong_problems\`
            SET repetitions = @repetitions,
                interval_days = @intervalDays,
                ease_factor = @easeFactor,
                next_review_at = TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL @intervalDays DAY)
            WHERE user_id = @username AND question_id = @questionId
          `;
          await bq.query({
            query: updateQuery,
            params: {
              username: sanitizedUser,
              questionId,
              repetitions,
              intervalDays: interval_days,
              easeFactor: ease_factor
            }
          });
        }

        return res.status(200).json({ success: true });
      } catch (err) {
        console.error('Submit review results error:', err);
        return res.status(500).json({ error: err.message || 'Internal Server Error' });
      }
    }

    if (action === 'ask-explanation') {
      const { username, examId, questionId, questionText, correctAnswer, userAnswer, subject } = req.body;
      if (!username || !examId || !questionId || !questionText) {
        return res.status(400).json({ error: 'Missing required request parameters' });
      }
      const sanitizedUser = username.trim().toLowerCase();

      try {
        let subjectInstructions = 'Represent formulas in LaTeX.';
        const normSubject = String(subject || '').trim().toLowerCase();
        if (normSubject === 'chemistry') {
          subjectInstructions = 'Represent organic molecules strictly using SMILES notation wrapped in <smiles>...</smiles> tags where appropriate (e.g., <smiles>C(C)O</smiles> for ethanol, <smiles>CC(=O)O</smiles> for acetic acid). Represent inorganic molecules, structures, and reaction equations strictly using LaTeX (e.g., $\\text{H}_2\\text{SO}_4$, $\\text{Fe}^{3+}$).';
        }

        const prompt = `
<role>
You are a world-class tutor in science and mathematics.
</role>

<context>
Analyze this exam question:
Question: ${questionText}
Correct Answer: ${correctAnswer}
User's Answer: ${userAnswer || 'No answer'}
User's Attempt Was: Incorrect
</context>

The user is asking: Explain the correct answer, step-by-step, and why it is correct.

<tasks>
1. Provide a highly clear, detailed, and pedagogically sound explanation of the problem, the concepts involved, and why the correct answer is indeed correct. ${subjectInstructions}
2. Set shouldRemarkCorrect to false.
</tasks>

<output_requirements>
Return strictly a valid JSON object with the following schema:
{
  "explanation": "Clear, detailed step-by-step explanation (without markdown headers or greetings)",
  "shouldRemarkCorrect": false
}
Do NOT include markdown formatting, backticks, or any conversational text. Return ONLY the raw JSON object.
</output_requirements>`;

        const modelId = 'gemini-3.1-flash-lite';
        const models = [modelId, 'gemini-3-flash-preview'];
        const response = await executeWithRetry(models, (ai, currentModel) => ai.interactions.create({
          model: currentModel,
          input: prompt,
          response_format: {
            type: 'text',
            mime_type: 'application/json'
          },
          generation_config: {
            temperature: 0.3
          }
        }), req);

        let explanationText = '';
        const parsed = parseJSONResponse(response.output_text || '');
        if (parsed) {
          explanationText = parsed.explanation;
        } else if (response.output_text) {
          explanationText = response.output_text;
        } else {
          explanationText = 'The AI did not return a response. Please try again.';
        }

        // Update BOTH user_wrong_problems AND user_exam_results in parallel
        const updateWrongQuery = `
          UPDATE \`${projectId}\`.\`chronos_users\`.\`user_wrong_problems\`
          SET ai_explanation = @explanation
          WHERE user_id = @username AND question_id = @questionId
        `;
        const wrongPromise = bq.query({
          query: updateWrongQuery,
          params: { username: sanitizedUser, questionId, explanation: explanationText }
        });

        const resultsPromise = (async () => {
          const getResultsQuery = `
            SELECT results_json
            FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`
            WHERE exam_id = @examId AND user_id = @username
            LIMIT 1
          `;
          const [examRows] = await bq.query({
            query: getResultsQuery,
            params: { examId, username: sanitizedUser }
          });

          if (examRows && examRows.length > 0) {
            const results = JSON.parse(examRows[0].results_json || '[]');
            let questionFound = false;
            for (const r of results) {
              if (r.id === questionId) {
                r.aiExplanation = explanationText;
                questionFound = true;
                break;
              }
            }
            if (questionFound) {
              await bq.query({
                query: `UPDATE \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`
                  SET results_json = @resultsJson
                  WHERE exam_id = @examId AND user_id = @username`,
                params: {
                  examId,
                  username: sanitizedUser,
                  resultsJson: JSON.stringify(results)
                }
              });
            }
          }
        })();

        await Promise.all([wrongPromise, resultsPromise]);

        return res.status(200).json({ explanation: explanationText });
      } catch (err) {
        console.error('Explanation generation error:', err);
        return res.status(500).json({ error: err.message || 'Internal Server Error' });
      }
    }

    return res.status(400).json({ error: 'Invalid action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
