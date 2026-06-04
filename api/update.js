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

  try {
    // Only fetch tests done before 2026-06-04 16:21:00 PDT (which is 23:21:00 UTC)
    const resultsQuery = `
      SELECT user_id, exam_id, results_json
      FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`
      WHERE created_at < '2026-06-04 23:21:00 UTC'
    `;
    const [resultRows] = await bq.query({ query: resultsQuery });

    let updatedCount = 0;
    for (const row of resultRows) {
      let results;
      try {
        results = JSON.parse(row.results_json);
      } catch (e) {
        continue;
      }

      if (!Array.isArray(results)) continue;

      const alreadyMigrated = results.some(r => Array.isArray(r.intervals));
      if (alreadyMigrated) continue;

      let cursor = 0;
      const migratedResults = results.map(r => {
        const duration = Number(r.timeSpent) || 0;
        const start = cursor;
        const end = cursor + duration;
        cursor = end;
        return {
          ...r,
          intervals: [{ start, end }]
        };
      });

      await bq.query({
        query: `
          UPDATE \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`
          SET results_json = @resultsJson
          WHERE user_id = @username AND exam_id = @examId
        `,
        params: {
          resultsJson: JSON.stringify(migratedResults),
          username: row.user_id,
          examId: row.exam_id
        }
      });
      updatedCount++;
    }

    return res.status(200).json({ success: true, updatedCount });
  } catch (err) {
    console.error('Migration error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
