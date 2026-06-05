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

  const { teacherId, organization, title, description, homework } = req.body;
  if (!teacherId || !organization || !title || !description) {
    return res.status(400).json({ error: 'Missing required parameters (teacherId, organization, title, description)' });
  }

  const tId = teacherId.trim().toLowerCase();
  const org = organization.trim();
  const lessonId = `lesson_${Date.now()}`;

  try {
    // 1. Insert lesson plan
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

    // 2. Insert homework assignments if provided
    if (Array.isArray(homework) && homework.length > 0) {
      const assignmentPromises = homework.map((hw, index) => {
        const assignmentId = `assign_${Date.now()}_${index}`;
        const formatsStr = Array.isArray(hw.examFormat) ? hw.examFormat.join(',') : String(hw.examFormat || 'multiple_choice');
        const dueDate = hw.dueDate ? hw.dueDate : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const insertAssignmentQuery = `
          INSERT INTO \`${projectId}\`.\`chronos_users\`.\`homework_assignments\` 
            (assignment_id, lesson_id, title, subject, num_questions, starting_difficulty, exam_format, time_limit_style, time_limit_value, stress_mode, due_date, created_at)
          VALUES (@assignmentId, @lessonId, @title, @subject, @numQuestions, @startingDifficulty, @examFormat, @timeLimitStyle, @timeLimitValue, @stressMode, CAST(@dueDate AS TIMESTAMP), CURRENT_TIMESTAMP())
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
            dueDate
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
}
