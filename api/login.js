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

  const { username } = req.body;
  if (!username || username.trim() === '') {
    return res.status(400).json({ error: 'Username is required' });
  }

  const sanitizedUser = username.trim().toLowerCase();

  try {
    // 1. Check if user exists
    const checkQuery = `
      SELECT user_id, math_rating, physics_rating, chemistry_rating 
      FROM \`${projectId}\`.\`chronos_users\`.\`users\`
      WHERE user_id = @username
    `;
    const [existingUsers] = await bq.query({
      query: checkQuery,
      params: { username: sanitizedUser }
    });

    let userData;

    if (existingUsers.length > 0) {
      userData = existingUsers[0];
    } else {
      // 2. Register New User
      const insertUserQuery = `
        INSERT INTO \`${projectId}\`.\`chronos_users\`.\`users\` (user_id, created_at, math_rating, physics_rating, chemistry_rating)
        VALUES (@username, CURRENT_TIMESTAMP(), 100, 100, 100)
      `;
      await bq.query({
        query: insertUserQuery,
        params: { username: sanitizedUser }
      });

      // Insert baseline topic masteries
      const topics = [
        { topic: 'Algebra', subject: 'Math' },
        { topic: 'Geometry', subject: 'Math' },
        { topic: 'Calculus', subject: 'Math' },
        { topic: 'Kinematics', subject: 'Physics' },
        { topic: 'Thermodynamics', subject: 'Physics' },
        { topic: 'Electromagnetism', subject: 'Physics' },
        { topic: 'Stoichiometry', subject: 'Chemistry' },
        { topic: 'Organic Chemistry', subject: 'Chemistry' },
        { topic: 'Electrochemistry', subject: 'Chemistry' }
      ];

      for (const t of topics) {
        const insertMastery = `
          INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\` (user_id, sub_category, subject, correct_count, total_count, accuracy_rate)
          VALUES (@username, @topic, @subject, 3, 5, 0.60)
        `;
        await bq.query({
          query: insertMastery,
          params: { username: sanitizedUser, topic: t.topic, subject: t.subject }
        });
      }

      userData = {
        user_id: sanitizedUser,
        math_rating: 100,
        physics_rating: 100,
        chemistry_rating: 100
      };
    }

    // 3. Fetch past 25 tests history
    const historyQuery = `
      SELECT exam_id, subject, accuracy, avg_time, rating_change, new_rating, created_at
      FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_history\`
      WHERE user_id = @username
      ORDER BY created_at DESC
      LIMIT 25
    `;
    const [history] = await bq.query({
      query: historyQuery,
      params: { username: sanitizedUser }
    });

    // 4. Fetch mastery (strengths >= 70%, weaknesses < 65%)
    const masteryQuery = `
      SELECT sub_category, subject, accuracy_rate
      FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
      WHERE user_id = @username
    `;
    const [mastery] = await bq.query({
      query: masteryQuery,
      params: { username: sanitizedUser }
    });

    const strengths = mastery.filter(m => m.accuracy_rate >= 0.70).map(m => ({ topic: m.sub_category, subject: m.subject }));
    const weaknesses = mastery.filter(m => m.accuracy_rate < 0.65).map(m => ({ topic: m.sub_category, subject: m.subject }));

    // 5. Ensure user_weakness_analysis table exists and fetch detailed diagnostic paragraphs
    const createAnalysisTableQuery = `
      CREATE TABLE IF NOT EXISTS \`${projectId}\`.\`chronos_users\`.\`user_weakness_analysis\` (
        user_id STRING NOT NULL,
        subject STRING NOT NULL,
        detailed_analysis STRING NOT NULL,
        updated_at TIMESTAMP NOT NULL
      )
    `;
    await bq.query(createAnalysisTableQuery);

    const analysisQuery = `
      SELECT subject, detailed_analysis
      FROM \`${projectId}\`.\`chronos_users\`.\`user_weakness_analysis\`
      WHERE user_id = @username
    `;
    const [analyses] = await bq.query({
      query: analysisQuery,
      params: { username: sanitizedUser }
    });

    const detailedAnalysis = {};
    for (const a of analyses) {
      detailedAnalysis[a.subject] = a.detailed_analysis;
    }

    return res.status(200).json({
      user: userData,
      history,
      strengths,
      weaknesses,
      detailedAnalysis
    });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
