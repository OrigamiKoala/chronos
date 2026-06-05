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
  const { route } = req.query;

  // 1. Lessons route
  if (route === 'lessons') {
    if (req.method === 'POST') {
      const { teacherId, organization, title, description, homework } = req.body;
      if (!teacherId || !organization || !title || !description) {
        return res.status(400).json({ error: 'Missing required parameters (teacherId, organization, title, description)' });
      }

      const tId = teacherId.trim().toLowerCase();
      const org = organization.trim();
      const lessonId = `lesson_${Date.now()}`;

      try {
        // Insert lesson plan
        const insertLessonQuery = `
          INSERT INTO \`${projectId}\`.\`chronos_users\`.\`lessons\` (lesson_id, teacher_id, organization, title, description, created_at)
          VALUES (@lessonId, @teacherId, @organization, @title, @description, CURRENT_TIMESTAMP())
        `;
        await bq.query({
          query: insertLessonQuery,
          params: {
            lessonId,
            teacherId: tId,
            organization: org,
            title: title.trim(),
            description: description.trim()
          }
        });

        // Insert homework assignments if provided
        if (Array.isArray(homework) && homework.length > 0) {
          const assignmentPromises = homework.map((hw, index) => {
            const assignmentId = `assign_${Date.now()}_${index}`;
            const formatsStr = Array.isArray(hw.examFormat) ? hw.examFormat.join(',') : String(hw.examFormat || 'multiple_choice');
            const dueDate = hw.dueDate ? hw.dueDate : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            const sharedQJson = hw.sharedQuestions ? JSON.stringify(hw.sharedQuestions) : null;

            const insertAssignmentQuery = `
              INSERT INTO \`${projectId}\`.\`chronos_users\`.\`homework_assignments\` 
                (assignment_id, lesson_id, title, subject, num_questions, starting_difficulty, exam_format, time_limit_style, time_limit_value, stress_mode, content_based, due_date, created_at, shared_questions_json)
              VALUES (@assignmentId, @lessonId, @title, @subject, @numQuestions, @startingDifficulty, @examFormat, @timeLimitStyle, @timeLimitValue, @stressMode, @contentBased, CAST(@dueDate AS TIMESTAMP), CURRENT_TIMESTAMP(), @sharedQuestionsJson)
            `;

            return bq.query({
              query: insertAssignmentQuery,
              params: {
                assignmentId,
                lessonId,
                title: hw.title ? hw.title.trim() : `Homework for ${title}`,
                subject: hw.subject || 'Math',
                numQuestions: Number(hw.numQuestions) || 5,
                startingDifficulty: Number(hw.startingDifficulty) || 5,
                examFormat: formatsStr,
                timeLimitStyle: hw.timeLimitStyle || 'per_question',
                timeLimitValue: Number(hw.timeLimitValue) || 60,
                stressMode: hw.stressMode || 'none',
                contentBased: hw.contentBased !== false,
                dueDate,
                sharedQuestionsJson: sharedQJson
              }
            });
          });

          await Promise.all(assignmentPromises);
        }

        return res.status(200).json({ success: true, lessonId });
      } catch (err) {
        console.error('Error creating lesson/homework:', err);
        return res.status(500).json({ error: err.message || 'Internal Server Error' });
      }
    } else if (req.method === 'PUT') {
      const { lessonId, title, description, homework } = req.body;
      if (!lessonId || !title || !description) {
        return res.status(400).json({ error: 'Missing required parameters (lessonId, title, description)' });
      }

      try {
        // Update lesson plan
        const updateLessonQuery = `
          UPDATE \`${projectId}\`.\`chronos_users\`.\`lessons\`
          SET title = @title, description = @description
          WHERE lesson_id = @lessonId
        `;
        await bq.query({
          query: updateLessonQuery,
          params: {
            lessonId,
            title: title.trim(),
            description: description.trim()
          }
        });

        // Manage homework assignments
        const getAssignsQuery = `
          SELECT assignment_id FROM \`${projectId}\`.\`chronos_users\`.\`homework_assignments\`
          WHERE lesson_id = @lessonId
        `;
        const [existingRows] = await bq.query({
          query: getAssignsQuery,
          params: { lessonId }
        });
        const existingIds = existingRows.map(r => r.assignment_id);

        const updatedHomework = Array.isArray(homework) ? homework : [];
        const updatedIds = updatedHomework.map(h => h.assignment_id).filter(Boolean);

        // Delete removed homework assignments
        const idsToDelete = existingIds.filter(id => !updatedIds.includes(id));
        if (idsToDelete.length > 0) {
          const deleteHwsQuery = `
            DELETE FROM \`${projectId}\`.\`chronos_users\`.\`homework_assignments\`
            WHERE assignment_id IN UNNEST(@idsToDelete)
          `;
          await bq.query({
            query: deleteHwsQuery,
            params: { idsToDelete }
          });
        }

        // Upsert assignments
        const assignmentPromises = updatedHomework.map((hw, index) => {
          const formatsStr = Array.isArray(hw.examFormat) ? hw.examFormat.join(',') : String(hw.examFormat || 'multiple_choice');
          const dueDate = hw.dueDate ? hw.dueDate : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          const sharedQJson = hw.sharedQuestions ? JSON.stringify(hw.sharedQuestions) : null;

          if (hw.assignment_id && existingIds.includes(hw.assignment_id)) {
            const updateAssignmentQuery = `
              UPDATE \`${projectId}\`.\`chronos_users\`.\`homework_assignments\`
              SET title = @title, subject = @subject, num_questions = @numQuestions, 
                  starting_difficulty = @startingDifficulty, exam_format = @examFormat, 
                  time_limit_style = @timeLimitStyle, time_limit_value = @timeLimitValue, 
                  stress_mode = @stressMode, content_based = @contentBased, due_date = CAST(@dueDate AS TIMESTAMP),
                  shared_questions_json = @sharedQuestionsJson
              WHERE assignment_id = @assignmentId
            `;
            return bq.query({
              query: updateAssignmentQuery,
              params: {
                assignmentId: hw.assignment_id,
                title: hw.title ? hw.title.trim() : `Homework for ${title}`,
                subject: hw.subject || 'Math',
                numQuestions: Number(hw.numQuestions) || 5,
                startingDifficulty: Number(hw.startingDifficulty) || 5,
                examFormat: formatsStr,
                timeLimitStyle: hw.timeLimitStyle || 'per_question',
                timeLimitValue: Number(hw.timeLimitValue) || 60,
                stressMode: hw.stressMode || 'none',
                contentBased: hw.contentBased !== false,
                dueDate,
                sharedQuestionsJson: sharedQJson
              }
            });
          } else {
            const assignmentId = `assign_${Date.now()}_${index}`;
            const insertAssignmentQuery = `
              INSERT INTO \`${projectId}\`.\`chronos_users\`.\`homework_assignments\` 
                (assignment_id, lesson_id, title, subject, num_questions, starting_difficulty, exam_format, time_limit_style, time_limit_value, stress_mode, content_based, due_date, created_at, shared_questions_json)
              VALUES (@assignmentId, @lessonId, @title, @subject, @numQuestions, @startingDifficulty, @examFormat, @timeLimitStyle, @timeLimitValue, @stressMode, @contentBased, CAST(@dueDate AS TIMESTAMP), CURRENT_TIMESTAMP(), @sharedQuestionsJson)
            `;
            return bq.query({
              query: insertAssignmentQuery,
              params: {
                assignmentId,
                lessonId,
                title: hw.title ? hw.title.trim() : `Homework for ${title}`,
                subject: hw.subject || 'Math',
                numQuestions: Number(hw.numQuestions) || 5,
                startingDifficulty: Number(hw.startingDifficulty) || 5,
                examFormat: formatsStr,
                timeLimitStyle: hw.timeLimitStyle || 'per_question',
                timeLimitValue: Number(hw.timeLimitValue) || 60,
                stressMode: hw.stressMode || 'none',
                contentBased: hw.contentBased !== false,
                dueDate,
                sharedQuestionsJson: sharedQJson
              }
            });
          }
        });

        await Promise.all(assignmentPromises);
        return res.status(200).json({ success: true });
      } catch (err) {
        console.error('Error updating lesson:', err);
        return res.status(500).json({ error: err.message || 'Internal Server Error' });
      }
    } else if (req.method === 'DELETE') {
      const { lessonId } = req.query;
      if (!lessonId) {
        return res.status(400).json({ error: 'lessonId is required' });
      }

      try {
        // Delete assignments
        const deleteAssignmentsQuery = `
          DELETE FROM \`${projectId}\`.\`chronos_users\`.\`homework_assignments\`
          WHERE lesson_id = @lessonId
        `;
        await bq.query({
          query: deleteAssignmentsQuery,
          params: { lessonId }
        });

        // Delete lesson
        const deleteLessonQuery = `
          DELETE FROM \`${projectId}\`.\`chronos_users\`.\`lessons\`
          WHERE lesson_id = @lessonId
        `;
        await bq.query({
          query: deleteLessonQuery,
          params: { lessonId }
        });

        return res.status(200).json({ success: true });
      } catch (err) {
        console.error('Error deleting lesson:', err);
        return res.status(500).json({ error: err.message || 'Internal Server Error' });
      }
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  }

  // 2. Student homework route
  if (route === 'student-homework') {
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
        SELECT a.assignment_id, a.title, a.subject, a.num_questions, a.starting_difficulty, a.exam_format, a.time_limit_style, a.time_limit_value, a.stress_mode, a.content_based, a.due_date, a.shared_questions_json, l.title as lesson_title, l.description as lesson_description
        FROM \`${projectId}\`.\`chronos_users\`.\`homework_assignments\` a
        JOIN \`${projectId}\`.\`chronos_users\`.\`lessons\` l ON a.lesson_id = l.lesson_id
        WHERE l.organization = @organization
          AND NOT EXISTS (
            SELECT 1 FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_history\`
            WHERE user_id = @username AND assignment_id = a.assignment_id
          )
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

  // 3. Default teacher portal data / Claimed student actions route
  if (req.method === 'GET') {
    const { username } = req.query;
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const sanitizedUser = username.trim().toLowerCase();

    try {
      // Verify user is a teacher or admin and get organization
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

      // Fetch all organization students
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

      // Fetch claimed students
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

      // Fetch lessons
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

      // Fetch assignments and submissions in parallel
      let assignments = [];
      let submissions = [];

      if (lessons.length > 0) {
        const getAssignmentsQuery = `
          SELECT assignment_id, lesson_id, title, subject, num_questions, starting_difficulty, exam_format, time_limit_style, time_limit_value, stress_mode, content_based, due_date, created_at, shared_questions_json
          FROM \`${projectId}\`.\`chronos_users\`.\`homework_assignments\`
          WHERE lesson_id IN (
            SELECT lesson_id FROM \`${projectId}\`.\`chronos_users\`.\`lessons\` WHERE teacher_id = @username
          )
          ORDER BY created_at DESC
        `;
        const getSubmissionsQuery = `
          SELECT user_id, exam_id, subject, accuracy, new_rating, rating_change, created_at, assignment_id
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
          bq.query({ query: getAssignmentsQuery, params: { username: sanitizedUser } }),
          bq.query({ query: getSubmissionsQuery, params: { username: sanitizedUser } })
        ]);
        assignments = assignResult[0];
        submissions = subResult[0];
      }

      // Compute collective student stats & aggregate strengths/weaknesses
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
