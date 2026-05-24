/* eslint-disable */
import { BigQuery } from '@google-cloud/bigquery';
import { GoogleGenAI } from '@google/genai';

const projectId = process.env.BIGQUERY_PROJECT_ID || 'chronos-stress-sandbox';

const bq = new BigQuery({
  projectId: projectId,
  credentials: {
    client_email: process.env.BIGQUERY_CLIENT_EMAIL,
    private_key: process.env.BIGQUERY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

const ELO_ALGORITHM_VERSION = 1;

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
      SET ${ratingColumn} = @newRating, elo_version = @eloVersion
      WHERE user_id = @username
    `;
    await bq.query({
      query: updateRatingQuery,
      params: { username: sanitizedUser, newRating, eloVersion: ELO_ALGORITHM_VERSION }
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
      // Forcing direct stream mapping bypasses anonymous table caching lookups
      const streamMastery = bq.createQueryStream({
        query: checkMastery,
        params: { username: sanitizedUser, topic, subject },
        location: 'US'
      });
      const existingMastery = [];
      for await (const row of streamMastery) {
        existingMastery.push(row);
      }

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

    // 4. Trigger update of user weaknesses using direct Gemini model
    await updateAIWeaknesses(sanitizedUser, subject);

    // 5. Trigger mistake analysis and save in BigQuery using direct Gemini model
    await analyzeMistakesAndSave(sanitizedUser, examId, subject, results);

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

    // A. Fetch incorrect questions for this user and subject
    const fetchWrongProblemsQuery = `
      SELECT topic, question_text, user_answer, correct_answer
      FROM \`${projectId}\`.\`chronos_users\`.\`user_wrong_problems\`
      WHERE user_id = @username AND subject = @subject
    `;
    // Forcing direct stream mapping bypasses anonymous table caching lookups
    const streamWrong = bq.createQueryStream({
      query: fetchWrongProblemsQuery,
      params: { username, subject },
      location: 'US'
    });
    const wrongProblems = [];
    for await (const row of streamWrong) {
      wrongProblems.push(row);
    }
    
    if (!wrongProblems || wrongProblems.length === 0) return;

    const wrongProblemsString = wrongProblems.map(p => 
      `Topic: ${p.topic} | Question: ${p.question_text} | User Answer: ${p.user_answer || 'None'} | Correct Answer: ${p.correct_answer}`
    ).join(' ; ');

    const prompt = `Analyze these incorrect ${subject} exam questions attempted by user '${username}'. 
Provide a thorough diagnostic analysis of their strengths and weaknesses in this subject. 
Identify up to 5 specific topics where they show strength or promise, and up to 5 specific topics where they show weakness. 
Note that if a broad topic (like 'Organic Synthesis' or 'Calculus') has areas of both success and failure, list it in BOTH strengths and weaknesses. 
For each identified topic, generate a breakdown of exactly what part of that topic the user is good at, and what part they are not good at. 
Return strictly a valid JSON object with the following schema:
{
  "strengths": ["Topic A", "Topic B"],
  "weaknesses": ["Topic B", "Topic C"],
  "detailed_analysis": "A detailed diagnosis...",
  "topic_breakdowns": [
    { "topic": "Topic B", "good_at": "What they do well...", "not_good_at": "What they struggle with..." }
  ]
}
Do NOT include markdown formatting, backticks, or any conversational text. Return ONLY the raw JSON object.

Incorrect questions: ${wrongProblemsString}`;

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.2
      }
    });

    if (response.text) {
      const responseText = response.text;
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
          // Forcing direct stream mapping bypasses anonymous table caching lookups
          const streamExists = bq.createQueryStream({
            query: checkQuery,
            params: { username, topic, subject },
            location: 'US'
          });
          const exists = [];
          for await (const row of streamExists) {
            exists.push(row);
          }

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
          // Forcing direct stream mapping bypasses anonymous table caching lookups
          const streamExistsWeak = bq.createQueryStream({
            query: checkQuery,
            params: { username, topic, subject },
            location: 'US'
          });
          const exists = [];
          for await (const row of streamExistsWeak) {
            exists.push(row);
          }

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

async function analyzeMistakesAndSave(username, examId, subject, results) {
  try {
    // Create mistake analysis table if not exists
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS \`${projectId}\`.\`chronos_users\`.\`user_mistake_analysis\` (
        user_id STRING NOT NULL,
        exam_id STRING NOT NULL,
        subject STRING NOT NULL,
        mistake_patterns STRING NOT NULL,
        created_at TIMESTAMP NOT NULL
      )
    `;
    await bq.query(createTableQuery);

    const prompt = `You are an expert tutor. Analyze the user's performance on this ${subject} exam.
Look closely at their answers to determine what kind of mistakes they made (e.g., conceptual gaps, calculation errors, timing issues, or panic).

Exam attempt details:
${results.map((r, i) => `
Question ${i+1}: ${r.question}
Correct Answer: ${r.answer}
User's Answer: ${r.userAnswer}
Is Correct: ${r.isCorrect ? 'Yes' : 'No'}
Time Spent: ${r.timeSpent}s
Timed Out: ${r.timeOut ? 'Yes' : 'No'}
`).join('\n')}

Provide a professional, diagnostic summary of their mistake patterns and concrete recommendations to avoid these mistakes in the future.
Be direct, supportive, and pedagogical. Do not include markdown headers or greetings.`;

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
      contents: prompt,
      config: {
        temperature: 0.3
      }
    });

    const mistakePatterns = response.text || '';

    // Save results in BigQuery
    const insertQuery = `
      INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_mistake_analysis\`
        (user_id, exam_id, subject, mistake_patterns, created_at)
      VALUES
        (@username, @examId, @subject, @mistakePatterns, CURRENT_TIMESTAMP())
    `;
    await bq.query({
      query: insertQuery,
      params: {
        username,
        examId,
        subject,
        mistakePatterns
      }
    });
  } catch (err) {
    console.error('Error in mistake analysis background job:', err);
  }
}
