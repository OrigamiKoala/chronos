/* eslint-disable */
import { BigQuery } from '@google-cloud/bigquery';

const bq = new BigQuery({
  projectId: process.env.BIGQUERY_PROJECT_ID,
  credentials: {
    client_email: process.env.BIGQUERY_CLIENT_EMAIL,
    private_key: process.env.BIGQUERY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, subject, examId, accuracy, avgTime, ratingChange, newRating, results } = req.body;

  if (!username || !subject || !examId || accuracy === undefined || !results) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const sanitizedUser = username.trim().toLowerCase();

  try {
    // 1. Insert into user_exam_history
    const insertHistoryQuery = `
      INSERT INTO \`chronos-stress-sandbox\`.\`chronos_users\`.\`user_exam_history\` 
        (user_id, exam_id, subject, accuracy, avg_time, rating_change, new_rating, created_at)
      VALUES 
        (@username, @examId, @subject, @accuracy, @avgTime, @ratingChange, @newRating, CURRENT_TIMESTAMP())
    `;
    await bq.query({
      query: insertHistoryQuery,
      params: { username: sanitizedUser, examId, subject, accuracy, avgTime, ratingChange, newRating }
    });

    // 2. Update user rating in users table
    let ratingColumn = 'math_rating';
    if (subject === 'Physics') ratingColumn = 'physics_rating';
    else if (subject === 'Chemistry') ratingColumn = 'chemistry_rating';

    const updateRatingQuery = `
      UPDATE \`chronos-stress-sandbox\`.\`chronos_users\`.\`users\`
      SET ${ratingColumn} = @newRating
      WHERE user_id = @username
    `;
    await bq.query({
      query: updateRatingQuery,
      params: { username: sanitizedUser, newRating }
    });

    // 3. Update strengths/weaknesses (user_topic_mastery)
    const topicStats = {};
    for (const r of results) {
      const topic = r.topic || 'General';
      if (!topicStats[topic]) {
        topicStats[topic] = { correct: 0, total: 0 };
      }
      topicStats[topic].total += 1;
      if (r.isCorrect) {
        topicStats[topic].correct += 1;
      }
    }

    for (const [topic, stats] of Object.entries(topicStats)) {
      const checkMastery = `
        SELECT correct_count, total_count 
        FROM \`chronos-stress-sandbox\`.\`chronos_users\`.\`user_topic_mastery\`
        WHERE user_id = @username AND sub_category = @topic
      `;
      const [existingMastery] = await bq.query({
        query: checkMastery,
        params: { username: sanitizedUser, topic }
      });

      if (existingMastery.length > 0) {
        const nextCorrect = existingMastery[0].correct_count + stats.correct;
        const nextTotal = existingMastery[0].total_count + stats.total;
        const nextAccuracy = nextCorrect / nextTotal;

        const updateMastery = `
          UPDATE \`chronos-stress-sandbox\`.\`chronos_users\`.\`user_topic_mastery\`
          SET correct_count = @nextCorrect, total_count = @nextTotal, accuracy_rate = @nextAccuracy
          WHERE user_id = @username AND sub_category = @topic
        `;
        await bq.query({
          query: updateMastery,
          params: { username: sanitizedUser, topic, nextCorrect, nextTotal, nextAccuracy }
        });
      } else {
        const accuracyRate = stats.correct / stats.total;
        const insertMastery = `
          INSERT INTO \`chronos-stress-sandbox\`.\`chronos_users\`.\`user_topic_mastery\` 
            (user_id, sub_category, subject, correct_count, total_count, accuracy_rate)
          VALUES 
            (@username, @topic, @subject, @correct, @total, @accuracyRate)
        `;
        await bq.query({
          query: insertMastery,
          params: { username: sanitizedUser, topic, subject, correct: stats.correct, total: stats.total, accuracyRate }
        });
      }
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Submit exam error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
