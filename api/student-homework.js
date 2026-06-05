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

  const { organization, username } = req.query;
  if (!organization || !username) {
    return res.status(400).json({ error: 'Missing organization or username' });
  }

  const sanitizedUser = username.trim().toLowerCase();
  const org = organization.trim();

  try {
    const query = `
      SELECT a.assignment_id, a.title, a.subject, a.num_questions, a.starting_difficulty, a.exam_format, a.time_limit_style, a.time_limit_value, a.stress_mode, a.due_date, l.title as lesson_title
      FROM \`${projectId}\`.\`chronos_users\`.\`homework_assignments\` a
      JOIN \`${projectId}\`.\`chronos_users\`.\`lessons\` l ON a.lesson_id = l.lesson_id
      LEFT JOIN \`${projectId}\`.\`chronos_users\`.\`user_exam_history\` h ON a.assignment_id = h.assignment_id AND h.user_id = @username
      WHERE l.organization = @organization AND h.assignment_id IS NULL
      ORDER BY a.due_date ASC
    `;

    const [assignments] = await bq.query({
      query,
      params: { organization: org, username: sanitizedUser }
    });

    return res.status(200).json({ assignments });
  } catch (err) {
    console.error('Error fetching student homework:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
