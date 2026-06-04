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
    const resultsQuery = `
      SELECT results_json
      FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`
      WHERE exam_id = @examId
      LIMIT 1
    `;
    const mistakeQuery = `
      SELECT mistake_patterns
      FROM \`${projectId}\`.\`chronos_users\`.\`user_mistake_analysis\`
      WHERE exam_id = @examId
      LIMIT 1
    `;
    const tagsQuery = `
      SELECT question_index, tag
      FROM \`${projectId}\`.\`chronos_users\`.\`user_problem_tags\`
      WHERE exam_id = @examId
      ORDER BY question_index ASC
    `;

    const params = { examId };
    const [resultsResult, mistakeResult, tagsResult] = await Promise.allSettled([
      bq.query({ query: resultsQuery, params }),
      bq.query({ query: mistakeQuery, params }),
      bq.query({ query: tagsQuery, params })
    ]);

    // Results are required
    if (resultsResult.status !== 'fulfilled' || resultsResult.value[0].length === 0) {
      return res.status(404).json({ error: 'Exam results not found' });
    }
    const results = JSON.parse(resultsResult.value[0][0].results_json);

    // Mistakes are optional
    const mistakeRows = mistakeResult.status === 'fulfilled' ? mistakeResult.value[0] : [];
    const mistakePatterns = mistakeRows.length > 0 ? mistakeRows[0].mistake_patterns : null;

    // Tags are optional
    const tagRows = tagsResult.status === 'fulfilled' ? tagsResult.value[0] : [];
    const savedTags = tagRows.map(r => {
      let qIdx = r.question_index;
      if (qIdx !== null && qIdx !== undefined) {
        if (typeof qIdx === 'object' && qIdx.value !== undefined) {
          qIdx = parseInt(qIdx.value, 10);
        } else if (typeof qIdx === 'bigint') {
          qIdx = Number(qIdx);
        } else {
          qIdx = parseInt(qIdx, 10);
        }
      }
      return { questionIndex: qIdx, tag: r.tag };
    });

    return res.status(200).json({ results, mistakePatterns, savedTags });
  } catch (err) {
    console.error('Get exam error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
