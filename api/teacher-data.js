/* eslint-disable */
import { BigQuery } from '@google-cloud/bigquery';
import { executeWithRetry } from './_gemini.js';
import crypto from 'crypto';

// Helper function to generate HS256 JWT
function generateJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const base64UrlEncode = (obj) => {
    return Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  };

  const headerEncoded = base64UrlEncode(header);
  const payloadEncoded = base64UrlEncode(payload);

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerEncoded}.${payloadEncoded}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${headerEncoded}.${payloadEncoded}.${signature}`;
}

const projectId = process.env.BIGQUERY_PROJECT_ID || 'chronos-stress-sandbox';
const bq = new BigQuery({
  projectId: projectId,
  credentials: {
    client_email: process.env.BIGQUERY_CLIENT_EMAIL,
    private_key: process.env.BIGQUERY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

async function triggerBackgroundHomeworkGeneration(teacherId, lessonId, homeworks, bq, projectId, lessonTitle = '', lessonDescription = '') {
  try {
    const tId = teacherId.trim().toLowerCase();
    const [claimedRows] = await bq.query({
      query: `SELECT student_id FROM \`${projectId}\`.\`chronos_users\`.\`teacher_students\` WHERE teacher_id = @teacherId`,
      params: { teacherId: tId }
    });
    const studentIds = claimedRows.map(r => r.student_id);

    if (studentIds.length === 0) return;
    const WEBHOOK_URL = process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_URL;
    if (!WEBHOOK_URL) {
      console.warn('GOOGLE_APPS_SCRIPT_WEBHOOK_URL is not configured. Skipping background homework generation.');
      return;
    }
    const jwtSecret = process.env.JWT_SECRET || 'development-only-secret-key';
    
    // Helper function to generate HS256 JWT
    function generateJWT(payload, secret) {
      const header = { alg: 'HS256', typ: 'JWT' };
      const base64UrlEncode = (obj) => {
        return Buffer.from(JSON.stringify(obj))
          .toString('base64')
          .replace(/=/g, '')
          .replace(/\+/g, '-')
          .replace(/\//g, '_');
      };

      const headerEncoded = base64UrlEncode(header);
      const payloadEncoded = base64UrlEncode(payload);

      const signature = crypto
        .createHmac('sha256', secret)
        .update(`${headerEncoded}.${payloadEncoded}`)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      return `${headerEncoded}.${payloadEncoded}.${signature}`;
    }

    const accessToken = generateJWT({
      teacherId: tId,
      exp: Math.floor(Date.now() / 1000) + 7200 // 2-hour short-lived token
    }, jwtSecret);

    fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        action: 'generate_homework',
        teacherId: tId,
        lessonId: lessonId,
        lessonTitle: lessonTitle,
        lessonDescription: lessonDescription,
        studentIds: studentIds,
        homeworks: homeworks,
        geminiApiKeys: [
          process.env.GEMINI_API_KEY,
          process.env.GEMINI_API_KEY_2,
          process.env.GEMINI_API_KEY_3,
          process.env.GEMINI_API_KEY_4,
          process.env.GEMINI_API_KEY_5,
          process.env.GEMINI_API_KEY_6,
          process.env.GEMINI_API_KEY_7,
          process.env.GEMINI_API_KEY_8,
          process.env.GEMINI_API_KEY_9,
          process.env.GEMINI_API_KEY_10,
          process.env.GEMINI_API_KEY_11,
          process.env.GEMINI_API_KEY_12
        ].filter(Boolean)
      })
    }).catch(err => console.error("Worker fetch failed in trigger:", err));

  } catch (err) {
    console.error("Error in triggerBackgroundHomeworkGeneration:", err);
  }
}

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
        const assignmentsPayload = [];
        if (Array.isArray(homework) && homework.length > 0) {
          const assignmentPromises = homework.map((hw, index) => {
            const assignmentId = `assign_${Date.now()}_${index}`;
            const formatsStr = Array.isArray(hw.examFormat) ? hw.examFormat.join(',') : String(hw.examFormat || 'multiple_choice');
            const dueDate = hw.dueDate ? hw.dueDate : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            const sharedQJson = hw.sharedQuestions ? JSON.stringify(hw.sharedQuestions) : null;

            assignmentsPayload.push({
              assignmentId,
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
              sharedQuestions: hw.sharedQuestions || []
            });

            const insertAssignmentQuery = `
              INSERT INTO \`${projectId}\`.\`chronos_users\`.\`homework_assignments\` 
                (assignment_id, lesson_id, title, subject, num_questions, starting_difficulty, exam_format, time_limit_style, time_limit_value, stress_mode, content_based, due_date, created_at, shared_questions_json, questions_per_set)
              VALUES (@assignmentId, @lessonId, @title, @subject, @numQuestions, @startingDifficulty, @examFormat, @timeLimitStyle, @timeLimitValue, @stressMode, @contentBased, CAST(@dueDate AS TIMESTAMP), CURRENT_TIMESTAMP(), @sharedQuestionsJson, @questionsPerSet)
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
                sharedQuestionsJson: sharedQJson,
                questionsPerSet: Number(hw.questionsPerSet) || 2
              },
              types: {
                sharedQuestionsJson: 'STRING'
              }
            });
          });

          await Promise.all(assignmentPromises);
        }

        if (assignmentsPayload.length > 0) {
          triggerBackgroundHomeworkGeneration(tId, lessonId, assignmentsPayload, bq, projectId, title, description);
        }

        return res.status(200).json({ success: true, lessonId });
      } catch (err) {
        console.error('Error creating lesson/homework:', err);
        return res.status(500).json({ error: err.message || 'Internal Server Error' });
      }
    } else if (req.method === 'PUT') {
      const { lessonId, title, description, homework, teacherId } = req.body;
      if (!lessonId || !title || !description) {
        return res.status(400).json({ error: 'Missing required parameters (lessonId, title, description)' });
      }

      const tId = teacherId ? teacherId.trim().toLowerCase() : '';

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
        const assignmentsPayload = [];
        const assignmentPromises = updatedHomework.map((hw, index) => {
          const formatsStr = Array.isArray(hw.examFormat) ? hw.examFormat.join(',') : String(hw.examFormat || 'multiple_choice');
          const dueDate = hw.dueDate ? hw.dueDate : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          const sharedQJson = hw.sharedQuestions ? JSON.stringify(hw.sharedQuestions) : null;

          let assignmentId = hw.assignment_id;
          const isNew = !assignmentId || !existingIds.includes(assignmentId);
          if (isNew) {
            assignmentId = `assign_${Date.now()}_${index}`;
          }

          assignmentsPayload.push({
            assignmentId,
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
            sharedQuestions: hw.sharedQuestions || []
          });

          if (!isNew) {
            const updateAssignmentQuery = `
              UPDATE \`${projectId}\`.\`chronos_users\`.\`homework_assignments\`
              SET title = @title, subject = @subject, num_questions = @numQuestions, 
                  starting_difficulty = @startingDifficulty, exam_format = @examFormat, 
                  time_limit_style = @timeLimitStyle, time_limit_value = @timeLimitValue, 
                  stress_mode = @stressMode, content_based = @contentBased, due_date = CAST(@dueDate AS TIMESTAMP),
                  shared_questions_json = @sharedQuestionsJson, questions_per_set = @questionsPerSet
              WHERE assignment_id = @assignmentId
            `;
            return bq.query({
              query: updateAssignmentQuery,
              params: {
                assignmentId,
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
                sharedQuestionsJson: sharedQJson,
                questionsPerSet: Number(hw.questionsPerSet) || 2
              },
              types: {
                sharedQuestionsJson: 'STRING'
              }
            });
          } else {
            const insertAssignmentQuery = `
              INSERT INTO \`${projectId}\`.\`chronos_users\`.\`homework_assignments\` 
                (assignment_id, lesson_id, title, subject, num_questions, starting_difficulty, exam_format, time_limit_style, time_limit_value, stress_mode, content_based, due_date, created_at, shared_questions_json, questions_per_set)
              VALUES (@assignmentId, @lessonId, @title, @subject, @numQuestions, @startingDifficulty, @examFormat, @timeLimitStyle, @timeLimitValue, @stressMode, @contentBased, CAST(@dueDate AS TIMESTAMP), CURRENT_TIMESTAMP(), @sharedQuestionsJson, @questionsPerSet)
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
                sharedQuestionsJson: sharedQJson,
                questionsPerSet: Number(hw.questionsPerSet) || 2
              },
              types: {
                sharedQuestionsJson: 'STRING'
              }
            });
          }
        });

        await Promise.all(assignmentPromises);

        if (assignmentsPayload.length > 0 && tId) {
          triggerBackgroundHomeworkGeneration(tId, lessonId, assignmentsPayload, bq, projectId, title, description);
        }

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
        SELECT a.assignment_id, a.title, a.subject, a.num_questions, a.starting_difficulty, a.exam_format, a.time_limit_style, a.time_limit_value, a.stress_mode, a.content_based, a.due_date, a.shared_questions_json, a.questions_per_set, l.title as lesson_title, l.description as lesson_description
        FROM \`${projectId}\`.\`chronos_users\`.\`homework_assignments\` a
        JOIN \`${projectId}\`.\`chronos_users\`.\`lessons\` l ON a.lesson_id = l.lesson_id
        WHERE l.organization = @organization
          AND EXISTS (
            SELECT 1 FROM \`${projectId}\`.\`chronos_users\`.\`teacher_students\` ts
            WHERE ts.student_id = @username AND ts.teacher_id = l.teacher_id
          )
          AND NOT EXISTS (
            SELECT 1 FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_history\`
            WHERE user_id = @username AND assignment_id = a.assignment_id
          )
          AND (a.due_date IS NULL OR a.due_date >= CURRENT_TIMESTAMP())
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

  // 2b. Student AI insights route
  if (route === 'insights') {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { studentId, teacherId, bypassLimit } = req.query;
    if (!studentId || !teacherId) {
      return res.status(400).json({ error: 'Missing studentId or teacherId' });
    }

    const sId = studentId.trim().toLowerCase();
    const tId = teacherId.trim().toLowerCase();

    try {
      // Fetch lessons created by this teacher
      const getLessonsQuery = `
        SELECT lesson_id, title, description, created_at
        FROM \`${projectId}\`.\`chronos_users\`.\`lessons\`
        WHERE teacher_id = @teacherId
        ORDER BY created_at ASC
      `;
      const [lessons] = await bq.query({
        query: getLessonsQuery,
        params: { teacherId: tId }
      });

      // Fetch existing insights for this student from this teacher
      const getInsightsQuery = `
        SELECT insight_id, lesson_id, summary, suggestions, progress_status, created_at
        FROM \`${projectId}\`.\`chronos_users\`.\`student_insights\`
        WHERE student_id = @studentId AND teacher_id = @teacherId
        ORDER BY created_at DESC
      `;
      const [insights] = await bq.query({
        query: getInsightsQuery,
        params: { studentId: sId, teacherId: tId }
      });

      const existingLessonsMap = new Map();
      insights.forEach(ins => {
        existingLessonsMap.set(ins.lesson_id, ins);
      });

      // Find the latest insight creation timestamp
      let latestInsightTime = 0;
      if (insights.length > 0) {
        const first = insights[0];
        const dateStr = first.created_at?.value || first.created_at;
        latestInsightTime = new Date(dateStr).getTime();
      }

      // Check if we can generate a new insight today (max once every 6 days)
      const nowTime = Date.now();
      const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
      const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;
      const bypass = bypassLimit === 'true';
      const canGenerate = bypass || (nowTime - latestInsightTime) >= SIX_DAYS_MS;

      let newInsightGenerated = false;

      if (canGenerate) {
        // Find the oldest lesson plan created >= 7 days ago that does not have an insight yet
        let eligibleLessons = lessons.filter(l => {
          const lDate = l.created_at?.value || l.created_at;
          const lTime = new Date(lDate).getTime();
          const isOlderThanAWeek = (nowTime - lTime) >= ONE_WEEK_MS;
          const hasNoInsight = !existingLessonsMap.has(l.lesson_id);
          return isOlderThanAWeek && hasNoInsight;
        });

        // If bypass is true and there are no eligible lessons without insights, we can regenerate the most recent lesson plan's insight
        if (eligibleLessons.length === 0 && bypass && lessons.length > 0) {
          const latestLesson = lessons.filter(l => {
            const lDate = l.created_at?.value || l.created_at;
            const lTime = new Date(lDate).getTime();
            return (nowTime - lTime) >= ONE_WEEK_MS;
          }).slice(-1)[0]; // get the most recent lesson older than a week

          if (latestLesson) {
            eligibleLessons = [latestLesson];
          }
        }

        if (eligibleLessons.length > 0) {
          const targetLesson = eligibleLessons[0]; // oldest eligible
          const lessonDateStr = targetLesson.created_at?.value || targetLesson.created_at;
          const lessonTime = new Date(lessonDateStr).getTime();

          const startTime = new Date(lessonTime).toISOString();
          const endTime = new Date(lessonTime + ONE_WEEK_MS).toISOString();

          // Query student's practice in this 7-day range
          const getHistoryQuery = `
            SELECT h.exam_id, h.subject, h.accuracy, h.created_at, r.results_json
            FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_history\` h
            LEFT JOIN \`${projectId}\`.\`chronos_users\`.\`user_exam_results\` r
              ON h.exam_id = r.exam_id AND h.user_id = r.user_id
            WHERE h.user_id = @studentId
              AND h.created_at >= CAST(@startTime AS TIMESTAMP)
              AND h.created_at <= CAST(@endTime AS TIMESTAMP)
            ORDER BY h.created_at ASC
          `;
          const [practiceRows] = await bq.query({
            query: getHistoryQuery,
            params: { studentId: sId, startTime, endTime }
          });

          // Prepare prompt for Gemini
          let practiceSummaryText = `The student did not submit any exams or practice results during this week (from ${startTime.slice(0, 10)} to ${endTime.slice(0, 10)}).`;
          if (practiceRows.length > 0) {
            practiceSummaryText = practiceRows.map((row, index) => {
              let parsedResults = [];
              try {
                parsedResults = row.results_json ? JSON.parse(row.results_json) : [];
              } catch (e) {
                console.error('Failed to parse results_json:', e);
              }
              const questionsSummary = parsedResults.map((q, qidx) => 
                `Q${qidx + 1} (${q.topic || 'General'}): ${q.question} | Student Answer: "${q.userAnswer || 'none'}" | Correct Answer: "${q.answer || ''}" | Is Correct: ${q.isCorrect ? 'Yes' : 'No'}`
              ).join('\n  ');

              return `Exam ${index + 1}: Subject: ${row.subject} | Accuracy: ${Math.round(row.accuracy * 100)}% | Date: ${new Date(row.created_at?.value || row.created_at).toLocaleDateString()}\n  Questions details:\n  ${questionsSummary}`;
            }).join('\n\n');
          }

          const geminiPrompt = `You are a world-class educational AI assistant. You help teachers and coaches track student progress and tailor their lessons.
Analyze a student's practice and exam attempts over a 1-week period following a specific lesson plan.

Student ID: ${sId}
Lesson Title: ${targetLesson.title}
Lesson Syllabus / Description: ${targetLesson.description}
Lesson Created At: ${new Date(lessonDateStr).toLocaleDateString()}

Student's Practice History during the week of ${new Date(lessonDateStr).toLocaleDateString()} to ${new Date(lessonTime + ONE_WEEK_MS).toLocaleDateString()}:
${practiceSummaryText}

Your tasks:
1. Summarize the student's practice during the week. Note key areas they attempted, their accuracy, and any obvious conceptual gaps or silly mistakes. If they didn't practice, clearly report that they did not record any practice activity.
2. Formulate specific suggestions for the coach/teacher on what the student should learn or practice next to improve.
3. Determine if the student is progressing toward the learning goals (defined by the lesson title and description). Clearly state "Yes", "No", or "Partial" and explain why based on their performance/practice in topics related to the lesson plan.

Return strictly a valid JSON object with the following schema:
{
  "summary": "Your detailed summary of the last week of practice",
  "suggestions": "Your concrete advice for the teacher on what the student should be learning/practicing next",
  "progress_status": "Yes / No / Partial (and explain why)"
}
Do NOT include markdown headers, backticks, or any conversational text. Return ONLY the raw JSON object.`;

          const modelId = 'gemini-3.1-flash-lite';
          const models = [modelId, 'gemini-3-flash-preview'];
          const response = await executeWithRetry(models, (ai, currentModel) => ai.models.generateContent({
            model: currentModel,
            contents: geminiPrompt,
            config: {
              responseMimeType: "application/json",
              temperature: 0.3
            }
          }), req);

          if (response.text) {
            try {
              const responseText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
              const responseObj = JSON.parse(responseText);

              const insightId = `insight_${Date.now()}_${sId}`;
              const insertInsightQuery = `
                INSERT INTO \`${projectId}\`.\`chronos_users\`.\`student_insights\`
                  (insight_id, student_id, teacher_id, lesson_id, summary, suggestions, progress_status, created_at)
                VALUES
                  (@insightId, @studentId, @teacherId, @lessonId, @summary, @suggestions, @progressStatus, CURRENT_TIMESTAMP())
              `;

              await bq.query({
                query: insertInsightQuery,
                params: {
                  insightId,
                  studentId: sId,
                  teacherId: tId,
                  lessonId: targetLesson.lesson_id,
                  summary: responseObj.summary || 'Summary generation failed.',
                  suggestions: responseObj.suggestions || 'Suggestions generation failed.',
                  progressStatus: responseObj.progress_status || 'Unknown',
                }
              });

              newInsightGenerated = true;
            } catch (err) {
              console.error('Error parsing or saving insight:', err);
            }
          }
        }
      }

      let finalInsights = insights;
      if (newInsightGenerated) {
        const [reFetched] = await bq.query({
          query: getInsightsQuery,
          params: { studentId: sId, teacherId: tId }
        });
        finalInsights = reFetched;
      }

      return res.status(200).json({ insights: finalInsights });
    } catch (err) {
      console.error('Error fetching/generating student insights:', err);
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  // 2c. Homework questions route (view/edit pre-generated student homework questions)
  if (route === 'homework-questions') {
    if (req.method === 'GET') {
      const { assignmentId } = req.query;
      if (!assignmentId) {
        return res.status(400).json({ error: 'assignmentId is required' });
      }

      try {
        const query = `
          SELECT student_id, questions_json
          FROM \`${projectId}\`.\`chronos_users\`.\`student_homework_questions\`
          WHERE assignment_id = @assignmentId
        `;
        const [rows] = await bq.query({
          query,
          params: { assignmentId }
        });

        const questions = rows.map(r => ({
          studentId: r.student_id,
          questions: JSON.parse(r.questions_json)
        }));

        return res.status(200).json({ questions });
      } catch (err) {
        console.error('Error fetching homework questions:', err);
        return res.status(500).json({ error: err.message || 'Internal Server Error' });
      }
    }

    if (req.method === 'POST') {
      const { assignmentId, studentId, questions } = req.body;
      if (!assignmentId || !studentId || !Array.isArray(questions)) {
        return res.status(400).json({ error: 'Missing required parameters (assignmentId, studentId, questions)' });
      }

      try {
        const query = `
          UPDATE \`${projectId}\`.\`chronos_users\`.\`student_homework_questions\`
          SET questions_json = @questionsJson
          WHERE assignment_id = @assignmentId AND student_id = @studentId
        `;
        await bq.query({
          query,
          params: {
            assignmentId,
            studentId: studentId.trim().toLowerCase(),
            questionsJson: JSON.stringify(questions)
          }
        });

        return res.status(200).json({ success: true });
      } catch (err) {
        console.error('Error updating student homework questions:', err);
        return res.status(500).json({ error: err.message || 'Internal Server Error' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
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
      const jwtSecret = process.env.JWT_SECRET || 'development-only-secret-key';
      const accessToken = generateJWT({
        teacherId: sanitizedUser,
        exp: Math.floor(Date.now() / 1000) + 7200 // 2-hour short-lived token
      }, jwtSecret);

      if (!organization) {
        return res.status(200).json({
          orgStudents: [],
          claimedStudentIds: [],
          lessons: [],
          assignments: [],
          submissions: [],
          collectiveStats: { avgMath: 100, avgPhys: 100, avgChem: 100, overallAvg: 100, totalExams: 0, avgAccuracy: 0, strengths: [], weaknesses: [] },
          collectiveTopicBreakdowns: {},
          accessToken
        });
      }

      // Fetch all data in a single consolidated BigQuery query
      const consolidatedQuery = `
        WITH orgStudents AS (
          SELECT 'orgStudents' AS type, TO_JSON_STRING(STRUCT(user_id, math_rating, physics_rating, chemistry_rating, created_at)) AS data
          FROM \`${projectId}\`.\`chronos_users\`.\`users\`
          WHERE user_organization = @organization AND user_role = 'student'
        ),
        claimedStudents AS (
          SELECT 'claimedStudents' AS type, TO_JSON_STRING(STRUCT(student_id)) AS data
          FROM \`${projectId}\`.\`chronos_users\`.\`teacher_students\`
          WHERE teacher_id = @username
        ),
        lessons AS (
          SELECT 'lessons' AS type, TO_JSON_STRING(STRUCT(lesson_id, title, description, created_at)) AS data
          FROM \`${projectId}\`.\`chronos_users\`.\`lessons\`
          WHERE teacher_id = @username
        ),
        assignments AS (
          SELECT 'assignments' AS type, TO_JSON_STRING(STRUCT(assignment_id, lesson_id, title, subject, num_questions, starting_difficulty, exam_format, time_limit_style, time_limit_value, stress_mode, content_based, due_date, created_at, shared_questions_json, questions_per_set)) AS data
          FROM \`${projectId}\`.\`chronos_users\`.\`homework_assignments\`
          WHERE lesson_id IN (
            SELECT lesson_id FROM \`${projectId}\`.\`chronos_users\`.\`lessons\` WHERE teacher_id = @username
          )
        ),
        submissions AS (
          SELECT 'submissions' AS type, TO_JSON_STRING(STRUCT(user_id, exam_id, subject, accuracy, new_rating, rating_change, created_at, assignment_id)) AS data
          FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_history\`
          WHERE assignment_id IN (
            SELECT assignment_id FROM \`${projectId}\`.\`chronos_users\`.\`homework_assignments\`
            WHERE lesson_id IN (
              SELECT lesson_id FROM \`${projectId}\`.\`chronos_users\`.\`lessons\` WHERE teacher_id = @username
            )
          )
        )
        SELECT type, data FROM orgStudents
        UNION ALL
        SELECT type, data FROM claimedStudents
        UNION ALL
        SELECT type, data FROM lessons
        UNION ALL
        SELECT type, data FROM assignments
        UNION ALL
        SELECT type, data FROM submissions
      `;

      const [rows] = await bq.query({
        query: consolidatedQuery,
        params: { organization, username: sanitizedUser }
      });

      const orgStudents = [];
      const claimedStudentIds = [];
      const lessons = [];
      let assignments = [];
      let submissions = [];

      for (const r of rows) {
        try {
          const parsed = JSON.parse(r.data);
          if (r.type === 'orgStudents') orgStudents.push(parsed);
          else if (r.type === 'claimedStudents') claimedStudentIds.push(parsed.student_id);
          else if (r.type === 'lessons') lessons.push(parsed);
          else if (r.type === 'assignments') assignments.push(parsed);
          else if (r.type === 'submissions') submissions.push(parsed);
        } catch (parseErr) {
          console.error("Failed to parse row data in teacher-data:", r, parseErr);
        }
      }

      // Sort results to match original ordering
      orgStudents.sort((a, b) => a.user_id.localeCompare(b.user_id));
      lessons.sort((a, b) => new Date(b.created_at?.value || b.created_at) - new Date(a.created_at?.value || a.created_at));
      assignments.sort((a, b) => new Date(b.created_at?.value || b.created_at) - new Date(a.created_at?.value || a.created_at));
      submissions.sort((a, b) => new Date(b.created_at?.value || b.created_at) - new Date(a.created_at?.value || a.created_at));

      // Compute collective student stats & aggregate strengths/weaknesses
      const myStudents = orgStudents.filter(s => claimedStudentIds.includes(s.user_id));
      let collectiveStats = { avgMath: 0, avgPhys: 0, avgChem: 0, overallAvg: 0, totalExams: 0, avgAccuracy: 0, strengths: [], weaknesses: [] };
      let collectiveTopicBreakdowns = {};

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
            } else if (row.total >= 3 && acc < 0.65) {
              collectiveWeaknesses.push({ topic: row.sub_category, subject: row.subject });
            }
          }
        }
        collectiveStats.strengths = collectiveStrengths;
        collectiveStats.weaknesses = collectiveWeaknesses;

        // Fetch collective topic breakdowns
        const getCollectiveBreakdownsQuery = `
          SELECT user_id, topic, good_at, not_good_at
          FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\`
          WHERE user_id IN UNNEST(@studentIds)
        `;
        try {
          const [breakdownRows] = await bq.query({
            query: getCollectiveBreakdownsQuery,
            params: { studentIds }
          });
          
          for (const row of breakdownRows) {
            const topic = row.topic;
            if (!collectiveTopicBreakdowns[topic]) {
              collectiveTopicBreakdowns[topic] = { good_at: [], not_good_at: [] };
            }
            if (row.good_at) {
              collectiveTopicBreakdowns[topic].good_at.push(`- **${row.user_id}**: ${row.good_at}`);
            }
            if (row.not_good_at) {
              collectiveTopicBreakdowns[topic].not_good_at.push(`- **${row.user_id}**: ${row.not_good_at}`);
            }
          }
          
          for (const topic in collectiveTopicBreakdowns) {
            collectiveTopicBreakdowns[topic].good_at = collectiveTopicBreakdowns[topic].good_at.join('\n');
            collectiveTopicBreakdowns[topic].not_good_at = collectiveTopicBreakdowns[topic].not_good_at.join('\n');
          }
        } catch (e) {
          console.error("Error fetching collective topic breakdowns:", e);
        }
      }

      return res.status(200).json({
        orgStudents,
        claimedStudentIds,
        lessons,
        assignments,
        submissions,
        collectiveStats,
        collectiveTopicBreakdowns,
        accessToken
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
