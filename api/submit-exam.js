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

  const { username, subject, examId, accuracy, avgTime, ratingChange, newRating, results } = req.body;

  if (!username || !subject || !examId || accuracy === undefined || !results) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const sanitizedUser = username.trim().toLowerCase();

  try {
    // 0. Ensure user_wrong_problems table exists
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS \`${projectId}\`.\`chronos_users\`.\`user_wrong_problems\` (
        user_id STRING NOT NULL,
        exam_id STRING NOT NULL,
        question_id STRING NOT NULL,
        subject STRING NOT NULL,
        topic STRING NOT NULL,
        question_text STRING NOT NULL,
        user_answer STRING,
        correct_answer STRING NOT NULL,
        created_at TIMESTAMP NOT NULL
      )
    `;
    await bq.query(createTableQuery);

    // 1. Insert into user_exam_history
    const insertHistoryQuery = `
      INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_exam_history\` 
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
      UPDATE \`${projectId}\`.\`chronos_users\`.\`users\`
      SET ${ratingColumn} = @newRating
      WHERE user_id = @username
    `;
    await bq.query({
      query: updateRatingQuery,
      params: { username: sanitizedUser, newRating }
    });

    // 3. Update strengths/weaknesses (user_topic_mastery) and record wrong problems
    const topicStats = {};
    for (const r of results) {
      const topic = r.topic || 'General';
      if (!topicStats[topic]) {
        topicStats[topic] = { correct: 0, total: 0 };
      }
      topicStats[topic].total += 1;
      if (r.isCorrect) {
        topicStats[topic].correct += 1;
      } else {
        // PUSH WRONG PROBLEM TO BIGQUERY
        const insertWrongQuery = `
          INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_wrong_problems\`
            (user_id, exam_id, question_id, subject, topic, question_text, user_answer, correct_answer, created_at)
          VALUES
            (@username, @examId, @questionId, @subject, @topic, @questionText, @userAnswer, @correctAnswer, CURRENT_TIMESTAMP())
        `;
        await bq.query({
          query: insertWrongQuery,
          params: {
            username: sanitizedUser,
            examId,
            questionId: r.id || String(Date.now()),
            subject,
            topic,
            questionText: r.question,
            userAnswer: r.userAnswer || '',
            correctAnswer: r.answer || ''
          }
        });
      }
    }

    for (const [topic, stats] of Object.entries(topicStats)) {
      const checkMastery = `
        SELECT correct_count, total_count 
        FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
        WHERE user_id = @username AND sub_category = @topic AND subject = @subject
      `;
      const [existingMastery] = await bq.query({
        query: checkMastery,
        params: { username: sanitizedUser, topic, subject }
      });

      if (existingMastery.length > 0) {
        const nextCorrect = existingMastery[0].correct_count + stats.correct;
        const nextTotal = existingMastery[0].total_count + stats.total;
        const nextAccuracy = nextCorrect / nextTotal;

        const updateMastery = `
          UPDATE \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
          SET correct_count = @nextCorrect, total_count = @nextTotal, accuracy_rate = @nextAccuracy
          WHERE user_id = @username AND sub_category = @topic AND subject = @subject
        `;
        await bq.query({
          query: updateMastery,
          params: { username: sanitizedUser, topic, subject, nextCorrect, nextTotal, nextAccuracy }
        });
      } else {
        const accuracyRate = stats.correct / stats.total;
        const insertMastery = `
          INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\` 
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

    // 4. Trigger asynchronous background update of user weaknesses using BigQuery AI remote model
    updateAIWeaknesses(sanitizedUser, subject);

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Submit exam error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}

// Background worker function to analyze wrong problems and update weaknesses
async function updateAIWeaknesses(username, subject) {
  try {
    // A. Count wrong problems for this user and subject to ensure there is data to analyze
    const countQuery = `
      SELECT COUNT(*) AS cnt 
      FROM \`${projectId}\`.\`chronos_users\`.\`user_wrong_problems\`
      WHERE user_id = @username AND subject = @subject
    `;
    const [countRows] = await bq.query({
      query: countQuery,
      params: { username, subject }
    });
    
    const wrongCount = countRows[0]?.cnt || 0;
    if (wrongCount === 0) return;

    // B. Run BigQuery AI ML.GENERATE_TEXT query to analyze incorrect questions and output weakness topics
    const aiQuery = `
      SELECT ml_generate_text_result AS analysis
      FROM ML.GENERATE_TEXT(
        MODEL \`${projectId}\`.\`chronos_users\`.\`gemini_flash_model\`,
        (
          SELECT CONCAT(
            "Analyze these incorrect olympiad exam questions attempted by user '", @username, "'. ",
            "List up to 5 highly specific topic sub-categories (e.g. 'Stoichiometry', 'Organic Synthesis', 'Rotational Mechanics') that the user is weak in. ",
            "Return strictly a valid JSON array of strings containing ONLY the sub-category names, like: [\\"Stoichiometry\\", \\"Rotational Mechanics\\"]. ",
            "Do NOT include markdown formatting, backticks, or any conversational text. Return ONLY the raw JSON array.",
            "Incorrect questions: ",
            STRING_AGG(CONCAT("Subject: ", subject, " | Topic: ", topic, " | Question: ", question_text), " ; ")
          ) AS prompt
          FROM \`${projectId}\`.\`chronos_users\`.\`user_wrong_problems\`
          WHERE user_id = @username AND subject = @subject
        ),
        STRUCT(0.2 AS temperature)
      )
    `;

    const [aiRows] = await bq.query({
      query: aiQuery,
      params: { username, subject }
    });

    if (aiRows && aiRows.length > 0 && aiRows[0].analysis) {
      const responseText = aiRows[0].analysis;
      // Clean up markdown block if present
      const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const weaknesses = JSON.parse(cleanedText);
      
      if (Array.isArray(weaknesses)) {
        for (const topic of weaknesses) {
          // Check if this mastery entry exists
          const checkQuery = `
            SELECT correct_count, total_count 
            FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
            WHERE user_id = @username AND sub_category = @topic AND subject = @subject
          `;
          const [exists] = await bq.query({
            query: checkQuery,
            params: { username, topic, subject }
          });

          if (exists.length > 0) {
            // Lower their accuracy rate below 0.65 to register as weakness
            const updateQuery = `
              UPDATE \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
              SET correct_count = 2, total_count = 5, accuracy_rate = 0.40
              WHERE user_id = @username AND sub_category = @topic AND subject = @subject
            `;
            await bq.query({
              query: updateQuery,
              params: { username, topic, subject }
            });
          } else {
            // Insert baseline weak mastery
            const insertQuery = `
              INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
                (user_id, sub_category, subject, correct_count, total_count, accuracy_rate)
              VALUES
                (@username, @topic, @subject, 2, 5, 0.40)
            `;
            await bq.query({
              query: insertQuery,
              params: { username, topic, subject }
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('Background AI weaknesses update failed:', err);
  }
}
