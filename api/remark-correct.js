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
    // 1. Fetch current results_json from user_exam_results and history details from user_exam_history
    const getResultsQuery = `
      SELECT results_json
      FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`
      WHERE exam_id = @examId AND user_id = @username
      LIMIT 1
    `;
    const getHistoryQuery = `
      SELECT rating_change, new_rating, avg_time, accuracy
      FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_history\`
      WHERE exam_id = @examId AND user_id = @username
      LIMIT 1
    `;

    const [[examRows], [historyRows]] = await Promise.all([
      bq.query({ query: getResultsQuery, params: { examId, username: sanitizedUser } }),
      bq.query({ query: getHistoryQuery, params: { examId, username: sanitizedUser } })
    ]);

    if (!examRows || examRows.length === 0 || !historyRows || historyRows.length === 0) {
      return res.status(404).json({ error: 'Exam results or history not found' });
    }

    const results = JSON.parse(examRows[0].results_json);
    const hist = historyRows[0];

    // 2. Find and update the specific question
    let questionFound = false;
    for (const r of results) {
      if (r.id === questionId) {
        if (r.isCorrect) {
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

    // 4. Recalculate ELO Rating
    const oldRating = hist.new_rating - hist.rating_change;
    const avgQuestionRating = hist.avg_time;
    const score = correctCount / totalCount;

    let expectedScore = 1 / (1 + Math.pow(10, (avgQuestionRating - oldRating) / 400));
    if (avgQuestionRating < oldRating) {
      expectedScore = Math.max(expectedScore, 0.75);
    }

    // Solve for original K factor (either 32 or 250)
    const originalScore = (correctCount - 1) / totalCount;
    const diff32 = Math.round(32 * (originalScore - expectedScore));
    const diff250 = Math.round(250 * (originalScore - expectedScore));
    let K = 250;
    if (Math.abs(diff32 - hist.rating_change) < Math.abs(diff250 - hist.rating_change)) {
      K = 32;
    }

    const newRatingChange = Math.round(K * (score - expectedScore));
    const newRatingVal = Math.max(100, oldRating + newRatingChange);
    const ratingDiff = newRatingVal - hist.new_rating;

    // 5. Update user_exam_results, user_exam_history, delete wrong problem entry, and update active ELO
    let ratingColumn = 'math_rating';
    if (subject === 'Physics') ratingColumn = 'physics_rating';
    else if (subject === 'Chemistry') ratingColumn = 'chemistry_rating';

    await Promise.all([
      bq.query({
        query: `UPDATE \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`
          SET results_json = @resultsJson
          WHERE exam_id = @examId AND user_id = @username`,
        params: { examId, username: sanitizedUser, resultsJson: JSON.stringify(results) }
      }),
      bq.query({
        query: `UPDATE \`${projectId}\`.\`chronos_users\`.\`user_exam_history\`
          SET accuracy = @newAccuracy, rating_change = @newRatingChange, new_rating = @newRatingVal
          WHERE exam_id = @examId AND user_id = @username`,
        params: { examId, username: sanitizedUser, newAccuracy: score, newRatingChange, newRatingVal }
      }),
      bq.query({
        query: `DELETE FROM \`${projectId}\`.\`chronos_users\`.\`user_wrong_problems\`
          WHERE exam_id = @examId AND question_id = @questionId AND user_id = @username`,
        params: { examId, questionId, username: sanitizedUser }
      }),
      bq.query({
        query: `UPDATE \`${projectId}\`.\`chronos_users\`.\`users\`
          SET ${ratingColumn} = ${ratingColumn} + @ratingDiff
          WHERE user_id = @username`,
        params: { ratingDiff, username: sanitizedUser }
      })
    ]);

    // 6. Update user_topic_mastery
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

    return res.status(200).json({ success: true, newAccuracy, newRatingVal, newRatingChange });
  } catch (err) {
    console.error('Remark correct error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
