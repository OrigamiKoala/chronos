import { BigQuery } from '@google-cloud/bigquery';

const projectId = process.env.BIGQUERY_PROJECT_ID || 'chronos-stress-sandbox';
const bq = new BigQuery({
  projectId: projectId,
  credentials: {
    client_email: process.env.BIGQUERY_CLIENT_EMAIL,
    private_key: process.env.BIGQUERY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

async function main() {
  const targetUser = 'origamikoala';
  const newRole = 'admin';
  const organization = 'Rancho MATHCOUNTS';

  console.log(`Checking/Promoting ${targetUser} to ${newRole} for organization "${organization}"...`);

  try {
    const checkQuery = `
      SELECT user_id, user_role, user_organization
      FROM \`${projectId}\`.\`chronos_users\`.\`users\`
      WHERE user_id = @username
    `;
    const [rows] = await bq.query({
      query: checkQuery,
      params: { username: targetUser }
    });

    if (rows.length === 0) {
      console.log(`User ${targetUser} not found in database. Inserting as admin...`);
      const insertQuery = `
        INSERT INTO \`${projectId}\`.\`chronos_users\`.\`users\` (user_id, created_at, password, recovery_question, recovery_answer, math_rating, physics_rating, chemistry_rating, elo_version, user_role, user_organization)
        VALUES (@username, CURRENT_TIMESTAMP(), 'adminpass123', 'Default Question', 'Default Answer', 100, 100, 100, 3, @role, @org)
      `;
      await bq.query({
        query: insertQuery,
        params: { username: targetUser, role: newRole, org: organization }
      });
      console.log(`User ${targetUser} created and promoted.`);
    } else {
      console.log(`User ${targetUser} found. Current: role=${rows[0].user_role}, org=${rows[0].user_organization}. Updating...`);
      const updateQuery = `
        UPDATE \`${projectId}\`.\`chronos_users\`.\`users\`
        SET user_role = @role, user_organization = @org
        WHERE user_id = @username
      `;
      await bq.query({
        query: updateQuery,
        params: {
          role: newRole,
          org: organization,
          username: targetUser
        }
      });
      console.log(`User ${targetUser} updated to admin.`);
    }
  } catch (err) {
    console.error("Failed to promote user:", err);
    process.exit(1);
  }
}

main();
