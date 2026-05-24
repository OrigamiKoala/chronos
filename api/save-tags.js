/* eslint-disable */
import { BigQuery } from '@google-cloud/bigquery';

const projectId = process.env.BIGQUERY_PROJECT_ID || 'chronos-stress-sandbox';

const bq = new BigQuery({
  projectId: projectId,
  credentials: {
    client_email: process.env.BIGQUERY_CLIENT_EMAIL,
    private_key: process.env.BIGQUERY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, examId, tags } = req.body;

  if (!username || !examId || !Array.isArray(tags) || tags.length === 0) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const sanitizedUser = username.trim().toLowerCase();

  try {
    // Ensure table exists
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS \`${projectId}\`.\`chronos_users\`.\`user_problem_tags\` (
        user_id STRING NOT NULL,
        exam_id STRING NOT NULL,
        question_index INT64 NOT NULL,
        tag STRING NOT NULL,
        is_correct BOOL NOT NULL,
        points_value FLOAT64,
        created_at TIMESTAMP NOT NULL
      )
    `;
    await bq.query(createTableQuery);

    // Delete any existing tags for this exam (allows re-tagging)
    const deleteQuery = `
      DELETE FROM \`${projectId}\`.\`chronos_users\`.\`user_problem_tags\`
      WHERE user_id = @username AND exam_id = @examId
    `;
    await bq.query({
      query: deleteQuery,
      params: { username: sanitizedUser, examId }
    });

    // Insert all tags
    for (const t of tags) {
      const insertQuery = `
        INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_problem_tags\`
          (user_id, exam_id, question_index, tag, is_correct, points_value, created_at)
        VALUES
          (@username, @examId, @questionIndex, @tag, @isCorrect, @pointsValue, CURRENT_TIMESTAMP())
      `;
      await bq.query({
        query: insertQuery,
        params: {
          username: sanitizedUser,
          examId,
          questionIndex: t.questionIndex,
          tag: t.tag,
          isCorrect: t.isCorrect,
          pointsValue: t.pointsValue || 0
        }
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Save tags error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
