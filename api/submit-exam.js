/* eslint-disable */
import { BigQuery } from '@google-cloud/bigquery';
import { GoogleGenAI } from '@google/genai';

const projectId = process.env.BIGQUERY_PROJECT_ID || 'chronos-stress-sandbox';
const ELO_ALGORITHM_VERSION = 3;
let tablesEnsured = false;

const bq = new BigQuery({
  projectId: projectId,
  credentials: {
    client_email: process.env.BIGQUERY_CLIENT_EMAIL,
    private_key: process.env.BIGQUERY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

function normalizeAnswer(str) {
  if (!str) return '';
  return str
    .replace(/\$\$([\s\S]*?)\$\$/g, '$1')   // strip $$...$$
    .replace(/\$([\s\S]*?)\$/g, '$1')        // strip $...$
    .replace(/\\(?:text|mathrm|mathbf|mathit|rm|bf)\{([^}]*)\}/g, '$1') // \text{X} -> X
    .replace(/~/g, ' ')                      // LaTeX thin-space -> space
    .replace(/\s+/g, ' ')                    // collapse whitespace
    .trim()
    .toLowerCase();
}

function evaluateKeywordExpression(expression, userAnswer) {
  if (!expression) return false;
  const normalizedAnswer = normalizeAnswer(userAnswer);
  
  // Support single quotes/double quotes and words, retaining parenthesis and logical operators
  const tokens = expression.match(/'[^']+'|"[^"]+"|\(|\)|AND|OR|NOT|[a-zA-Z0-9_.-]+/gi) || [];
  
  const processedTokens = tokens.map(token => {
    const upper = token.toUpperCase();
    if (upper === 'AND') return '&&';
    if (upper === 'OR') return '||';
    if (upper === 'NOT') return '!';
    if (token === '(' || token === ')') return token;
    
    const cleanTerm = token.replace(/^['"]|['"]$/g, '');
    const normTerm = normalizeAnswer(cleanTerm);
    const present = normalizedAnswer.includes(normTerm);
    return present ? 'true' : 'false';
  });
  
  const jsExpression = processedTokens.join(' ');
  try {
    const safeRegex = /^(?:true|false|&&|\|\||!|\(|\)|\s)+$/;
    if (!safeRegex.test(jsExpression)) {
      return false;
    }
    return !!(new Function(`return (${jsExpression})`)());
  } catch (e) {
    console.error("Failed to evaluate keyword expression:", jsExpression, e);
    return false;
  }
}

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
    // 0. Ensure tables exist (once per cold start)
    if (!tablesEnsured) {
      await Promise.all([
        bq.query(`
          CREATE TABLE IF NOT EXISTS \`${projectId}\`.\`chronos_users\`.\`user_wrong_problems\` (
            user_id STRING NOT NULL, exam_id STRING NOT NULL, question_id STRING NOT NULL,
            subject STRING NOT NULL, topic STRING NOT NULL, question_text STRING NOT NULL,
            user_answer STRING, correct_answer STRING NOT NULL, created_at TIMESTAMP NOT NULL
          )
        `),
        bq.query(`
          CREATE TABLE IF NOT EXISTS \`${projectId}\`.\`chronos_users\`.\`user_weakness_analysis\` (
            user_id STRING NOT NULL, subject STRING NOT NULL,
            detailed_analysis STRING NOT NULL, updated_at TIMESTAMP NOT NULL
          )
        `),
        bq.query(`
          CREATE TABLE IF NOT EXISTS \`${projectId}\`.\`chronos_users\`.\`user_exam_results\` (
            user_id STRING NOT NULL, exam_id STRING NOT NULL,
            results_json STRING NOT NULL, created_at TIMESTAMP NOT NULL
          )
        `),
        bq.query(`
          CREATE TABLE IF NOT EXISTS \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\` (
            user_id STRING NOT NULL, subject STRING NOT NULL, topic STRING NOT NULL,
            good_at STRING NOT NULL, not_good_at STRING NOT NULL, updated_at TIMESTAMP NOT NULL
          )
        `),
        bq.query(`
          CREATE TABLE IF NOT EXISTS \`${projectId}\`.\`chronos_users\`.\`user_mistake_analysis\` (
            user_id STRING NOT NULL, exam_id STRING NOT NULL, subject STRING NOT NULL,
            mistake_patterns STRING NOT NULL, created_at TIMESTAMP NOT NULL
          )
        `)
      ]);
      tablesEnsured = true;
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    // A. Grade all questions in parallel! Solve on-the-fly and award partial credit!
    const gradedResults = await Promise.all(results.map(async (r) => {
      if (r.type === 'short_answer') {
        const correct = r.keywordExpression
          ? evaluateKeywordExpression(r.keywordExpression, r.userAnswer)
          : normalizeAnswer(r.userAnswer) === normalizeAnswer(r.answer);
        return {
          ...r,
          isCorrect: correct,
          score: correct ? 1.0 : 0.0
        };
      }

      if (r.type === 'multiple_choice') {
        const getOptionIndex = (val, opts) => {
          const letterIdx = ['A', 'B', 'C', 'D'].indexOf(String(val).trim().toUpperCase());
          if (letterIdx !== -1) return letterIdx;
          return opts.findIndex(o => normalizeAnswer(o) === normalizeAnswer(val));
        };
        const correctIdx = getOptionIndex(r.answer, r.options || []);
        const userIdx = getOptionIndex(r.userAnswer, r.options || []);
        const correct = correctIdx !== -1 && correctIdx === userIdx;
        return {
          ...r,
          isCorrect: correct,
          score: correct ? 1.0 : 0.0
        };
      }

      if (r.type === 'free_response') {
        try {
          const isImage = r.frqSubmission && (r.frqSubmission.type === 'whiteboard' || r.frqSubmission.type === 'image') && r.frqSubmission.value && r.frqSubmission.value.startsWith('data:image/');

          let gradingPrompt = `You are a world-class grading examiner. You are grading a student's free-response solution for a competitive Olympiad-level exam.

Question Details:
Subject: ${subject}
Topic: ${r.topic || 'General'}
Question Text: ${r.question}
`;

          if (isImage) {
            gradingPrompt += `\nThe student submitted their solution as a handwritten drawing or uploaded image of their scratch work/whiteboard.
Analyze the image carefully to understand their step-by-step logic, calculation progress, and final proof.`;
          } else {
            const textAns = r.frqSubmission?.value || r.userAnswer || 'No answer submitted.';
            gradingPrompt += `\nStudent's typed solution process:
${textAns}`;
          }

          gradingPrompt += `\n\nYour tasks:
1. Solve the question completely from scratch first to determine the correct step-by-step solution, the correct final answer, and establish a clear grading rubric.
2. Critically evaluate the student's solution against the correct solution. Compare both their explanation/process and final answer.
3. Award a partial credit score between 0.0 and 1.0 (where 1.0 is fully correct, 0.0 is completely wrong/timeout, and in-between represents partial credit based on correct logical steps shown). Give partial credit generously for valid logical steps, calculations, or methods, even if their final answer was incorrect.
4. Set 'isCorrect' to true if the score is greater than or equal to 0.7 (conceptually correct / very good progress), otherwise set it to false.
5. Provide clear, professional, pedagogical feedback explaining where they made mistakes and what they did well.
${isImage ? `6. Provide an extensive transcription/summary of the user's handwritten work, calculations, logic, and final proof shown in the image in the 'transcription' field.` : ''}

Return strictly a valid JSON object with the following schema:
{
  "correctSolution": "Your fully derived step-by-step correct solution",
  "correctAnswer": "The correct final answer",
  "score": 0.5,
  "isCorrect": true,
  "feedback": "Detailed grading feedback"${isImage ? `,\n  "transcription": "Extensive transcription of the user's work and proof in the image"` : ''}
}
Do NOT include markdown headers or backticks in the response. Return ONLY the raw JSON object.`;

          const contents = [];
          if (isImage) {
            const parts = r.frqSubmission.value.split(',');
            const base64Data = parts[1] || r.frqSubmission.value;
            let mimeType = 'image/png';
            const mimeMatch = parts[0].match(/data:(.*?);/);
            if (mimeMatch) {
              mimeType = mimeMatch[1];
            }
            contents.push({
              inlineData: {
                data: base64Data,
                mimeType: mimeType
              }
            });
          }
          contents.push(gradingPrompt);

          const gradingResponse = await ai.models.generateContent({
            model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
            contents: contents,
            config: {
              responseMimeType: "application/json",
              temperature: 0.2
            }
          });

          const graded = JSON.parse(gradingResponse.text);
          return {
            ...r,
            isCorrect: !!graded.isCorrect,
            score: Number(graded.score) || 0,
            feedback: graded.feedback,
            answer: graded.correctAnswer || r.answer || '',
            solution: graded.correctSolution,
            userAnswer: isImage ? (graded.transcription || r.userAnswer) : r.userAnswer
          };
        } catch (err) {
          console.error('Error grading FRQ question:', r.id, err);
          return {
            ...r,
            isCorrect: false,
            score: 0,
            feedback: 'Grading failed due to an error.',
          };
        }
      }
      return r;
    }));

    // B. Recompute ELO if there are free_response questions to accurately reflect AI grading & partial credits!
    let finalAccuracy = accuracy;
    let finalRatingChange = ratingChange;
    let finalNewRating = newRating;

    const hasFRQ = gradedResults.some(r => r.type === 'free_response');
    if (hasFRQ) {
      const totalQuestions = gradedResults.length;
      const totalScore = gradedResults.reduce((acc, r) => acc + (r.score !== undefined ? r.score : (r.isCorrect ? 1 : 0)), 0);
      finalAccuracy = totalScore / totalQuestions;

      let ratingColumn = 'math_rating';
      if (subject === 'Physics') ratingColumn = 'physics_rating';
      else if (subject === 'Chemistry') ratingColumn = 'chemistry_rating';

      let currentRating = 100;
      try {
        const [userRows] = await bq.query({
          query: `SELECT ${ratingColumn} FROM \`${projectId}\`.\`chronos_users\`.\`users\` WHERE user_id = @username`,
          params: { username: sanitizedUser }
        });
        if (userRows && userRows.length > 0) {
          currentRating = userRows[0][ratingColumn] || 100;
        }
      } catch (e) {
        console.error('Failed to fetch user rating for recalculation:', e);
      }

      const getQuestionRating = (sub, diff) => {
        const d = Math.max(1, Math.min(10, diff));
        if (sub === 'Math') {
          const mathMap = { 1: 500, 2: 600, 3: 800, 4: 900, 5: 1000, 6: 1250, 7: 1500, 8: 2000, 9: 2500, 10: 3000 };
          return mathMap[Math.round(d)] || 1000;
        } else if (sub === 'Chemistry') {
          const chemMap = { 1: 100, 2: 300, 3: 500, 4: 750, 5: 1000, 6: 1250, 7: 1500, 8: 2000, 9: 2500, 10: 3000 };
          return chemMap[Math.round(d)] || 1000;
        } else if (sub === 'Physics') {
          const physMap = { 1: 100, 2: 300, 3: 500, 4: 750, 5: 1000, 6: 1300, 7: 1600, 8: 2000, 9: 2500, 10: 3000 };
          return physMap[Math.round(d)] || 1000;
        }
        return 100;
      };

      const sumQuestionRatings = gradedResults.reduce((acc, r) => acc + getQuestionRating(subject, r.difficulty || 5), 0);
      const avgQuestionRating = sumQuestionRatings / totalQuestions;

      let expectedScore = 1 / (1 + Math.pow(10, (avgQuestionRating - currentRating) / 400));
      if (avgQuestionRating < currentRating) {
        expectedScore = Math.max(expectedScore, 0.75);
      }

      let isChallenged = false;
      try {
        const [historyRows] = await bq.query({
          query: `SELECT accuracy FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_history\` 
            WHERE user_id = @username AND subject = @subject ORDER BY created_at DESC LIMIT 5`,
          params: { username: sanitizedUser, subject }
        });
        let consecutiveFailCount = 0;
        for (const h of historyRows) {
          if (h.accuracy < 0.75) {
            consecutiveFailCount++;
          } else {
            consecutiveFailCount = 0;
          }
          if (consecutiveFailCount >= 2) {
            isChallenged = true;
          }
        }
        if (finalAccuracy < 0.75) {
          consecutiveFailCount++;
        } else {
          consecutiveFailCount = 0;
        }
        if (consecutiveFailCount >= 2) {
          isChallenged = true;
        }
      } catch (e) {
        console.error('Failed to fetch history for challenge check:', e);
      }

      const K = isChallenged ? 32 : 250;
      const questionMultiplier = Math.sqrt(totalQuestions / 5);
      finalRatingChange = Math.round(K * questionMultiplier * (finalAccuracy - expectedScore));
      finalNewRating = Math.max(100, currentRating + finalRatingChange);
    }

    const isGuest = sanitizedUser === 'default_user';

    if (!isGuest) {
      // 1. Fire history insert, results insert, and rating update in parallel
      let ratingColumn = 'math_rating';
      if (subject === 'Physics') ratingColumn = 'physics_rating';
      else if (subject === 'Chemistry') ratingColumn = 'chemistry_rating';

      await Promise.all([
        bq.query({
          query: `INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_exam_history\` 
            (user_id, exam_id, subject, accuracy, avg_time, rating_change, new_rating, created_at)
            VALUES (@username, @examId, @subject, @accuracy, @avgTime, @ratingChange, @newRating, CURRENT_TIMESTAMP())`,
          params: { username: sanitizedUser, examId, subject, accuracy: finalAccuracy, avgTime, ratingChange: finalRatingChange, newRating: finalNewRating }
        }),
        bq.query({
          query: `INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`
            (user_id, exam_id, results_json, created_at)
            VALUES (@username, @examId, @resultsJson, CURRENT_TIMESTAMP())`,
          params: { username: sanitizedUser, examId, resultsJson: JSON.stringify(gradedResults) }
        }),
        bq.query({
          query: `UPDATE \`${projectId}\`.\`chronos_users\`.\`users\`
            SET ${ratingColumn} = @newRating, elo_version = @eloVersion
            WHERE user_id = @username`,
          params: { username: sanitizedUser, newRating: finalNewRating, eloVersion: ELO_ALGORITHM_VERSION }
        })
      ]);

      // 2. Record wrong problems + update topic mastery
      const topicStats = {};
      const wrongInsertPromises = [];
      for (const r of gradedResults) {
        const topic = r.topic || 'General';
        if (!topicStats[topic]) {
          topicStats[topic] = { correct: 0, total: 0 };
        }
        topicStats[topic].total += 1;
        if (r.isCorrect) {
          topicStats[topic].correct += 1;
        } else {
          wrongInsertPromises.push(
            bq.query({
              query: `INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_wrong_problems\`
                (user_id, exam_id, question_id, subject, topic, question_text, user_answer, correct_answer, created_at)
                VALUES (@username, @examId, @questionId, @subject, @topic, @questionText, @userAnswer, @correctAnswer, CURRENT_TIMESTAMP())`,
              params: {
                username: sanitizedUser, examId,
                questionId: r.id || String(Date.now()),
                subject, topic,
                questionText: r.question,
                userAnswer: r.userAnswer || '',
                correctAnswer: r.answer || ''
              }
            })
          );
        }
      }

      // Fetch all existing mastery rows for this user+subject in one query
      const topicNames = Object.keys(topicStats);
      let existingMasteryMap = {};
      if (topicNames.length > 0) {
        const [masteryRows] = await bq.query({
          query: `SELECT sub_category, correct_count, total_count
            FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
            WHERE user_id = @username AND subject = @subject`,
          params: { username: sanitizedUser, subject }
        });
        for (const row of masteryRows) {
          existingMasteryMap[row.sub_category] = row;
        }
      }

      // Build mastery upsert promises
      const masteryPromises = [];
      for (const [topic, stats] of Object.entries(topicStats)) {
        const existing = existingMasteryMap[topic];
        if (existing) {
          const nextCorrect = existing.correct_count + stats.correct;
          const nextTotal = existing.total_count + stats.total;
          const nextAccuracy = nextCorrect / nextTotal;
          masteryPromises.push(
            bq.query({
              query: `UPDATE \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
                SET correct_count = @nextCorrect, total_count = @nextTotal, accuracy_rate = @nextAccuracy
                WHERE user_id = @username AND sub_category = @topic AND subject = @subject`,
              params: { username: sanitizedUser, topic, subject, nextCorrect, nextTotal, nextAccuracy }
            })
          );
        } else {
          const accuracyRate = stats.correct / stats.total;
          masteryPromises.push(
            bq.query({
              query: `INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\` 
                (user_id, sub_category, subject, correct_count, total_count, accuracy_rate)
                VALUES (@username, @topic, @subject, @correct, @total, @accuracyRate)`,
              params: { username: sanitizedUser, topic, subject, correct: stats.correct, total: stats.total, accuracyRate }
            })
          );
        }
      }

      // Fire wrong inserts + mastery upserts in parallel
      await Promise.all([...wrongInsertPromises, ...masteryPromises]);

      // 4. Trigger update of user weaknesses using direct Gemini model
      const [freshAnalysis, freshMistakePatterns] = await Promise.all([
        updateAIWeaknesses(sanitizedUser, subject),
        analyzeMistakesAndSave(sanitizedUser, examId, subject, gradedResults)
      ]);

      return res.status(200).json({ 
        success: true, 
        detailedAnalysis: freshAnalysis, 
        mistakePatterns: freshMistakePatterns,
        results: gradedResults,
        accuracy: finalAccuracy,
        ratingChange: finalRatingChange,
        newRating: finalNewRating
      });
    } else {
      // For Guest user: run mistake analysis via Gemini without BigQuery insert, return detailedAnalysis as null
      const freshMistakePatterns = await analyzeMistakesAndSave(sanitizedUser, examId, subject, gradedResults);
      return res.status(200).json({ 
        success: true, 
        detailedAnalysis: null, 
        mistakePatterns: freshMistakePatterns,
        results: gradedResults,
        accuracy: finalAccuracy,
        ratingChange: finalRatingChange,
        newRating: finalNewRating
      });
    }

  } catch (err) {
    console.error('Submit exam error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}

// Background worker function to analyze wrong problems and update weaknesses
async function updateAIWeaknesses(username, subject) {
  try {
    // Tables already ensured in cold-start block

    // A. Fetch incorrect questions for this user and subject
    const fetchWrongProblemsQuery = `
      SELECT topic, question_text, user_answer, correct_answer
      FROM \`${projectId}\`.\`chronos_users\`.\`user_wrong_problems\`
      WHERE user_id = @username AND subject = @subject
    `;
    const [wrongProblems] = await bq.query({
      query: fetchWrongProblemsQuery,
      params: { username, subject }
    });
    
    if (!wrongProblems || wrongProblems.length === 0) return null;

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
      
      if (Array.isArray(strengths) || Array.isArray(weaknesses)) {
        // Fetch all existing mastery rows in one query
        const allTopics = [...new Set([...(strengths || []), ...(weaknesses || [])])];
        let masteryMap = {};
        if (allTopics.length > 0) {
          const [rows] = await bq.query({
            query: `SELECT sub_category, correct_count, total_count
              FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
              WHERE user_id = @username AND subject = @subject`,
            params: { username, subject }
          });
          for (const row of rows) {
            masteryMap[row.sub_category] = row;
          }
        }

        const upsertPromises = [];

        if (Array.isArray(strengths)) {
          for (const topic of strengths) {
            if (masteryMap[topic]) {
              upsertPromises.push(bq.query({
                query: `UPDATE \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
                  SET correct_count = 4, total_count = 6, accuracy_rate = 0.80
                  WHERE user_id = @username AND sub_category = @topic AND subject = @subject`,
                params: { username, topic, subject }
              }));
            } else {
              upsertPromises.push(bq.query({
                query: `INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
                  (user_id, sub_category, subject, correct_count, total_count, accuracy_rate)
                  VALUES (@username, @topic, @subject, 4, 6, 0.80)`,
                params: { username, topic, subject }
              }));
            }
          }
        }

        if (Array.isArray(weaknesses)) {
          for (const topic of weaknesses) {
            if (masteryMap[topic]) {
              upsertPromises.push(bq.query({
                query: `UPDATE \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
                  SET correct_count = 2, total_count = 6, accuracy_rate = 0.40
                  WHERE user_id = @username AND sub_category = @topic AND subject = @subject`,
                params: { username, topic, subject }
              }));
            } else {
              upsertPromises.push(bq.query({
                query: `INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
                  (user_id, sub_category, subject, correct_count, total_count, accuracy_rate)
                  VALUES (@username, @topic, @subject, 2, 6, 0.40)`,
                params: { username, topic, subject }
              }));
            }
          }
        }

        // Fire topic breakdowns in parallel too
        if (Array.isArray(topicBreakdowns)) {
          for (const b of topicBreakdowns) {
            upsertPromises.push(bq.query({
              query: `MERGE \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\` T
                USING (SELECT @username AS user_id, @subject AS subject, @topic AS topic) S
                ON T.user_id = S.user_id AND T.subject = S.subject AND T.topic = S.topic
                WHEN MATCHED THEN
                  UPDATE SET good_at = @goodAt, not_good_at = @notGoodAt, updated_at = CURRENT_TIMESTAMP()
                WHEN NOT MATCHED THEN
                  INSERT (user_id, subject, topic, good_at, not_good_at, updated_at)
                  VALUES (@username, @subject, @topic, @goodAt, @notGoodAt, CURRENT_TIMESTAMP())`,
              params: { username, subject, topic: b.topic, goodAt: b.good_at, notGoodAt: b.not_good_at }
            }));
          }
        }

        // Fire analysis merge in parallel
        if (detailedAnalysis) {
          upsertPromises.push(bq.query({
            query: `MERGE \`${projectId}\`.\`chronos_users\`.\`user_weakness_analysis\` T
              USING (SELECT @username AS user_id, @subject AS subject) S
              ON T.user_id = S.user_id AND T.subject = S.subject
              WHEN MATCHED THEN
                UPDATE SET detailed_analysis = @detailedAnalysis, updated_at = CURRENT_TIMESTAMP()
              WHEN NOT MATCHED THEN
                INSERT (user_id, subject, detailed_analysis, updated_at)
                VALUES (@username, @subject, @detailedAnalysis, CURRENT_TIMESTAMP())`,
            params: { username, subject, detailedAnalysis }
          }));
        }

        await Promise.all(upsertPromises);
        return detailedAnalysis || null;
      } else {
        // No strengths/weaknesses but may have analysis/breakdowns
        const miscPromises = [];
        if (Array.isArray(topicBreakdowns)) {
          for (const b of topicBreakdowns) {
            miscPromises.push(bq.query({
              query: `MERGE \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\` T
                USING (SELECT @username AS user_id, @subject AS subject, @topic AS topic) S
                ON T.user_id = S.user_id AND T.subject = S.subject AND T.topic = S.topic
                WHEN MATCHED THEN
                  UPDATE SET good_at = @goodAt, not_good_at = @notGoodAt, updated_at = CURRENT_TIMESTAMP()
                WHEN NOT MATCHED THEN
                  INSERT (user_id, subject, topic, good_at, not_good_at, updated_at)
                  VALUES (@username, @subject, @topic, @goodAt, @notGoodAt, CURRENT_TIMESTAMP())`,
              params: { username, subject, topic: b.topic, goodAt: b.good_at, notGoodAt: b.not_good_at }
            }));
          }
        }
        if (detailedAnalysis) {
          miscPromises.push(bq.query({
            query: `MERGE \`${projectId}\`.\`chronos_users\`.\`user_weakness_analysis\` T
              USING (SELECT @username AS user_id, @subject AS subject) S
              ON T.user_id = S.user_id AND T.subject = S.subject
              WHEN MATCHED THEN
                UPDATE SET detailed_analysis = @detailedAnalysis, updated_at = CURRENT_TIMESTAMP()
              WHEN NOT MATCHED THEN
                INSERT (user_id, subject, detailed_analysis, updated_at)
                VALUES (@username, @subject, @detailedAnalysis, CURRENT_TIMESTAMP())`,
            params: { username, subject, detailedAnalysis }
          }));
        }
        if (miscPromises.length > 0) await Promise.all(miscPromises);
        return detailedAnalysis || null;
      }
    }
    return null;
  } catch (err) {
    console.error('Background AI weaknesses update failed:', err);
    return null;
  }
}

async function analyzeMistakesAndSave(username, examId, subject, results) {
  try {
    // Table already ensured in cold-start block

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
    if (username !== 'default_user') {
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
    }
    return mistakePatterns;
  } catch (err) {
    console.error('Error in mistake analysis background job:', err);
    return null;
  }
}
