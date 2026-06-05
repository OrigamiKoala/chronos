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
    const { username } = req.query;
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const sanitizedUser = username.trim().toLowerCase();

    try {
      // 1. Verify user is a teacher or admin and get organization
      const checkUserQuery = `
        SELECT user_role, user_organization
        FROM \`${projectId}\`.\`chronos_users\`.\`users\`
        WHERE user_id = @username
      `;
      const [users] = await bq.query({
        query: checkUserQuery,
        params: { username: sanitizedUser }
      });

      if (users.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = users[0];
      if (user.user_role !== 'teacher' && user.user_role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Only coaches and admins can access teacher portal data.' });
      }

      const organization = user.user_organization;
      if (!organization) {
        return res.status(200).json({
          orgStudents: [],
          claimedStudentIds: [],
          lessons: [],
          assignments: [],
          submissions: [],
          collectiveStats: { avgMath: 100, avgPhys: 100, avgChem: 100, overallAvg: 100, totalExams: 0, avgAccuracy: 0, strengths: [], weaknesses: [] }
        });
      }

      // 2. Fetch all organization students
      const getOrgStudentsQuery = `
        SELECT user_id, math_rating, physics_rating, chemistry_rating, created_at
        FROM \`${projectId}\`.\`chronos_users\`.\`users\`
        WHERE user_organization = @organization AND user_role = 'student'
        ORDER BY user_id ASC
      `;
      const [orgStudents] = await bq.query({
        query: getOrgStudentsQuery,
        params: { organization }
      });

      // 3. Fetch claimed students
      const getClaimedStudentsQuery = `
        SELECT student_id
        FROM \`${projectId}\`.\`chronos_users\`.\`teacher_students\`
        WHERE teacher_id = @username
      `;
      const [claimedRows] = await bq.query({
        query: getClaimedStudentsQuery,
        params: { username: sanitizedUser }
      });
      const claimedStudentIds = claimedRows.map(r => r.student_id);

      // 4. Fetch lessons
      const getLessonsQuery = `
        SELECT lesson_id, title, description, created_at
        FROM \`${projectId}\`.\`chronos_users\`.\`lessons\`
        WHERE teacher_id = @username
        ORDER BY created_at DESC
      `;
      const [lessons] = await bq.query({
        query: getLessonsQuery,
        params: { username: sanitizedUser }
      });

      // 5. Fetch assignments and submissions in parallel
      let assignments = [];
      let submissions = [];

      if (lessons.length > 0) {
        const getAssignmentsQuery = `
          SELECT assignment_id, lesson_id, title, subject, num_questions, starting_difficulty, exam_format, time_limit_style, time_limit_value, stress_mode, due_date, created_at
          FROM \`${projectId}\`.\`chronos_users\`.\`homework_assignments\`
          WHERE lesson_id IN (
            SELECT lesson_id FROM \`${projectId}\`.\`chronos_users\`.\`lessons\` WHERE teacher_id = @username
          )
          ORDER BY created_at DESC
        `;
        const getSubmissionsQuery = `
          SELECT user_id, exam_id, subject, accuracy, new_rating, created_at, assignment_id
          FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_history\`
          WHERE assignment_id IN (
            SELECT assignment_id FROM \`${projectId}\`.\`chronos_users\`.\`homework_assignments\`
            WHERE lesson_id IN (
              SELECT lesson_id FROM \`${projectId}\`.\`chronos_users\`.\`lessons\` WHERE teacher_id = @username
            )
          )
          ORDER BY created_at DESC
        `;

        const [assignResult, subResult] = await Promise.all([
          bq.query({ query: getAssignmentsQuery }),
          bq.query({ query: getSubmissionsQuery })
        ]);
        assignments = assignResult[0];
        submissions = subResult[0];
      }

      // 6. Compute collective student stats & aggregate strengths/weaknesses
      const myStudents = orgStudents.filter(s => claimedStudentIds.includes(s.user_id));
      let collectiveStats = { avgMath: 0, avgPhys: 0, avgChem: 0, overallAvg: 0, totalExams: 0, avgAccuracy: 0, strengths: [], weaknesses: [] };

      if (myStudents.length > 0) {
        const studentIds = myStudents.map(s => s.user_id);
        
        // Query collective ELO averages
        const mathSum = myStudents.reduce((acc, s) => acc + (s.math_rating || 100), 0);
        const physSum = myStudents.reduce((acc, s) => acc + (s.physics_rating || 100), 0);
        const chemSum = myStudents.reduce((acc, s) => acc + (s.chemistry_rating || 100), 0);
        
        collectiveStats.avgMath = Math.round(mathSum / myStudents.length);
        collectiveStats.avgPhys = Math.round(physSum / myStudents.length);
        collectiveStats.avgChem = Math.round(chemSum / myStudents.length);
        collectiveStats.overallAvg = Math.round((collectiveStats.avgMath + collectiveStats.avgPhys + collectiveStats.avgChem) / 3);

        // Fetch aggregate exam history for these students
        const getCollectiveHistoryQuery = `
          SELECT accuracy
          FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_history\`
          WHERE user_id IN UNNEST(@studentIds)
        `;
        const [historyRows] = await bq.query({
          query: getCollectiveHistoryQuery,
          params: { studentIds }
        });

        collectiveStats.totalExams = historyRows.length;
        if (historyRows.length > 0) {
          const accSum = historyRows.reduce((acc, h) => acc + (h.accuracy || 0), 0);
          collectiveStats.avgAccuracy = Math.round((accSum / historyRows.length) * 100);
        }

        // Fetch collective topic mastery
        const getCollectiveMasteryQuery = `
          SELECT sub_category, subject, SUM(correct_count) as correct, SUM(total_count) as total
          FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
          WHERE user_id IN UNNEST(@studentIds)
          GROUP BY sub_category, subject
        `;
        const [masteryRows] = await bq.query({
          query: getCollectiveMasteryQuery,
          params: { studentIds }
        });

        const collectiveStrengths = [];
        const collectiveWeaknesses = [];
        for (const row of masteryRows) {
          if (row.total > 0) {
            const acc = row.correct / row.total;
            if (acc >= 0.70) {
              collectiveStrengths.push({ topic: row.sub_category, subject: row.subject });
            } else if (acc < 0.65) {
              collectiveWeaknesses.push({ topic: row.sub_category, subject: row.subject });
            }
          }
        }
        collectiveStats.strengths = collectiveStrengths;
        collectiveStats.weaknesses = collectiveWeaknesses;
      }

      return res.status(200).json({
        orgStudents,
        claimedStudentIds,
        lessons,
        assignments,
        submissions,
        collectiveStats
      });
    } catch (err) {
      console.error('Error fetching teacher data:', err);
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  if (req.method === 'POST') {
    const { teacherId, studentId, action } = req.body;
    if (!teacherId || !studentId || !action) {
      return res.status(400).json({ error: 'teacherId, studentId, and action are required' });
    }

    const tId = teacherId.trim().toLowerCase();
    const sId = studentId.trim().toLowerCase();

    try {
      if (action === 'add') {
        const insertQuery = `
          INSERT INTO \`${projectId}\`.\`chronos_users\`.\`teacher_students\` (teacher_id, student_id, created_at)
          VALUES (@teacherId, @studentId, CURRENT_TIMESTAMP())
        `;
        await bq.query({
          query: insertQuery,
          params: { teacherId: tId, studentId: sId }
        });
      } else if (action === 'remove') {
        const deleteQuery = `
          DELETE FROM \`${projectId}\`.\`chronos_users\`.\`teacher_students\`
          WHERE teacher_id = @teacherId AND student_id = @studentId
        `;
        await bq.query({
          query: deleteQuery,
          params: { teacherId: tId, studentId: sId }
        });
      } else {
        return res.status(400).json({ error: 'Invalid action. Must be add or remove.' });
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('Error modifying claimed students:', err);
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
