import { BigQuery } from '@google-cloud/bigquery';
import { executeWithRetry, parseJSONResponse } from './_gemini.js';
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
const ELO_ALGORITHM_VERSION = 3;
let tablesEnsured = false;
let tagsTableEnsured = false;

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
    .replace(/\\\[([\s\S]*?)\\\]/g, '$1')   // strip \[...\]
    .replace(/\\\(([\s\S]*?)\\\)/g, '$1')   // strip \(...\)
    .replace(/\\(text|mathrm|mathbf|mathit|rm|bf)\{([^}]*)\}/g, '$2') // \text{X} -> X
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
  const { route } = req.query;

  // Ensure tables exist (once per cold start)
  if (!tablesEnsured) {
    try {
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
        `),
        bq.query(`
          CREATE TABLE IF NOT EXISTS \`${projectId}\`.\`chronos_users\`.\`user_active_exams\` (
            user_id STRING NOT NULL,
            exam_id STRING NOT NULL,
            subject STRING NOT NULL,
            config_json STRING NOT NULL,
            problems_json STRING NOT NULL,
            answers_json STRING NOT NULL,
            frq_submissions_json STRING,
            current_question_index INT64 NOT NULL,
            created_at TIMESTAMP NOT NULL,
            updated_at TIMESTAMP NOT NULL
          )
        `),
        bq.query(`
          ALTER TABLE \`${projectId}\`.\`chronos_users\`.\`user_exam_history\`
          ADD COLUMN IF NOT EXISTS assignment_id STRING
        `),
        bq.query(`
          ALTER TABLE \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`
          ADD COLUMN IF NOT EXISTS assignment_id STRING
        `),
        bq.query(`
          ALTER TABLE \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`
          ADD COLUMN IF NOT EXISTS interaction_ids_json STRING
        `),
        bq.query(`
          CREATE TABLE IF NOT EXISTS \`${projectId}\`.\`chronos_users\`.\`student_homework_questions\` (
            assignment_id STRING NOT NULL,
            student_id STRING NOT NULL,
            questions_json STRING NOT NULL,
            created_at TIMESTAMP NOT NULL
          )
        `),
        bq.query(`
          ALTER TABLE \`${projectId}\`.\`chronos_users\`.\`user_wrong_problems\`
          ADD COLUMN IF NOT EXISTS options STRING,
          ADD COLUMN IF NOT EXISTS question_type STRING,
          ADD COLUMN IF NOT EXISTS ai_explanation STRING,
          ADD COLUMN IF NOT EXISTS repetitions INT64,
          ADD COLUMN IF NOT EXISTS interval_days INT64,
          ADD COLUMN IF NOT EXISTS ease_factor FLOAT64,
          ADD COLUMN IF NOT EXISTS next_review_at TIMESTAMP
        `)
      ]);
      tablesEnsured = true;
    } catch (e) {
      console.warn("Alter table error or already exists in exams.js:", e);
    }
  }

  // 1. Get Exam Route
  if (route === 'get-exam') {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { examId } = req.query;
    if (!examId) {
      return res.status(400).json({ error: 'Exam ID is required' });
    }

    try {
      const consolidatedQuery = `
        WITH results AS (
          SELECT 'results' AS type, TO_JSON_STRING(STRUCT(results_json, interaction_ids_json)) AS data
          FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`
          WHERE exam_id = @examId
          LIMIT 1
        ),
        mistake AS (
          SELECT 'mistake' AS type, TO_JSON_STRING(STRUCT(mistake_patterns)) AS data
          FROM \`${projectId}\`.\`chronos_users\`.\`user_mistake_analysis\`
          WHERE exam_id = @examId
          LIMIT 1
        ),
        tags AS (
          SELECT 'tags' AS type, TO_JSON_STRING(STRUCT(question_index, tag)) AS data
          FROM \`${projectId}\`.\`chronos_users\`.\`user_problem_tags\`
          WHERE exam_id = @examId
        )
        SELECT type, data FROM results
        UNION ALL
        SELECT type, data FROM mistake
        UNION ALL
        SELECT type, data FROM tags
      `;

      const params = { examId };
      const [rows] = await bq.query({ query: consolidatedQuery, params });

      let results_json = null;
      let interaction_ids_json = null;
      let mistakeRows = [];
      const tagRows = [];

      for (const r of rows) {
        try {
          const parsed = JSON.parse(r.data);
          if (r.type === 'results') {
            results_json = parsed.results_json;
            interaction_ids_json = parsed.interaction_ids_json;
          }
          else if (r.type === 'mistake') mistakeRows.push(parsed);
          else if (r.type === 'tags') tagRows.push(parsed);
        } catch (e) {
          console.error("Failed to parse get-exam consolidated row:", r, e);
        }
      }

      if (!results_json) {
        return res.status(404).json({ error: 'Exam results not found' });
      }
      const results = JSON.parse(results_json);
      const mistakePatterns = mistakeRows.length > 0 ? mistakeRows[0].mistake_patterns : null;

      tagRows.sort((a, b) => {
        const qa = a.question_index !== null && a.question_index !== undefined ? Number(a.question_index) : 0;
        const qb = b.question_index !== null && b.question_index !== undefined ? Number(b.question_index) : 0;
        return qa - qb;
      });

      const savedTags = tagRows.map(r => {
        let qIdx = r.question_index;
        if (qIdx !== null && qIdx !== undefined) {
          if (typeof qIdx === 'object' && qIdx.value !== undefined) {
            qIdx = parseInt(qIdx.value, 10);
          } else if (typeof qIdx === 'bigint') {
            qIdx = Number(qIdx);
          } else {
            qIdx = parseInt(qIdx, 10);
          }
        }
        return { questionIndex: qIdx, tag: r.tag };
      });

      return res.status(200).json({
        results,
        mistakePatterns,
        savedTags,
        interactionIds: interaction_ids_json ? JSON.parse(interaction_ids_json) : null
      });
    } catch (err) {
      console.error('Get exam error:', err);
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  // 2. Remark Correct Route
  if (route === 'remark-correct') {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { username, examId, questionId, subject, topic, explanation, interactionIds } = req.body;

    if (!username || !examId || !questionId || !subject || !topic) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const sanitizedUser = username.trim().toLowerCase();

    try {
      // 1. Fetch current results_json from user_exam_results and history details from user_exam_history
      const consolidatedQuery = `
        WITH exam AS (
          SELECT 'exam' AS type, TO_JSON_STRING(STRUCT(results_json)) AS data
          FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`
          WHERE exam_id = @examId AND user_id = @username
          LIMIT 1
        ),
        hist AS (
          SELECT 'hist' AS type, TO_JSON_STRING(STRUCT(rating_change, new_rating, avg_time, accuracy)) AS data
          FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_history\`
          WHERE exam_id = @examId AND user_id = @username
          LIMIT 1
        )
        SELECT type, data FROM exam
        UNION ALL
        SELECT type, data FROM hist
      `;

      const [rows] = await bq.query({ query: consolidatedQuery, params: { examId, username: sanitizedUser } });

      let examData = null;
      let histData = null;

      for (const r of rows) {
        const parsed = JSON.parse(r.data);
        if (r.type === 'exam') examData = parsed.results_json;
        else if (r.type === 'hist') histData = parsed;
      }

      if (!examData || !histData) {
        return res.status(404).json({ error: 'Exam details or history not found' });
      }

      const results = JSON.parse(examData);
      const hist = histData;

      // 2. Find and update the specific question
      let questionFound = false;
      for (const r of results) {
        if (r.id === questionId) {
          r.isCorrect = true;
          if (explanation) {
            r.aiExplanation = explanation;
          }
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
      const score = correctCount / totalCount;
      const newAccuracy = Math.round(score * 100) || 0;

      // 4. Recalculate ELO Rating
      const oldRating = hist.new_rating - hist.rating_change;
      const avgQuestionRating = hist.avg_time;
      const questionMultiplier = Math.sqrt(totalCount / 5);

      let expectedScore = 1 / (1 + Math.pow(10, (avgQuestionRating - oldRating) / 400));
      if (avgQuestionRating < oldRating) {
        expectedScore = Math.max(expectedScore, 0.75);
      }

      // Solve for original K factor (either 32 or 250)
      const originalScore = (correctCount - 1) / totalCount;
      const diff32 = Math.round(32 * questionMultiplier * (originalScore - expectedScore));
      const diff250 = Math.round(250 * questionMultiplier * (originalScore - expectedScore));
      let K = 250;
      if (Math.abs(diff32 - hist.rating_change) < Math.abs(diff250 - hist.rating_change)) {
        K = 32;
      }

      const newRatingChange = Math.round(K * questionMultiplier * (score - expectedScore));
      const newRatingVal = Math.max(100, oldRating + newRatingChange);
      const ratingDiff = newRatingVal - hist.new_rating;

      // 5. Update user_exam_results, user_exam_history, delete wrong problem entry, and update active ELO
      let ratingColumn = 'math_rating';
      if (subject === 'Physics') ratingColumn = 'physics_rating';
      else if (subject === 'Chemistry') ratingColumn = 'chemistry_rating';

      await Promise.all([
        bq.query({
          query: `UPDATE \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`
            SET results_json = @resultsJson,
                interaction_ids_json = @interactionIdsJson
            WHERE exam_id = @examId AND user_id = @username`,
          params: { 
            examId, 
            username: sanitizedUser, 
            resultsJson: JSON.stringify(results),
            interactionIdsJson: interactionIds ? JSON.stringify(interactionIds) : null
          },
          types: {
            interactionIdsJson: 'STRING'
          }
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
      const topics = topic.split(',').map(t => t.trim()).filter(Boolean);
      for (const t of topics) {
        const getMasteryQuery = `
          SELECT correct_count, total_count
          FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
          WHERE user_id = @username AND sub_category = @topic AND subject = @subject
          LIMIT 1
        `;
        const [masteryRows] = await bq.query({
          query: getMasteryQuery,
          params: { username: sanitizedUser, topic: t, subject }
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
            params: { username: sanitizedUser, topic: t, subject, nextCorrect, nextAccuracy }
          });
        }
      }

      return res.status(200).json({ success: true, newAccuracy, newRatingVal, newRatingChange });
    } catch (err) {
      console.error('Remark correct error:', err);
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  // 3. Save Tags Route
  if (route === 'save-tags') {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { username, examId, tags } = req.body;

    if (!username || !examId || !Array.isArray(tags)) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const sanitizedUser = username.trim().toLowerCase();

    try {
      // Ensure table exists (once per cold start)
      if (!tagsTableEnsured) {
        await bq.query(`
          CREATE TABLE IF NOT EXISTS \`${projectId}\`.\`chronos_users\`.\`user_problem_tags\` (
            user_id STRING NOT NULL, exam_id STRING NOT NULL, question_index INT64 NOT NULL,
            tag STRING NOT NULL, is_correct BOOL NOT NULL, points_value FLOAT64, created_at TIMESTAMP NOT NULL
          )
        `);
        tagsTableEnsured = true;
      }

      // Delete any existing tags for this exam (allows re-tagging)
      await bq.query({
        query: `DELETE FROM \`${projectId}\`.\`chronos_users\`.\`user_problem_tags\`
          WHERE user_id = @username AND exam_id = @examId`,
        params: { username: sanitizedUser, examId }
      });

      // Insert all tags in parallel
      const insertQuery = `
        INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_problem_tags\`
          (user_id, exam_id, question_index, tag, is_correct, points_value, created_at)
        VALUES
          (@username, @examId, @questionIndex, @tag, @isCorrect, @pointsValue, CURRENT_TIMESTAMP())
      `;
      await Promise.all(tags.map(t =>
        bq.query({
          query: insertQuery,
          params: {
            username: sanitizedUser,
            examId,
            questionIndex: t.questionIndex,
            tag: t.tag,
            isCorrect: t.isCorrect,
            pointsValue: t.pointsValue || 0
          }
        })
      ));

      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('Save tags error:', err);
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  // 4. Save Explanation Route
  if (route === 'save-explanation') {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { username, examId, questionId, explanation, interactionIds } = req.body;

    if (!username || !examId || !questionId || !explanation) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const sanitizedUser = username.trim().toLowerCase();

    try {
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

      let questionFound = false;
      for (const r of results) {
        if (r.id === questionId) {
          r.aiExplanation = explanation;
          questionFound = true;
          break;
        }
      }

      if (!questionFound) {
        return res.status(404).json({ error: 'Question not found in this exam' });
      }

      await bq.query({
        query: `UPDATE \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`
          SET results_json = @resultsJson,
              interaction_ids_json = @interactionIdsJson
          WHERE exam_id = @examId AND user_id = @username`,
        params: { 
          examId, 
          username: sanitizedUser, 
          resultsJson: JSON.stringify(results),
          interactionIdsJson: interactionIds ? JSON.stringify(interactionIds) : null
        },
        types: {
          interactionIdsJson: 'STRING'
        }
      });

      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('Save explanation error:', err);
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  // 4a-2. Delete Active Exam Route
  if (route === 'delete-active-exam') {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { username, examId } = req.body;
    if (!username || !examId) {
      return res.status(400).json({ error: 'Username and Exam ID are required' });
    }

    const sanitizedUser = username.trim().toLowerCase();

    try {
      await bq.query({
        query: `DELETE FROM \`${projectId}\`.\`chronos_users\`.\`user_active_exams\`
          WHERE user_id = @username AND exam_id = @examId`,
        params: { username: sanitizedUser, examId }
      });
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('Delete active exam error:', err);
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  // 4b. Save Active Exam Route
  if (route === 'save-active-exam') {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { username, examId, subject, config, problems, answers, frqSubmissions, currentQuestionIndex } = req.body;

    if (!username || !examId || !subject || !config || !problems || !answers) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const sanitizedUser = username.trim().toLowerCase();
    if (sanitizedUser === 'default_user') {
      return res.status(200).json({ success: true, message: 'Guest active exams are not stored in BigQuery' });
    }

    try {
      const mergeQuery = `
        MERGE \`${projectId}\`.\`chronos_users\`.\`user_active_exams\` T
        USING (SELECT @username AS user_id, @examId AS exam_id) S
        ON T.user_id = S.user_id AND T.exam_id = S.exam_id
        WHEN MATCHED THEN
          UPDATE SET
            config_json = @configJson,
            problems_json = @problemsJson,
            answers_json = @answersJson,
            frq_submissions_json = @frqSubmissionsJson,
            current_question_index = @currentQuestionIndex,
            updated_at = CURRENT_TIMESTAMP()
        WHEN NOT MATCHED THEN
          INSERT (user_id, exam_id, subject, config_json, problems_json, answers_json, frq_submissions_json, current_question_index, created_at, updated_at)
          VALUES (@username, @examId, @subject, @configJson, @problemsJson, @answersJson, @frqSubmissionsJson, @currentQuestionIndex, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
      `;

      await bq.query({
        query: mergeQuery,
        params: {
          username: sanitizedUser,
          examId,
          subject,
          configJson: JSON.stringify(config),
          problemsJson: JSON.stringify(problems),
          answersJson: JSON.stringify(answers),
          frqSubmissionsJson: JSON.stringify(frqSubmissions || []),
          currentQuestionIndex: Number(currentQuestionIndex) || 0
        }
      });

      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('Save active exam error:', err);
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  // 5. Submit Exam Route (Default fallback/submit-exam)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, subject, examId, accuracy, avgTime, ratingChange, newRating, results, assignmentId } = req.body;
  const isRated = req.body.isRated !== false;

  if (!username || !subject || !examId || accuracy === undefined || !results) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const sanitizedUser = username.trim().toLowerCase();

  try {

    // Grade all questions in parallel! Solve on-the-fly and award partial credit!
    const hasFRQ = results.some(r => r.type === 'free_response');

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
        return {
          ...r,
          isCorrect: null,
          score: 0.0,
          feedback: 'Grading in progress...'
        };
      }
    }));

    // Assign content-based unique IDs to graded results to ensure consistency across tables

    // Recompute ELO if there are free_response questions to accurately reflect AI grading & partial credits!
    let finalAccuracy = accuracy;
    let finalRatingChange = ratingChange;
    let finalNewRating = newRating;

    if (isRated === false) {
      finalRatingChange = 0;
      if (sanitizedUser !== 'default_user') {
        let ratingColumn = 'math_rating';
        if (subject === 'Physics') ratingColumn = 'physics_rating';
        else if (subject === 'Chemistry') ratingColumn = 'chemistry_rating';

        try {
          const [userRows] = await bq.query({
            query: `SELECT ${ratingColumn} FROM \`${projectId}\`.\`chronos_users\`.\`users\` WHERE user_id = @username`,
            params: { username: sanitizedUser }
          });
          if (userRows && userRows.length > 0) {
            finalNewRating = userRows[0][ratingColumn] || 100;
          }
        } catch (e) {
          console.error('Failed to fetch user rating for unrated exam:', e);
          finalNewRating = newRating;
        }
      }
    } else if (hasFRQ) {
      const gradedOnlyResults = gradedResults.filter(r => r.isCorrect !== null && r.isCorrect !== undefined);
      const totalQuestions = gradedOnlyResults.length || 1;
      const totalScore = gradedOnlyResults.reduce((acc, r) => acc + (r.score !== undefined ? r.score : (r.isCorrect ? 1 : 0)), 0);
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
        const eloMap = new Map([[1, 100], [2, 300], [3, 500], [4, 750], [5, 1000], [6, 1250], [7, 1500], [8, 2000], [9, 2500], [10, 3000]]);
        return eloMap.get(Math.round(d)) || 1000;
      };

      const sumQuestionRatings = gradedOnlyResults.reduce((acc, r) => acc + getQuestionRating(subject, r.difficulty || 5), 0);
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

    // 0. Add questions to pregenerated_questions table in BigQuery (non-mock questions only)
    const nonMockQuestions = gradedResults.filter(q => {
      if (!q.id || !q.question) return false;
      const isMock = q.id.toString().toLowerCase().includes('mock') || 
                     q.question.toString().startsWith('Mock') ||
                     /^\d+-\d+$/.test(q.id); // Matches Date.now()-i format
      return !isMock;
    });

    if (nonMockQuestions.length > 0) {
      const normSubject = String(subject).trim().toLowerCase();
      const selectClauses = [];
      const params = {};
      const types = {};

      nonMockQuestions.forEach((q, idx) => {
        const idParam = `qid_${idx}`;
        const subjectParam = `sub_${idx}`;
        const topicParam = `topic_${idx}`;
        const diffParam = `diff_${idx}`;
        const typeParam = `type_${idx}`;
        const jsonParam = `json_${idx}`;

        const cleanQuestion = {
          id: q.id,
          topic: q.topic || 'General',
          question: q.question,
          type: q.type,
          difficulty: Number(q.difficulty !== undefined ? q.difficulty : 5),
          answer: q.answer || '',
          detailedSolution: q.detailedSolution || ''
        };
        if (q.options) cleanQuestion.options = q.options;
        if (q.keywordExpression) cleanQuestion.keywordExpression = q.keywordExpression;

        params[idParam] = String(q.id);
        params[subjectParam] = normSubject;
        params[topicParam] = String(q.topic || 'General');
        params[diffParam] = Number(q.difficulty !== undefined ? q.difficulty : 5);
        params[typeParam] = String(q.type);
        params[jsonParam] = JSON.stringify(cleanQuestion);

        types[idParam] = 'STRING';
        types[subjectParam] = 'STRING';
        types[topicParam] = 'STRING';
        types[diffParam] = 'INT64';
        types[typeParam] = 'STRING';
        types[jsonParam] = 'STRING';

        selectClauses.push(`
          SELECT 
            @${idParam} AS question_id,
            @${subjectParam} AS subject,
            @${topicParam} AS topic,
            @${diffParam} AS difficulty,
            @${typeParam} AS type,
            @${jsonParam} AS question_json
        `);
      });

      const batchMergePregenQuery = `
        MERGE \`${projectId}\`.\`chronos_users\`.\`pregenerated_questions\` T
        USING (
          ${selectClauses.join('\n          UNION ALL\n          ')}
        ) S
        ON T.question_id = S.question_id
        WHEN NOT MATCHED THEN
          INSERT (question_id, subject, topic, difficulty, type, question_json, created_at)
          VALUES (S.question_id, S.subject, S.topic, S.difficulty, S.type, S.question_json, CURRENT_TIMESTAMP())
      `;

      try {
        await bq.query({
          query: batchMergePregenQuery,
          params,
          types
        });
      } catch (pregenErr) {
        console.error('Failed to add questions to pregenerated_questions:', pregenErr);
      }
    }

    const isGuest = sanitizedUser === 'default_user';

    if (!isGuest) {
      // 1. Fire history insert, results insert, and rating update in parallel
      let ratingColumn = 'math_rating';
      if (subject === 'Physics') ratingColumn = 'physics_rating';
      else if (subject === 'Chemistry') ratingColumn = 'chemistry_rating';

      const updatePromises = [
        bq.query({
          query: `INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_exam_history\` 
            (user_id, exam_id, subject, accuracy, avg_time, rating_change, new_rating, created_at, assignment_id)
            VALUES (@username, @examId, @subject, @accuracy, @avgTime, @ratingChange, @newRating, CURRENT_TIMESTAMP(), @assignmentId)`,
          params: { username: sanitizedUser, examId, subject, accuracy: finalAccuracy, avgTime, ratingChange: finalRatingChange, newRating: finalNewRating, assignmentId: assignmentId || null },
          types: { assignmentId: 'STRING' }
        }),
        bq.query({
          query: `INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`
            (user_id, exam_id, results_json, created_at, assignment_id)
            VALUES (@username, @examId, @resultsJson, CURRENT_TIMESTAMP(), @assignmentId)`,
          params: { username: sanitizedUser, examId, resultsJson: JSON.stringify(gradedResults), assignmentId: assignmentId || null },
          types: { assignmentId: 'STRING' }
        }),
        bq.query({
          query: `DELETE FROM \`${projectId}\`.\`chronos_users\`.\`user_active_exams\`
            WHERE user_id = @username AND exam_id = @examId`,
          params: { username: sanitizedUser, examId }
        })
      ];

      if (isRated !== false) {
        updatePromises.push(
          bq.query({
            query: `UPDATE \`${projectId}\`.\`chronos_users\`.\`users\`
              SET ${ratingColumn} = @newRating, elo_version = @eloVersion
              WHERE user_id = @username`,
            params: { username: sanitizedUser, newRating: finalNewRating, eloVersion: ELO_ALGORITHM_VERSION }
          })
        );
      }

      await Promise.all(updatePromises);

      // 2. Record wrong problems + update topic mastery
      const topicStats = {};
      const wrongInsertPromises = [];
      for (const r of gradedResults) {
        const topicStr = r.topic || 'General';
        const topics = topicStr.split(',').map(t => t.trim()).filter(Boolean);
        for (const topic of topics) {
          if (!topicStats[topic]) {
            topicStats[topic] = { correct: 0, total: 0 };
          }
          topicStats[topic].total += 1;
          if (r.isCorrect) {
            topicStats[topic].correct += 1;
          }
        }

        if (r.isCorrect === false) {
          const topic = r.topic || 'General';
          wrongInsertPromises.push(
            bq.query({
              query: `INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_wrong_problems\`
                (user_id, exam_id, question_id, subject, topic, question_text, user_answer, correct_answer, created_at,
                 options, question_type, ai_explanation, repetitions, interval_days, ease_factor, next_review_at)
                VALUES (@username, @examId, @questionId, @subject, @topic, @questionText, @userAnswer, @correctAnswer, CURRENT_TIMESTAMP(),
                        @options, @questionType, @aiExplanation, 0, 0, 2.5, CURRENT_TIMESTAMP())`,
              params: {
                username: sanitizedUser, examId,
                questionId: r.id || String(Date.now()),
                subject, topic,
                questionText: r.question,
                userAnswer: r.userAnswer || '',
                correctAnswer: r.answer || '',
                options: r.options ? JSON.stringify(r.options) : null,
                questionType: r.type || 'multiple_choice',
                aiExplanation: r.aiExplanation || null
              },
              types: {
                options: 'STRING',
                aiExplanation: 'STRING'
              }
            })
          );
        }
      }

      // Build and execute a single MERGE query for topic mastery to avoid DML concurrency/serialization errors in BigQuery
      const topicStatsEntries = Object.entries(topicStats);
      const masteryPromises = [];
      if (topicStatsEntries.length > 0) {
        const selectClauses = [];
        const params = { username: sanitizedUser, subject };

        topicStatsEntries.forEach(([topic, stats], idx) => {
          const topicParam = `topic_${idx}`;
          const correctParam = `correct_${idx}`;
          const totalParam = `total_${idx}`;

          params[topicParam] = topic;
          params[correctParam] = stats.correct;
          params[totalParam] = stats.total;

          selectClauses.push(`SELECT @${topicParam} AS sub_category, @${correctParam} AS correct_delta, @${totalParam} AS total_delta`);
        });

        const mergeQuery = `
          MERGE \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\` T
          USING (
            ${selectClauses.join('\n            UNION ALL\n            ')}
          ) S
          ON T.user_id = @username AND T.subject = @subject AND T.sub_category = S.sub_category
          WHEN MATCHED THEN
            UPDATE SET 
              correct_count = T.correct_count + S.correct_delta,
              total_count = T.total_count + S.total_delta,
              accuracy_rate = SAFE_DIVIDE(T.correct_count + S.correct_delta, T.total_count + S.total_delta)
          WHEN NOT MATCHED THEN
            INSERT (user_id, sub_category, subject, correct_count, total_count, accuracy_rate)
            VALUES (@username, S.sub_category, @subject, S.correct_delta, S.total_delta, SAFE_DIVIDE(S.correct_delta, S.total_delta))
        `;

        masteryPromises.push(bq.query({ query: mergeQuery, params }));
      }

      // Fire wrong inserts + mastery upsert in parallel
      await Promise.all([...wrongInsertPromises, ...masteryPromises]);

      // 4. Trigger unified weakness and mistake analysis using a single Gemini request
      const { detailedAnalysis, mistakePatterns } = await generateAndSaveDiagnostics(
        sanitizedUser,
        examId,
        subject,
        gradedResults,
        false,
        req
      );

      if (hasFRQ) {
        try {
          const WEBHOOK_URL = process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_URL;
          if (!WEBHOOK_URL) {
            console.warn('GOOGLE_APPS_SCRIPT_WEBHOOK_URL is not configured. Skipping background exam grading.');
          } else {
            const jwtSecret = process.env.JWT_SECRET || 'development-only-secret-key';
            const accessToken = generateJWT({
              teacherId: 'SYSTEM',
              exp: Math.floor(Date.now() / 1000) + 7200 // 2 hours
            }, jwtSecret);

            fetch(WEBHOOK_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
              },
              body: JSON.stringify({
                action: 'async_grade_exam',
                teacherId: 'SYSTEM',
                payload: {
                  username,
                  subject,
                  examId,
                  accuracy: finalAccuracy,
                  avgTime,
                  ratingChange: finalRatingChange,
                  newRating: finalNewRating,
                  isRated,
                  assignmentId,
                  results: gradedResults,
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
                }
              })
            }).catch(err => console.error("Worker fetch failed in trigger:", err));
          }
        } catch (triggerErr) {
          console.error('Failed to trigger background grading:', triggerErr);
        }
      }

      return res.status(200).json({ 
        success: true, 
        detailedAnalysis, 
        mistakePatterns,
        results: gradedResults,
        accuracy: finalAccuracy,
        ratingChange: finalRatingChange,
        newRating: finalNewRating
      });
    } else {
      // For Guest user: run diagnostics/mistake analysis without BigQuery insert, return detailedAnalysis as null
      const { mistakePatterns } = await generateAndSaveDiagnostics(
        sanitizedUser,
        examId,
        subject,
        gradedResults,
        true,
        req
      );
      return res.status(200).json({ 
        success: true, 
        detailedAnalysis: null, 
        mistakePatterns,
        results: gradedResults,
        accuracy: finalAccuracy,
        ratingChange: finalRatingChange,
        newRating: finalNewRating
      });
    }

  } catch (err) {
    console.error('Submit exam error:', err);
    const isOverload = err.status === 503 || 
                       err.status === 500 ||
                       err.status === 429 ||
                       (err.message && (err.message.toLowerCase().includes('demand') ||
                                        err.message.includes('503') || 
                                        err.message.includes('500') ||
                                        err.message.includes('429') || 
                                        err.message.includes('overloaded') || 
                                        err.message.includes('busy') || 
                                        err.message.includes('rate limit') || 
                                        err.message.includes('exhausted') || 
                                        err.message.includes('quota') || 
                                        err.message.includes('failed or are rate limited')));
    if (isOverload) {
      try {
        const answers = results.map(r => r.userAnswer || '');
        const frqSubmissions = results.map(r => r.frqSubmission || null);
        await bq.query({
          query: `
            UPDATE \`${projectId}\`.\`chronos_users\`.\`user_active_exams\`
            SET answers_json = @answersJson,
                frq_submissions_json = @frqSubmissionsJson,
                updated_at = CURRENT_TIMESTAMP()
            WHERE user_id = @username AND exam_id = @examId
          `,
          params: {
            username: sanitizedUser,
            examId,
            answersJson: JSON.stringify(answers),
            frqSubmissionsJson: JSON.stringify(frqSubmissions)
          }
        });
      } catch (saveErr) {
        console.error('Failed to save active exam during overload fallback:', saveErr);
      }

      try {
        const WEBHOOK_URL = process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_URL;
        if (!WEBHOOK_URL) {
          console.warn('GOOGLE_APPS_SCRIPT_WEBHOOK_URL is not configured. Skipping background exam grading.');
        } else {
          const jwtSecret = process.env.JWT_SECRET || 'development-only-secret-key';
        
        const accessToken = generateJWT({
          teacherId: 'SYSTEM',
          exp: Math.floor(Date.now() / 1000) + 7200 // 2 hours
        }, jwtSecret);

        fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            action: 'async_grade_exam',
            teacherId: 'SYSTEM',
            payload: {
              username,
              subject,
              examId,
              accuracy,
              avgTime,
              ratingChange,
              newRating,
              isRated,
              assignmentId,
              results,
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
            }
          })
        }).catch(err => console.error("Worker fetch failed in trigger:", err));
        }
      } catch (triggerErr) {
        console.error('Failed to trigger background grading:', triggerErr);
      }

      return res.status(503).json({
        error: "The grading bots are busy right now. We are grading your exam in the background. Please check back later."
      });
    }
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}

// Unified background worker function to analyze weaknesses and mistake patterns in a single Gemini request
async function generateAndSaveDiagnostics(username, examId, subject, results, isGuest, req) {
  try {
    const isOnlyMCQ = results.every(r => r.type === 'multiple_choice');
    if (isGuest && isOnlyMCQ) {
      return { detailedAnalysis: null, mistakePatterns: '' };
    }

    let masteryString = 'No attempts recorded for any topic yet.';
    let wrongProblemsString = 'No incorrect questions recorded.';

    if (!isGuest) {
      // Fetch incorrect questions for this user and subject
      const fetchWrongProblemsQuery = `
        SELECT topic, question_text, user_answer, correct_answer
        FROM \`${projectId}\`.\`chronos_users\`.\`user_wrong_problems\`
        WHERE user_id = @username AND subject = @subject
      `;
      const [wrongProblems] = await bq.query({
        query: fetchWrongProblemsQuery,
        params: { username, subject }
      });
      
      // Fetch student's overall topic mastery statistics
      const fetchMasteryQuery = `
        SELECT sub_category as topic, correct_count, total_count, accuracy_rate
        FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
        WHERE user_id = @username AND subject = @subject
      `;
      const [masteryRows] = await bq.query({
        query: fetchMasteryQuery,
        params: { username, subject }
      });

      if (masteryRows && masteryRows.length > 0) {
        masteryString = masteryRows.map(m => `Topic: ${m.topic} | Attempts: ${m.total_count} | Correct: ${m.correct_count} | Accuracy: ${Math.round((m.accuracy_rate || 0) * 100)}%`).join('\n');
      }

      if (wrongProblems && wrongProblems.length > 0) {
        wrongProblemsString = wrongProblems.map(p => `Topic: ${p.topic} | Question: ${p.question_text} | User Answer: ${p.user_answer || 'None'} | Correct Answer: ${p.correct_answer}`).join(' ; ');
      }
    }

    const currentAttemptString = results.map((r, i) => `
Question ${i+1}: ${r.question}
Correct Answer: ${r.answer}
User's Answer: ${r.userAnswer || 'None'}
Is Correct: ${r.isCorrect ? 'Yes' : 'No'}
Time Spent: ${r.timeSpent || 0}s
Timed Out: ${r.timeOut ? 'Yes' : 'No'}
`).join('\n');

    let prompt = `You are a world-class diagnostic tutor for the stress-sandbox app. 
Analyze the user's performance on this ${subject} exam attempt and their historical learning profile.

Current Exam Attempt Details:
${currentAttemptString}
`;

    if (!isGuest) {
      prompt += `
Student's overall topic mastery statistics (number of attempts, correct answers, and accuracy) in this subject:
${masteryString}

Incorrect questions history in this subject:
${wrongProblemsString}
`;
    }

    prompt += `
Your tasks:
1. Analyze the user's mistake patterns and identify weaknesses in their WAYS OF THINKING on this specific attempt.
   - Go beyond mere topic/concept gaps: analyze the specific incorrect answers they chose ("User's Answer") versus the correct answers ("Correct Answer") across all questions.
   - Infer their cognitive pitfalls and reasoning shortcuts (e.g., did they apply a formula blindly without checking assumptions, ignore boundary/limiting conditions, make consistent algebraic/sign errors, misread units, fail to double-check their calculations, or panic under time pressure?).
   - Provide a detailed diagnostic summary of these thinking pitfalls, and offer concrete recommendations to help them correct these thinking patterns.
`;

    if (!isGuest) {
      prompt += `
2. Identify up to 5 specific topics where they show strength or promise, and up to 5 specific topics where they show weakness. 
3. For EACH of these identified topics (both strengths and weaknesses), generate a breakdown of exactly what part of that topic the user is good at, and what part they are not good at.
4. Provide a thorough, detailed diagnostic analysis of their strengths and weaknesses in this subject, focusing on both conceptual understanding and their general cognitive reasoning patterns, problem-solving habits, and error-checking strategies.

CRITICAL RULES FOR TOPIC BREAKDOWNS:
- Don't flag any topic as a weakness if the student has never tested on it (i.e. not present in overall topic mastery).
- Only flag a topic as a weakness if the student gets it wrong constantly (e.g., accuracy is less than 65% across at least 3 attempts).
- If they have only attempted a topic 1 or 2 times and got it wrong, do NOT flag it as a weakness.
- For each topic in 'topic_breakdowns', the 'good_at' and 'not_good_at' descriptions MUST be completely distinct and address different aspects of the topic. They MUST NOT be identical, copy each other, or be contradictory.
- If the topic is a clear strength, specify what makes them strong in 'good_at', and for 'not_good_at' write: "No significant weaknesses observed in recent attempts."
- If the topic is a clear weakness, specify their core struggle in 'not_good_at', and for 'good_at' write: "Requires fundamental instruction on basic concepts before identifying specific strengths." or describe any partial progress shown.
`;
    }

    prompt += `
Return strictly a valid JSON object with the following schema:
{
  "mistake_patterns": "A detailed, direct, supportive, and pedagogical summary of their mistake patterns on this specific attempt...",
  "strengths": ${isGuest ? '[]' : '["Topic A", "Topic B"]'},
  "weaknesses": ${isGuest ? '[]' : '["Topic B", "Topic C"]'},
  "detailed_analysis": ${isGuest ? '""' : '"A detailed diagnosis..."'},
  "topic_breakdowns": ${isGuest ? '[]' : `[
    { "topic": "Topic B", "good_at": "What they do well...", "not_good_at": "What they struggle with..." }
  ]`}
}
Do NOT include markdown formatting, backticks, or any conversational text. Return ONLY the raw JSON object.`;

    const modelId = 'gemini-3.1-flash-lite';
    const models = [modelId, 'gemini-3-flash-preview'];
    const response = await executeWithRetry(models, (ai, currentModel) => ai.interactions.create({
      model: currentModel,
      input: prompt,
      response_format: {
        type: 'text',
        mime_type: 'application/json'
      },
      generation_config: {
        temperature: 0.3
      }
    }), req);

    let detailedAnalysis = null;
    let mistakePatterns = '';

    if (response.output_text) {
      const responseObj = parseJSONResponse(response.output_text);
      if (responseObj) {
        mistakePatterns = responseObj.mistake_patterns || '';

        if (!isGuest) {
          detailedAnalysis = responseObj.detailed_analysis || null;
          const topicBreakdowns = responseObj.topic_breakdowns;

          const upsertPromises = [];

          // Save mistake patterns in BigQuery
          if (mistakePatterns) {
            const insertQuery = `
              INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_mistake_analysis\`
                (user_id, exam_id, subject, mistake_patterns, created_at)
              VALUES
                (@username, @examId, @subject, @mistakePatterns, CURRENT_TIMESTAMP())
            `;
            upsertPromises.push(bq.query({
              query: insertQuery,
              params: { username, examId, subject, mistakePatterns }
            }));
          }

          // Fire topic breakdowns
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

          // Fire weakness analysis merge
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

          if (upsertPromises.length > 0) {
            await Promise.all(upsertPromises);
          }
        }
      }
    }

    return { detailedAnalysis, mistakePatterns };

  } catch (err) {
    console.error('Error in generateAndSaveDiagnostics:', err);
    return { detailedAnalysis: null, mistakePatterns: '' };
  }
}
