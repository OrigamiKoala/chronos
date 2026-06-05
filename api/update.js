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

  const { operatorUsername } = req.body || {};
  if (!operatorUsername) {
    return res.status(400).json({ error: 'operatorUsername is required' });
  }

  const operator = operatorUsername.trim().toLowerCase();

  try {
    // 0. Ensure migration_done column exists
    try {
      await bq.query(`
        ALTER TABLE \`${projectId}\`.\`chronos_users\`.\`users\`
        ADD COLUMN IF NOT EXISTS migration_done BOOL
      `);
    } catch (e) {
      console.warn("Alter table migration_done error or already exists:", e);
    }

    // 1. Verify operator is admin
    const checkOpQuery = `
      SELECT user_role
      FROM \`${projectId}\`.\`chronos_users\`.\`users\`
      WHERE user_id = @operator
    `;
    const [opUsers] = await bq.query({
      query: checkOpQuery,
      params: { operator }
    });

    if (opUsers.length === 0 || opUsers[0].user_role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied. Only admins can run system update scripts.' });
    }

    // 2. Fetch all users who have NOT completed migration yet
    const pendingUsersQuery = `
      SELECT user_id
      FROM \`${projectId}\`.\`chronos_users\`.\`users\`
      WHERE migration_done IS NOT TRUE
    `;
    const [pendingUsers] = await bq.query(pendingUsersQuery);

    if (pendingUsers.length === 0) {
      return res.status(200).json({ success: true, message: 'All users already migrated', updatedCount: 0 });
    }

    const pendingUserIds = pendingUsers.map(u => u.user_id);

    // 3. Fetch all exam results for these pending users done before 2026-06-04 16:21:00 PDT (which is 23:21:00 UTC)
    const resultsQuery = `
      SELECT user_id, exam_id, results_json
      FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`
      WHERE user_id IN UNNEST(@pendingUserIds) AND created_at < '2026-06-04 23:21:00 UTC'
    `;
    const [resultRows] = await bq.query({
      query: resultsQuery,
      params: { pendingUserIds }
    });

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

    // 4. Mark all pending users as migrated
    const markDoneQuery = `
      UPDATE \`${projectId}\`.\`chronos_users\`.\`users\`
      SET migration_done = true
      WHERE user_id IN UNNEST(@pendingUserIds)
    `;
    await bq.query({
      query: markDoneQuery,
      params: { pendingUserIds }
    });

    return res.status(200).json({ success: true, updatedCount });
  } catch (err) {
    console.error('Migration error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
