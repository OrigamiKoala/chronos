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

  const { username, examId, questionId, subject, topic } = req.body;

  if (!username || !examId || !questionId || !subject || !topic) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const sanitizedUser = username.trim().toLowerCase();

  try {
    // 1. Fetch current results_json from user_exam_results
    const getResultsQuery = `
      SELECT results_json
      FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`
      WHERE exam_id = @examId AND user_id = @username
      LIMIT 1
    `;
    const [examRows] = await bq.query({
      query: getResultsQuery,
      params: { examId, username: sanitizedUser }
    });

    if (!examRows || examRows.length === 0) {
      return res.status(404).json({ error: 'Exam results not found' });
    }

    const results = JSON.parse(examRows[0].results_json);

    // 2. Find and update the specific question
    let questionFound = false;
    for (const r of results) {
      if (r.id === questionId) {
        if (r.isCorrect) {
          // Already correct, no-op
          return res.status(200).json({ success: true, message: 'Already marked correct' });
        }
        r.isCorrect = true;
        questionFound = true;
        break;
      }
    }

    if (!questionFound) {
      return res.status(404).json({ error: 'Question not found in this exam' });
    }

    // 3. Recalculate accuracy
    const correctCount = results.filter(r => r.isCorrect).length;
    const totalCount = results.length;
    const newAccuracy = Math.round((correctCount / totalCount) * 100) || 0;

    // 4. Update user_exam_results and user_exam_history
    await Promise.all([
      bq.query({
        query: `UPDATE \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`
          SET results_json = @resultsJson
          WHERE exam_id = @examId AND user_id = @username`,
        params: { examId, username: sanitizedUser, resultsJson: JSON.stringify(results) }
      }),
      bq.query({
        query: `UPDATE \`${projectId}\`.\`chronos_users\`.\`user_exam_history\`
          SET accuracy = @newAccuracy
          WHERE exam_id = @examId AND user_id = @username`,
        params: { examId, username: sanitizedUser, newAccuracy }
      }),
      bq.query({
        query: `DELETE FROM \`${projectId}\`.\`chronos_users\`.\`user_wrong_problems\`
          WHERE exam_id = @examId AND question_id = @questionId AND user_id = @username`,
        params: { examId, questionId, username: sanitizedUser }
      })
    ]);

    // 5. Update user_topic_mastery
    const getMasteryQuery = `
      SELECT correct_count, total_count
      FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
      WHERE user_id = @username AND sub_category = @topic AND subject = @subject
      LIMIT 1
    `;
    const [masteryRows] = await bq.query({
      query: getMasteryQuery,
      params: { username: sanitizedUser, topic, subject }
    });

    if (masteryRows && masteryRows.length > 0) {
      const existing = masteryRows[0];
      const nextCorrect = existing.correct_count + 1;
      const nextTotal = existing.total_count;
      const nextAccuracy = nextCorrect / nextTotal;

      await bq.query({
        query: `UPDATE \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
          SET correct_count = @nextCorrect, accuracy_rate = @nextAccuracy
          WHERE user_id = @username AND sub_category = @topic AND subject = @subject`,
        params: { username: sanitizedUser, topic, subject, nextCorrect, nextAccuracy }
      });
    }

    return res.status(200).json({ success: true, newAccuracy });
  } catch (err) {
    console.error('Remark correct error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
