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
    // Forcing direct stream mapping bypasses anonymous table caching lookups
    const stream = bq.createQueryStream({
      query,
      params: { examId },
      location: 'US'
    });
    const rows = [];
    for await (const row of stream) {
      rows.push(row);
    }

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Exam results not found' });
    }

    const results = JSON.parse(rows[0].results_json);

    // Query mistake patterns if table exists
    let mistakePatterns = null;
    try {
      const mistakeQuery = `
        SELECT mistake_patterns
        FROM \`${projectId}\`.\`chronos_users\`.\`user_mistake_analysis\`
        WHERE exam_id = @examId
        LIMIT 1
      `;
      // Forcing direct stream mapping bypasses anonymous table caching lookups
      const streamMistakes = bq.createQueryStream({
        query: mistakeQuery,
        params: { examId },
        location: 'US'
      });
      const mistakeRows = [];
      for await (const row of streamMistakes) {
        mistakeRows.push(row);
      }
      if (mistakeRows.length > 0) {
        mistakePatterns = mistakeRows[0].mistake_patterns;
      }
    } catch {
      // ignore if table doesn't exist or query fails
    }

    // Query saved tags if table exists
    let savedTags = [];
    try {
      const tagsQuery = `
        SELECT question_index, tag
        FROM \`${projectId}\`.\`chronos_users\`.\`user_problem_tags\`
        WHERE exam_id = @examId
        ORDER BY question_index ASC
      `;
      // Forcing direct stream mapping bypasses anonymous table caching lookups
      const streamTags = bq.createQueryStream({
        query: tagsQuery,
        params: { examId },
        location: 'US'
      });
      const tagRows = [];
      for await (const row of streamTags) {
        tagRows.push(row);
      }
      savedTags = tagRows.map(r => ({ questionIndex: r.question_index, tag: r.tag }));
    } catch {
      // ignore if table doesn't exist
    }

    return res.status(200).json({ results, mistakePatterns, savedTags });
  } catch (err) {
    console.error('Get exam error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
