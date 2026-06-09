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

  const { username, step, answer, newPassword } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const sanitizedUser = username.trim().toLowerCase();

  try {
    // 1. Fetch user recovery details
    const checkQuery = `
      SELECT password, recovery_question, recovery_answer 
      FROM \`${projectId}\`.\`chronos_users\`.\`users\`
      WHERE user_id = @username
    `;
    const [existingUsers] = await bq.query({
      query: checkQuery,
      params: { username: sanitizedUser }
    });

    if (existingUsers.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = existingUsers[0];

    if (step === 1) {
      if (!user.recovery_question) {
        return res.status(400).json({ error: 'No password recovery question set for this user' });
      }
      return res.status(200).json({ recoveryQuestion: user.recovery_question });
    }

    if (step === 2) {
      if (!answer || !newPassword) {
        return res.status(400).json({ error: 'Answer and new password are required' });
      }

      const cleanDbAnswer = String(user.recovery_answer || '').trim().toLowerCase();
      const cleanUserAnswer = String(answer).trim().toLowerCase();

      if (!cleanDbAnswer || !cleanUserAnswer || cleanDbAnswer !== cleanUserAnswer) {
        return res.status(400).json({ error: 'Incorrect answer to recovery question' });
      }

      // Update password
      const updateQuery = `
        UPDATE \`${projectId}\`.\`chronos_users\`.\`users\`
        SET password = @newPassword
        WHERE user_id = @username
      `;
      await bq.query({
        query: updateQuery,
        params: { username: sanitizedUser, newPassword }
      });

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Invalid step' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
