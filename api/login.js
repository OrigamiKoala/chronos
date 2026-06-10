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

const ELO_ALGORITHM_VERSION = 3;
let schemaEnsured = process.env.ENSURE_SCHEMA !== 'true';

import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET;

function generateToken(username) {
  if (!JWT_SECRET) throw new Error("JWT_SECRET is not set");
  const payload = Buffer.from(JSON.stringify({ username, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyToken(token) {
  if (!JWT_SECRET) throw new Error("JWT_SECRET is not set");
  try {
    const [payload, signature] = token.split('.');
    const expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('base64url');

    // Constant time comparison
    const sigBuf = Buffer.from(signature, 'base64url');
    const expectedSigBuf = Buffer.from(expectedSignature, 'base64url');
    if (sigBuf.length !== expectedSigBuf.length || !crypto.timingSafeEqual(sigBuf, expectedSigBuf)) {
      return null;
    }
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.exp < Date.now()) return null;
    return data.username;
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password, token, recoveryQuestion, recoveryAnswer, isSettingRecovery, userRole, userOrganization } = req.body;

  let validTokenUsername = null;
  if (token) {
    validTokenUsername = verifyToken(token);
  }

  if (!validTokenUsername) {
    if (!username || username.trim() === '') {
      return res.status(400).json({ error: 'Username is required' });
    }
    if (!password || password.trim() === '') {
      return res.status(400).json({ error: 'Password is required' });
    }
  }

  const sanitizedUser = validTokenUsername ? validTokenUsername.toLowerCase() : username.trim().toLowerCase();

  try {
    // 0. Ensure recovery and password columns exist (once per cold start)
    if (!schemaEnsured) {
      try {
        const alterQuery = `
          ALTER TABLE \`${projectId}\`.\`chronos_users\`.\`users\`
          ADD COLUMN IF NOT EXISTS password STRING,
          ADD COLUMN IF NOT EXISTS recovery_question STRING,
          ADD COLUMN IF NOT EXISTS recovery_answer STRING,
          ADD COLUMN IF NOT EXISTS elo_version INT64,
          ADD COLUMN IF NOT EXISTS user_role STRING,
          ADD COLUMN IF NOT EXISTS user_organization STRING
        `;
        await bq.query(alterQuery);

        await Promise.all([
          bq.query(`
            CREATE TABLE IF NOT EXISTS \`${projectId}\`.\`chronos_users\`.\`teacher_students\` (
              teacher_id STRING,
              student_id STRING,
              created_at TIMESTAMP
            )
          `),
          bq.query(`
            CREATE TABLE IF NOT EXISTS \`${projectId}\`.\`chronos_users\`.\`lessons\` (
              lesson_id STRING,
              teacher_id STRING,
              organization STRING,
              title STRING,
              description STRING,
              created_at TIMESTAMP
            )
          `),
          bq.query(`
            CREATE TABLE IF NOT EXISTS \`${projectId}\`.\`chronos_users\`.\`homework_assignments\` (
              assignment_id STRING,
              lesson_id STRING,
              title STRING,
              subject STRING,
              num_questions INT64,
              starting_difficulty INT64,
              exam_format STRING,
              time_limit_style STRING,
              time_limit_value INT64,
              stress_mode STRING,
              due_date TIMESTAMP,
              created_at TIMESTAMP
            )
          `),
          bq.query(`
            ALTER TABLE \`${projectId}\`.\`chronos_users\`.\`homework_assignments\`
            ADD COLUMN IF NOT EXISTS content_based BOOL
          `),
          bq.query(`
            ALTER TABLE \`${projectId}\`.\`chronos_users\`.\`homework_assignments\`
            ADD COLUMN IF NOT EXISTS shared_questions_json STRING
          `),
          bq.query(`
            ALTER TABLE \`${projectId}\`.\`chronos_users\`.\`user_exam_history\`
            ADD COLUMN IF NOT EXISTS assignment_id STRING
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
            CREATE TABLE IF NOT EXISTS \`${projectId}\`.\`chronos_users\`.\`student_insights\` (
              insight_id STRING NOT NULL,
              student_id STRING NOT NULL,
              teacher_id STRING NOT NULL,
              lesson_id STRING NOT NULL,
              summary STRING NOT NULL,
              suggestions STRING NOT NULL,
              progress_status STRING NOT NULL,
              created_at TIMESTAMP NOT NULL
            )
          `),
          bq.query(`
            CREATE TABLE IF NOT EXISTS \`${projectId}\`.\`chronos_users\`.\`pregenerated_questions\` (
              question_id STRING NOT NULL,
              subject STRING NOT NULL,
              topic STRING NOT NULL,
              difficulty INT64 NOT NULL,
              type STRING NOT NULL,
              question_json STRING NOT NULL,
              created_at TIMESTAMP NOT NULL
            )
          `)
        ]);
      } catch (e) {
        console.warn("Alter table error or already exists:", e);
      }
      schemaEnsured = true;
    }

    const checkQuery = `
      SELECT user_id, password, recovery_question, recovery_answer, math_rating, physics_rating, chemistry_rating, elo_version, user_role, user_organization 
      FROM \`${projectId}\`.\`chronos_users\`.\`users\`
      WHERE user_id = @username
    `;
    const [existingUsers] = await bq.query({
      query: checkQuery,
      params: { username: sanitizedUser }
    });

    let userData;

    if (existingUsers.length > 0) {
      const dbUser = existingUsers[0];

      // Password logic (skip if logging in via valid token):
      if (!validTokenUsername) {
        if (!dbUser.password) {
          // If an existing user doesn't have a password stored, they need to reset their password
          // as we should not arbitrarily accept any password input as the new password.
          return res.status(401).json({ error: 'Account requires password setup or reset' });
        } else {
          // Verify password
          if (dbUser.password !== password) {
            return res.status(401).json({ error: 'Incorrect password' });
          }
        }
      }

      // Check if they need recovery question/answer setup
      if (!dbUser.recovery_question || !dbUser.recovery_answer) {
        if (isSettingRecovery && recoveryQuestion && recoveryAnswer) {
          // Set recovery details
          const updateRecoveryQuery = `
            UPDATE \`${projectId}\`.\`chronos_users\`.\`users\`
            SET recovery_question = @recoveryQuestion, recovery_answer = @recoveryAnswer
            WHERE user_id = @username
          `;
          await bq.query({
            query: updateRecoveryQuery,
            params: { username: sanitizedUser, recoveryQuestion, recoveryAnswer }
          });
          dbUser.recovery_question = recoveryQuestion;
          dbUser.recovery_answer = recoveryAnswer;
        } else {
          // Prompt them to set a personal question/answer next time they login
          return res.status(200).json({ status: 'recovery_setup_required', user_id: sanitizedUser });
        }
      }

      userData = dbUser;
    } else {
      // User is new
      if (isSettingRecovery && recoveryQuestion && recoveryAnswer) {
        const insertUserQuery = `
          INSERT INTO \`${projectId}\`.\`chronos_users\`.\`users\` (user_id, created_at, password, recovery_question, recovery_answer, math_rating, physics_rating, chemistry_rating, elo_version, user_role, user_organization)
          VALUES (@username, CURRENT_TIMESTAMP(), @password, @recoveryQuestion, @recoveryAnswer, 100, 100, 100, @eloVersion, @userRole, @userOrganization)
        `;
        await bq.query({
          query: insertUserQuery,
          params: {
            username: sanitizedUser,
            password,
            recoveryQuestion,
            recoveryAnswer,
            eloVersion: ELO_ALGORITHM_VERSION,
            userRole: userRole || null,
            userOrganization: userOrganization || null
          },
          types: {
            username: 'STRING',
            password: 'STRING',
            recoveryQuestion: 'STRING',
            recoveryAnswer: 'STRING',
            eloVersion: 'INT64',
            userRole: 'STRING',
            userOrganization: 'STRING'
          }
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

        const valuesPlaceholder = topics.map((t, idx) => `(@username, @topic_${idx}, @subject_${idx}, 3, 5, 0.60)`).join(',\n');
        const insertMastery = `
          INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\` (user_id, sub_category, subject, correct_count, total_count, accuracy_rate)
          VALUES ${valuesPlaceholder}
        `;
        const params = { username: sanitizedUser };
        topics.forEach((t, idx) => {
          params[`topic_${idx}`] = t.topic;
          params[`subject_${idx}`] = t.subject;
        });
        await bq.query({
          query: insertMastery,
          params
        });

        userData = {
          user_id: sanitizedUser,
          math_rating: 100,
          physics_rating: 100,
          chemistry_rating: 100,
          user_role: userRole || null,
          user_organization: userOrganization || null
        };
      } else {
        // Ask new user to set recovery question/answer
        return res.status(200).json({ status: 'recovery_setup_required', user_id: sanitizedUser, isNew: true });
      }
    }

    // 3. Fire independent queries in parallel: history, mastery, analysis, breakdowns
    const currentEloVersion = userData.elo_version;
    const needsRecalculation = currentEloVersion === null || currentEloVersion === undefined || currentEloVersion < ELO_ALGORITHM_VERSION;

    const combinedQuery = `
      SELECT
        (SELECT TO_JSON_STRING(ARRAY_AGG(STRUCT(exam_id, subject, accuracy, avg_time, rating_change, new_rating, created_at, results_json)))
         FROM (
           SELECT h.exam_id, h.subject, h.accuracy, h.avg_time, h.rating_change, h.new_rating, h.created_at, r.results_json
           FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_history\` h
           LEFT JOIN \`${projectId}\`.\`chronos_users\`.\`user_exam_results\` r
           ON h.exam_id = r.exam_id AND h.user_id = r.user_id
           WHERE h.user_id = @username
           ORDER BY h.created_at ASC
         )
        ) AS history_json,
        
        (SELECT TO_JSON_STRING(ARRAY_AGG(STRUCT(sub_category, subject, accuracy_rate, total_count)))
         FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
         WHERE user_id = @username
        ) AS mastery_json,
        
        (SELECT TO_JSON_STRING(ARRAY_AGG(STRUCT(subject, detailed_analysis)))
         FROM \`${projectId}\`.\`chronos_users\`.\`user_weakness_analysis\`
         WHERE user_id = @username
        ) AS analysis_json,
        
        (SELECT TO_JSON_STRING(ARRAY_AGG(STRUCT(topic, good_at, not_good_at)))
         FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\`
         WHERE user_id = @username
        ) AS breakdown_json,
        
        (SELECT TO_JSON_STRING(STRUCT(exam_id, subject, config_json, problems_json, answers_json, frq_submissions_json, current_question_index, created_at))
         FROM \`${projectId}\`.\`chronos_users\`.\`user_active_exams\`
         WHERE user_id = @username
         LIMIT 1
        ) AS active_exam_json
    `;

    const [rows] = await bq.query({
      query: combinedQuery,
      params: { username: sanitizedUser }
    });

    const resultRow = rows[0] || {};
    const allHistory = resultRow.history_json ? (JSON.parse(resultRow.history_json) || []) : [];
    const mastery = resultRow.mastery_json ? (JSON.parse(resultRow.mastery_json) || []) : [];
    const analyses = resultRow.analysis_json ? (JSON.parse(resultRow.analysis_json) || []) : [];
    const breakdowns = resultRow.breakdown_json ? (JSON.parse(resultRow.breakdown_json) || []) : [];

    let activeExam = null;
    if (resultRow.active_exam_json) {
      try {
        const parsedActive = JSON.parse(resultRow.active_exam_json);
        if (parsedActive && parsedActive.exam_id) {
          activeExam = {
            exam_id: parsedActive.exam_id,
            subject: parsedActive.subject,
            config: parsedActive.config_json ? JSON.parse(parsedActive.config_json) : {},
            problems: parsedActive.problems_json ? JSON.parse(parsedActive.problems_json) : [],
            answers: parsedActive.answers_json ? JSON.parse(parsedActive.answers_json) : [],
            frqSubmissions: parsedActive.frq_submissions_json ? JSON.parse(parsedActive.frq_submissions_json) : [],
            currentQuestionIndex: Number(parsedActive.current_question_index),
            created_at: parsedActive.created_at?.value || parsedActive.created_at
          };
        }
      } catch (err) {
        console.error('Error parsing active exam:', err);
      }
    }

    if (needsRecalculation) {
      const subjectRatings = { Math: 100, Physics: 100, Chemistry: 100 };
      const subjectChallenged = { Math: false, Physics: false, Chemistry: false };
      const subjectConsecutiveFailCount = { Math: 0, Physics: 0, Chemistry: 0 };
      const updatesToMake = [];

      for (const h of allHistory) {
        const sub = h.subject;
        const currentRating = subjectRatings[sub] || 100;
        const score = h.accuracy;

        let totalQuestions = 5;
        let sumQuestionRatings = 0;
        if (h.results_json) {
          try {
            const resArray = JSON.parse(h.results_json);
            if (Array.isArray(resArray)) {
              totalQuestions = resArray.length;
              const getQuestionRating = (subject, diff) => {
                const d = Math.round(Math.max(1, Math.min(10, diff)));
                if (subject === 'Math') {
                  switch (d) {
                    case 1: return 500;
                    case 2: return 600;
                    case 3: return 800;
                    case 4: return 900;
                    case 5: return 1000;
                    case 6: return 1250;
                    case 7: return 1500;
                    case 8: return 2000;
                    case 9: return 2500;
                    case 10: return 3000;
                    default: return 1000;
                  }
                } else if (subject === 'Chemistry') {
                  switch (d) {
                    case 1: return 100;
                    case 2: return 300;
                    case 3: return 500;
                    case 4: return 750;
                    case 5: return 1000;
                    case 6: return 1250;
                    case 7: return 1500;
                    case 8: return 2000;
                    case 9: return 2500;
                    case 10: return 3000;
                    default: return 1000;
                  }
                } else if (subject === 'Physics') {
                  switch (d) {
                    case 1: return 100;
                    case 2: return 300;
                    case 3: return 500;
                    case 4: return 750;
                    case 5: return 1000;
                    case 6: return 1300;
                    case 7: return 1600;
                    case 8: return 2000;
                    case 9: return 2500;
                    case 10: return 3000;
                    default: return 1000;
                  }
                }
                return 100;
              };
              sumQuestionRatings = resArray.reduce((acc, r) => acc + getQuestionRating(sub, r.difficulty || 5), 0);
            }
          } catch (e) {
            console.error('Failed to parse results_json in login recalculation:', e);
          }
        }

        const questionMultiplier = Math.sqrt(totalQuestions / 5);
        const avgQuestionRating = sumQuestionRatings > 0 ? (sumQuestionRatings / totalQuestions) : 1000;

        let expectedScore = 1 / (1 + Math.pow(10, (avgQuestionRating - currentRating) / 400));
        if (avgQuestionRating < currentRating) {
          expectedScore = Math.max(expectedScore, 0.75);
        }

        if (score < 0.75) {
          subjectConsecutiveFailCount[sub]++;
        } else {
          subjectConsecutiveFailCount[sub] = 0;
        }

        if (subjectConsecutiveFailCount[sub] >= 2) {
          subjectChallenged[sub] = true;
        }

        const K = subjectChallenged[sub] ? 32 : 250;
        const ratingChange = Math.round(K * questionMultiplier * (score - expectedScore));
        const newRating = Math.max(100, currentRating + ratingChange);

        if (h.rating_change !== ratingChange || h.new_rating !== newRating) {
          updatesToMake.push({
            exam_id: h.exam_id,
            rating_change: ratingChange,
            new_rating: newRating
          });
          h.rating_change = ratingChange;
          h.new_rating = newRating;
        }

        subjectRatings[sub] = newRating;
      }

      if (updatesToMake.length > 0) {
        const unionBlocks = updatesToMake.map((u, idx) => `SELECT @examId_${idx} AS exam_id, @ratingChange_${idx} AS rating_change, @newRating_${idx} AS new_rating`).join(' UNION ALL ');
        const mergeHistoryQuery = `
          MERGE \`${projectId}\`.\`chronos_users\`.\`user_exam_history\` T
          USING (${unionBlocks}) S
          ON T.user_id = @username AND T.exam_id = S.exam_id
          WHEN MATCHED THEN
            UPDATE SET T.rating_change = S.rating_change, T.new_rating = S.new_rating
        `;
        const params = { username: sanitizedUser };
        updatesToMake.forEach((u, idx) => {
          params[`examId_${idx}`] = u.exam_id;
          params[`ratingChange_${idx}`] = Number(u.rating_change);
          params[`newRating_${idx}`] = Number(u.new_rating);
        });
        await bq.query({
          query: mergeHistoryQuery,
          params
        });
      }

      // Update users table with final ratings and ELO version
      const finalMath = subjectRatings.Math;
      const finalPhys = subjectRatings.Physics;
      const finalChem = subjectRatings.Chemistry;

      const updateUsersQuery = `
        UPDATE \`${projectId}\`.\`chronos_users\`.\`users\`
        SET math_rating = @finalMath, physics_rating = @finalPhys, chemistry_rating = @finalChem, elo_version = @eloVersion
        WHERE user_id = @username
      `;
      await bq.query({
        query: updateUsersQuery,
        params: {
          username: sanitizedUser,
          finalMath,
          finalPhys,
          finalChem,
          eloVersion: ELO_ALGORITHM_VERSION
        }
      });
      userData.math_rating = finalMath;
      userData.physics_rating = finalPhys;
      userData.chemistry_rating = finalChem;
      userData.elo_version = ELO_ALGORITHM_VERSION;
    }

    const history = [...allHistory]
      .sort((a, b) => new Date(b.created_at?.value || b.created_at) - new Date(a.created_at?.value || a.created_at))
      .slice(0, 25);

    const strengths = mastery.filter(m => m.total_count > 5 && m.accuracy_rate >= 0.70).map(m => ({ topic: m.sub_category, subject: m.subject }));
    const weaknesses = mastery.filter(m => m.total_count > 5 && m.accuracy_rate < 0.65).map(m => ({ topic: m.sub_category, subject: m.subject }));

    const detailedAnalysis = {};
    for (const a of analyses) {
      const subject = a.subject;
      if (typeof subject === 'string' && subject !== '__proto__' && subject !== 'constructor' && subject !== 'prototype') {
        detailedAnalysis[subject] = a.detailed_analysis;
      }
    }

    const topicBreakdowns = {};
    for (const b of breakdowns) {
      const topic = b.topic;
      if (typeof topic === 'string' && topic !== '__proto__' && topic !== 'constructor' && topic !== 'prototype') {
        topicBreakdowns[topic] = {
          good_at: b.good_at,
          not_good_at: b.not_good_at
        };
      }
    }

    const newToken = generateToken(sanitizedUser);

    return res.status(200).json({
      token: newToken,
      user: userData,
      history,
      strengths,
      weaknesses,
      detailedAnalysis,
      topicBreakdowns,
      activeExam
    });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
