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

  const { username, examId, questionId, explanation } = req.body;

  if (!username || !examId || !questionId || !explanation) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const sanitizedUser = username.trim().toLowerCase();

  try {
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

    if (!examRows || examRows.length === 0) {
      return res.status(404).json({ error: 'Exam results not found' });
    }

    const results = JSON.parse(examRows[0].results_json);

    let questionFound = false;
    for (const r of results) {
      if (r.id === questionId) {
        r.aiExplanation = explanation;
        questionFound = true;
        break;
      }
    }

    if (!questionFound) {
      return res.status(404).json({ error: 'Question not found in this exam' });
    }

    await bq.query({
      query: `UPDATE \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`
        SET results_json = @resultsJson
        WHERE exam_id = @examId AND user_id = @username`,
      params: { examId, username: sanitizedUser, resultsJson: JSON.stringify(results) }
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Save explanation error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
