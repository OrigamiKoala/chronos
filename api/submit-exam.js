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
    // 0. Ensure user_wrong_problems and user_weakness_analysis tables exist
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

    const createAnalysisTableQuery = `
      CREATE TABLE IF NOT EXISTS \`${projectId}\`.\`chronos_users\`.\`user_weakness_analysis\` (
        user_id STRING NOT NULL,
        subject STRING NOT NULL,
        detailed_analysis STRING NOT NULL,
        updated_at TIMESTAMP NOT NULL
      )
    `;
    await bq.query(createAnalysisTableQuery);

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

    // 1b. Create user_exam_results table and insert full results JSON
    const createResultsTableQuery = `
      CREATE TABLE IF NOT EXISTS \`${projectId}\`.\`chronos_users\`.\`user_exam_results\` (
        user_id STRING NOT NULL,
        exam_id STRING NOT NULL,
        results_json STRING NOT NULL,
        created_at TIMESTAMP NOT NULL
      )
    `;
    await bq.query(createResultsTableQuery);

    const insertResultsQuery = `
      INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`
        (user_id, exam_id, results_json, created_at)
      VALUES
        (@username, @examId, @resultsJson, CURRENT_TIMESTAMP())
    `;
    await bq.query({
      query: insertResultsQuery,
      params: { username: sanitizedUser, examId, resultsJson: JSON.stringify(results) }
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
    // Ensure all tables exist
    const createAnalysisTableQuery = `
      CREATE TABLE IF NOT EXISTS \`${projectId}\`.\`chronos_users\`.\`user_weakness_analysis\` (
        user_id STRING NOT NULL,
        subject STRING NOT NULL,
        detailed_analysis STRING NOT NULL,
        updated_at TIMESTAMP NOT NULL
      )
    `;
    await bq.query(createAnalysisTableQuery);

    const createBreakdownTableQuery = `
      CREATE TABLE IF NOT EXISTS \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\` (
        user_id STRING NOT NULL,
        subject STRING NOT NULL,
        topic STRING NOT NULL,
        good_at STRING NOT NULL,
        not_good_at STRING NOT NULL,
        updated_at TIMESTAMP NOT NULL
      )
    `;
    await bq.query(createBreakdownTableQuery);

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
            "Analyze these incorrect ", @subject, " exam questions attempted by user '", @username, "'. ",
            "Provide a thorough diagnostic analysis of their strengths and weaknesses in this subject. ",
            "Identify up to 5 specific topics where they show strength or promise, and up to 5 specific topics where they show weakness. ",
            "Note that if a broad topic (like 'Organic Synthesis' or 'Calculus') has areas of both success and failure, list it in BOTH strengths and weaknesses. ",
            "For each identified topic, generate a breakdown of exactly what part of that topic the user is good at, and what part they are not good at. ",
            "Return strictly a valid JSON object with the following schema:\n",
            "{\n",
            "  \\"strengths\\": [\\"Topic A\\", \\"Topic B\\"],\n",
            "  \\"weaknesses\\": [\\"Topic B\\", \\"Topic C\\"],\n",
            "  \\"detailed_analysis\\": \\"A detailed diagnosis...\\",\n",
            "  \\"topic_breakdowns\\": [\n",
            "    { \\"topic\\": \\"Topic B\\", \\"good_at\\": \\"What they do well...\\", \\"not_good_at\\": \\"What they struggle with...\\" }\n",
            "  ]\n",
            "}\n",
            "Do NOT include markdown formatting, backticks, or any conversational text. Return ONLY the raw JSON object.\n\n",
            "Incorrect questions: ",
            STRING_AGG(CONCAT("Topic: ", topic, " | Question: ", question_text, " | User Answer: ", COALESCE(user_answer, "None"), " | Correct Answer: ", correct_answer), " ; ")
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
      const responseObj = JSON.parse(cleanedText);
      const strengths = responseObj.strengths;
      const weaknesses = responseObj.weaknesses;
      const detailedAnalysis = responseObj.detailed_analysis;
      const topicBreakdowns = responseObj.topic_breakdowns;
      
      if (Array.isArray(strengths)) {
        for (const topic of strengths) {
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
            // Raise their accuracy rate to register as strength
            const updateQuery = `
              UPDATE \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
              SET correct_count = 4, total_count = 6, accuracy_rate = 0.80
              WHERE user_id = @username AND sub_category = @topic AND subject = @subject
            `;
            await bq.query({
              query: updateQuery,
              params: { username, topic, subject }
            });
          } else {
            // Insert baseline strong mastery
            const insertQuery = `
              INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
                (user_id, sub_category, subject, correct_count, total_count, accuracy_rate)
              VALUES
                (@username, @topic, @subject, 4, 6, 0.80)
            `;
            await bq.query({
              query: insertQuery,
              params: { username, topic, subject }
            });
          }
        }
      }

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
              SET correct_count = 2, total_count = 6, accuracy_rate = 0.40
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
                (@username, @topic, @subject, 2, 6, 0.40)
            `;
            await bq.query({
              query: insertQuery,
              params: { username, topic, subject }
            });
          }
        }
      }

      if (Array.isArray(topicBreakdowns)) {
        for (const b of topicBreakdowns) {
          const mergeBreakdownQuery = `
            MERGE \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\` T
            USING (SELECT @username AS user_id, @subject AS subject, @topic AS topic) S
            ON T.user_id = S.user_id AND T.subject = S.subject AND T.topic = S.topic
            WHEN MATCHED THEN
              UPDATE SET good_at = @goodAt, not_good_at = @notGoodAt, updated_at = CURRENT_TIMESTAMP()
            WHEN NOT MATCHED THEN
              INSERT (user_id, subject, topic, good_at, not_good_at, updated_at)
              VALUES (@username, @subject, @topic, @goodAt, @notGoodAt, CURRENT_TIMESTAMP())
          `;
          await bq.query({
            query: mergeBreakdownQuery,
            params: { username, subject, topic: b.topic, goodAt: b.good_at, notGoodAt: b.not_good_at }
          });
        }
      }

      if (detailedAnalysis) {
        const mergeAnalysisQuery = `
          MERGE \`${projectId}\`.\`chronos_users\`.\`user_weakness_analysis\` T
          USING (SELECT @username AS user_id, @subject AS subject) S
          ON T.user_id = S.user_id AND T.subject = S.subject
          WHEN MATCHED THEN
            UPDATE SET detailed_analysis = @detailedAnalysis, updated_at = CURRENT_TIMESTAMP()
          WHEN NOT MATCHED THEN
            INSERT (user_id, subject, detailed_analysis, updated_at)
            VALUES (@username, @subject, @detailedAnalysis, CURRENT_TIMESTAMP())
        `;
        await bq.query({
          query: mergeAnalysisQuery,
          params: { username, subject, detailedAnalysis }
        });
      }
    }
  } catch (err) {
    console.error('Background AI weaknesses update failed:', err);
  }
}
