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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { examId } = req.query;
  if (!examId) {
    return res.status(400).json({ error: 'Exam ID is required' });
  }

  try {
    const query = `
      SELECT results_json
      FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`
      WHERE exam_id = @examId
      LIMIT 1
    `;
    const [rows] = await bq.query({
      query,
      params: { examId }
    });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Exam results not found' });
    }

    const results = JSON.parse(rows[0].results_json);
    return res.status(200).json({ results });
  } catch (err) {
    console.error('Get exam error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
