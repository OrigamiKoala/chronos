import { BigQuery } from '@google-cloud/bigquery';

const projectId = process.env.BIGQUERY_PROJECT_ID || 'chronos-stress-sandbox';

const bq = new BigQuery({
  projectId,
  credentials: {
    client_email: process.env.BIGQUERY_CLIENT_EMAIL,
    private_key: process.env.BIGQUERY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { count, subject, targetUserId = 'default_user', examFormat } = req.body;
  const difficulty = Number(req.body.difficulty !== undefined ? req.body.difficulty : 5);

  if (!count || (difficulty !== 0 && !difficulty) || !subject) {
    return res.status(400).json({ error: 'Missing required parameters: count, difficulty, subject' });
  }

  const sanitizedUser = String(targetUserId).trim().toLowerCase();
  const normSubject = String(subject).trim().toLowerCase();

  const allowedTypes = Array.isArray(examFormat)
    ? examFormat
    : (typeof examFormat === 'string' && examFormat.trim()
      ? (examFormat.includes(',') ? examFormat.split(',') : [examFormat])
      : ['multiple_choice', 'short_answer', 'free_response']);
  const parsedTypes = allowedTypes.map(t => t.trim()).filter(Boolean);

  try {
    const fallbackQuery = `
      WITH doneQuestions AS (
        SELECT DISTINCT JSON_VALUE(q, '$.id') AS qid
        FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`,
        UNNEST(JSON_EXTRACT_ARRAY(results_json)) AS q
        WHERE user_id = @targetUserId AND @targetUserId != 'default_user'
      )
      SELECT question_json
      FROM \`${projectId}\`.\`chronos_users\`.\`pregenerated_questions\`
      WHERE subject = @subject
        AND (
          @targetUserId = 'default_user'
          OR JSON_VALUE(question_json, '$.id') NOT IN (SELECT qid FROM doneQuestions)
        )
      ORDER BY 
        CASE WHEN type IN UNNEST(@allowedTypes) THEN 0 ELSE 1 END,
        ABS(difficulty - @difficulty) ASC,
        RAND()
      LIMIT @count
    `;

    const [rows] = await bq.query({
      query: fallbackQuery,
      params: {
        subject: normSubject || subject,
        difficulty: difficulty,
        targetUserId: sanitizedUser,
        allowedTypes: parsedTypes,
        count: Number(count)
      },
      types: {
        allowedTypes: ['STRING'],
        count: 'INT64'
      }
    });

    const questions = [];
    if (rows && rows.length > 0) {
      for (const r of rows) {
        try {
          questions.push(JSON.parse(r.question_json));
        } catch (parseErr) {
          console.error('Error parsing fallback question JSON:', parseErr);
        }
      }
    }

    return res.status(200).json(questions);
  } catch (err) {
    console.error('Fallback questions endpoint error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
