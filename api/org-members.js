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
  if (req.method === 'GET') {
    const { organization } = req.query;
    if (!organization || organization.trim() === '') {
      return res.status(200).json({ members: [] });
    }

    try {
      const query = `
        SELECT user_id, user_role, user_organization, math_rating, physics_rating, chemistry_rating, created_at
        FROM \`${projectId}\`.\`chronos_users\`.\`users\`
        WHERE user_organization = @organization
        ORDER BY user_id ASC
      `;
      const [members] = await bq.query({
        query,
        params: { organization: organization.trim() }
      });

      return res.status(200).json({ members });
    } catch (err) {
      console.error('Error fetching org members:', err);
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  if (req.method === 'POST') {
    const { targetUsername, userRole, userOrganization, operatorUsername } = req.body;
    if (!targetUsername || !operatorUsername) {
      return res.status(400).json({ error: 'targetUsername and operatorUsername are required' });
    }

    const operator = operatorUsername.trim().toLowerCase();
    const targets = targetUsername.split(',')
      .map(name => name.trim().toLowerCase())
      .filter(name => name !== '');

    if (targets.length === 0) {
      return res.status(400).json({ error: 'No valid target usernames provided' });
    }

    try {
      // Verify operator is an admin in the target user's organization
      const checkOpQuery = `
        SELECT user_role, user_organization
        FROM \`${projectId}\`.\`chronos_users\`.\`users\`
        WHERE user_id = @operator
      `;
      const [opUsers] = await bq.query({
        query: checkOpQuery,
        params: { operator }
      });

      if (opUsers.length === 0) {
        return res.status(403).json({ error: 'Operator user not found' });
      }

      const opUser = opUsers[0];
      if (opUser.user_role !== 'admin') {
        return res.status(403).json({ error: 'Permission denied. Only admins can update user profiles.' });
      }

      // Fetch target users' organization to ensure they belong to the same organization
      const checkTargetQuery = `
        SELECT user_id, user_organization
        FROM \`${projectId}\`.\`chronos_users\`.\`users\`
        WHERE user_id IN UNNEST(@targets)
      `;
      const [targetUsers] = await bq.query({
        query: checkTargetQuery,
        params: { targets }
      });

      if (targetUsers.length === 0) {
        return res.status(404).json({ error: 'Target users not found' });
      }

      for (const targetUser of targetUsers) {
        if (targetUser.user_organization && targetUser.user_organization !== opUser.user_organization) {
          return res.status(403).json({ error: `Permission denied. User ${targetUser.user_id} belongs to a different organization.` });
        }
      }

      // Perform bulk update
      const cleanRole = userRole ? userRole.trim() : null;
      const cleanOrg = userOrganization ? userOrganization.trim() : opUser.user_organization;
      const foundUserIds = targetUsers.map(u => u.user_id);

      const updateQuery = `
        UPDATE \`${projectId}\`.\`chronos_users\`.\`users\`
        SET user_role = @role, user_organization = @org
        WHERE user_id IN UNNEST(@foundUserIds)
      `;

      await bq.query({
        query: updateQuery,
        params: {
          role: cleanRole,
          org: cleanOrg,
          foundUserIds
        },
        types: {
          role: 'STRING',
          org: 'STRING'
        }
      });

      return res.status(200).json({ success: true, updated: foundUserIds, role: cleanRole, organization: cleanOrg });
    } catch (err) {
      console.error('Error updating members:', err);
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
