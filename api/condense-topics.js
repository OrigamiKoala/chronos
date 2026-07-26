import { BigQuery } from '@google-cloud/bigquery';
import { executeWithRetry, parseJSONResponse } from './_gemini.js';

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
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const sanitizedUser = username.trim().toLowerCase();

  try {
    // 1. Fire repair queries and initial fetch in parallel
    const [breakdownResult] = await Promise.all([
      bq.query({
        query: `SELECT topic, good_at, not_good_at, subject FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\` WHERE user_id = @username`,
        params: { username: sanitizedUser }
      }),
      bq.query({
        query: `UPDATE \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\` SET correct_count = total_count, accuracy_rate = 1.0 WHERE user_id = @username AND correct_count > total_count`,
        params: { username: sanitizedUser }
      }).catch(err => console.error("Auto-repair mastery error:", err)),
      bq.query({
        query: `DELETE FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\` WHERE user_id = @username AND (LOWER(sub_category) = LOWER(subject) OR LOWER(sub_category) IN ('general', 'general topics', 'science'))`,
        params: { username: sanitizedUser }
      }).catch(err => console.error("Delete generic mastery error:", err)),
      bq.query({
        query: `DELETE FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\` WHERE user_id = @username AND (LOWER(topic) = LOWER(subject) OR LOWER(topic) IN ('general', 'general topics', 'science'))`,
        params: { username: sanitizedUser }
      }).catch(err => console.error("Delete generic breakdown error:", err))
    ]);

    const breakdownRows = breakdownResult[0];

    const [masteryRows] = await bq.query({
      query: `SELECT sub_category, subject, correct_count, total_count, accuracy_rate FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\` WHERE user_id = @username`,
      params: { username: sanitizedUser }
    });

    // Helper function to return final updated state
    const fetchAndResponseFinalState = async (mergedCount = 0) => {
      const [finalMasteryRows] = await bq.query({
        query: `SELECT sub_category, subject, correct_count, total_count, accuracy_rate
          FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
          WHERE user_id = @username AND total_count > 0`,
        params: { username: sanitizedUser }
      });

      const [finalBreakdownRows] = await bq.query({
        query: `SELECT topic, good_at, not_good_at, subject
          FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\`
          WHERE user_id = @username`,
        params: { username: sanitizedUser }
      });

      const topicMastery = finalMasteryRows.map(m => ({
        sub_category: m.sub_category,
        subject: m.subject,
        correct_count: Number((m.correct_count?.value ?? m.correct_count) || 0),
        total_count: Number((m.total_count?.value ?? m.total_count) || 0),
        accuracy_rate: Number((m.accuracy_rate?.value ?? m.accuracy_rate) || 0)
      })).sort((a, b) => {
        if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
        return b.accuracy_rate - a.accuracy_rate;
      });

      const strengths = topicMastery
        .filter(m => m.total_count >= 3 && m.accuracy_rate >= 0.70)
        .map(m => ({ topic: m.sub_category, subject: m.subject }));

      const weaknesses = topicMastery
        .filter(m => m.total_count >= 3 && m.accuracy_rate < 0.65)
        .map(m => ({ topic: m.sub_category, subject: m.subject }));

      const topicBreakdowns = {};
      const parentRollups = {};
      for (const b of finalBreakdownRows) {
        topicBreakdowns[b.topic] = {
          good_at: b.good_at,
          not_good_at: b.not_good_at
        };
      }

      return res.status(200).json({
        success: true,
        mergedCount,
        strengths,
        weaknesses,
        topicBreakdowns,
        parentRollups,
        topicMastery
      });
    };

    if (breakdownRows.length < 2) {
      return await fetchAndResponseFinalState(0);
    }

    // 2. Prepare AI input with existing parent_topic mappings
    const inputTopics = breakdownRows.map(row => {
      const mastery = masteryRows.find(m => m.sub_category === row.topic && m.subject === row.subject);
      return {
        subject: row.subject,
        topic: row.topic,
        good_at: row.good_at,
        not_good_at: row.not_good_at,
        correct_count: mastery ? Number(mastery.correct_count || 0) : 0,
        total_count: mastery ? Number(mastery.total_count || 0) : 0
      };
    });

    const prompt = `You are an expert tutor and curriculum designer specializing in USNCO (US National Chemistry Olympiad) standards. Analyze the following topic breakdown data for a student.

Your tasks:
1. AGGRESSIVE SUBTOPIC CLUSTERING & MERGES: Eliminate hyper-specific one-off subtopic fragmentation by aggressively merging low-count or narrowly phrased subtopics into clean, standardized subtopic clusters within the SAME subject.
   - Merge "Determination of Rate Laws", "Initial Rates Method", and "Reaction Orders" into "Rate Laws & Reaction Orders".
   - Merge "Arrhenius Equation Calculations" and "Activation Energy" into "Arrhenius & Activation Energy".
   - Combine synonymous terms.

2. MANDATORY USNCO PARENT CLASSIFICATION & ROLLUPS: Map EVERY Chemistry subtopic in the input to EXACTLY ONE of the official 10 USNCO Standard Topics below:
   1. Stoichiometry & Solutions
   2. Descriptive & Laboratory Chemistry
   3. States of Matter & Phase Changes
   4. Thermodynamics
   5. Kinetics
   6. Equilibrium
   7. Acids & Bases
   8. Electrochemistry
   9. Atomic Structure & Periodicity
   10. Organic Chemistry & Biochemistry

   For Physics: Use standard categories (Kinematics, Dynamics, Mechanics, Optics, Electromagnetism, Waves & Oscillations, Quantum Mechanics).
   For Math: Use standard categories (Algebra, Calculus, Geometry & Trigonometry, Statistics & Probability).
   Preserve valid existing "parent_topic" mappings provided in the input unless a subtopic needs re-classification into the 10 USNCO topics.

CRITICAL CONSTRAINTS:
1. STRICT USNCO TOPICS FOR CHEMISTRY: parent_topic for Chemistry MUST be EXACTLY one of the 10 official USNCO topics listed above. DO NOT invent arbitrary overall titles (e.g. DO NOT use "Heterogeneous Systems", "Spectroscopy", "Chemistry", "General Topics", or "Phase Equilibria" as parent_topic).
2. NO ORPHAN SUBTOPICS: Every subtopic must be mapped to one of the 10 standard USNCO parent categories in parent_rollups.
3. PRESERVE EXISTING MAPPINGS: Re-use existing valid parent_topic values to complete classification instantly without re-analyzing already sorted subtopics.

Input Data:
${JSON.stringify(inputTopics, null, 2)}

Output format must be a JSON object matching this schema:
{
  "merges": [
    {
      "subject": "the subject (e.g. Chemistry)",
      "source_topics": ["array of exact topic names to merge"],
      "target_topic": "the new consolidated topic name",
      "good_at": "the synthesized description of what the user is good at in this topic",
      "not_good_at": "the synthesized description of what the user needs help with in this topic"
    }
  ],
  "parent_rollups": [
    {
      "subject": "the subject (e.g. Chemistry)",
      "parent_topic": "the overarching parent category (e.g. Chemical Kinetics)",
      "child_topics": ["array of specific sub-topic names that belong under this parent category"],
      "good_at": "the synthesized description for the overall parent category",
      "not_good_at": "the synthesized description for the overall parent category"
    }
  ]
}`;

    const modelId = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    const models = [...new Set([modelId, 'gemini-3.1-flash-lite'])];
    const response = await executeWithRetry(models, (ai, currentModel) => ai.interactions.create({
      model: currentModel,
      input: prompt,
      response_format: {
        type: 'text',
        mime_type: 'application/json'
      },
      generation_config: {
        temperature: 0.2
      }
    }));

    function escapeSqlStr(str) {
      if (str === null || str === undefined) return "''";
      return "'" + String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
    }

    let mergedCount = 0;
    if (response.output_text) {
      const responseObj = parseJSONResponse(response.output_text);
      const batchSqlStatements = [];

      if (responseObj && Array.isArray(responseObj.merges) && responseObj.merges.length > 0) {
        for (const merge of responseObj.merges) {
          const { subject, source_topics, target_topic, good_at, not_good_at } = merge;
          if (!subject || !source_topics || !target_topic || source_topics.length < 2) {
            continue;
          }

          const safeUser = escapeSqlStr(sanitizedUser);
          const safeSubject = escapeSqlStr(subject);
          const safeTarget = escapeSqlStr(target_topic);
          const safeGood = escapeSqlStr(good_at || '');
          const safeNotGood = escapeSqlStr(not_good_at || '');
          const sourcesList = source_topics.map(s => escapeSqlStr(s.toLowerCase())).join(', ');

          let mergedCorrect = 0;
          let mergedTotal = 0;
          for (const source of source_topics) {
            const m = masteryRows.find(row => row.sub_category.toLowerCase() === source.toLowerCase() && row.subject.toLowerCase() === subject.toLowerCase());
            if (m) {
              mergedCorrect += Number((m.correct_count?.value ?? m.correct_count) || 0);
              mergedTotal += Number((m.total_count?.value ?? m.total_count) || 0);
            }
          }
          const mergedAccuracy = mergedTotal > 0 ? (mergedCorrect / mergedTotal) : 0.0;

          batchSqlStatements.push(`
            DELETE FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\` WHERE user_id = ${safeUser} AND LOWER(subject) = LOWER(${safeSubject}) AND LOWER(topic) IN (${sourcesList});
            DELETE FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\` WHERE user_id = ${safeUser} AND LOWER(subject) = LOWER(${safeSubject}) AND LOWER(sub_category) IN (${sourcesList});
            MERGE \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\` T USING (SELECT ${safeUser} AS user_id, ${safeSubject} AS subject, ${safeTarget} AS topic) S ON T.user_id = S.user_id AND T.subject = S.subject AND T.topic = S.topic WHEN MATCHED THEN UPDATE SET good_at = ${safeGood}, not_good_at = ${safeNotGood}, updated_at = CURRENT_TIMESTAMP() WHEN NOT MATCHED THEN INSERT (user_id, subject, topic, good_at, not_good_at, updated_at) VALUES (${safeUser}, ${safeSubject}, ${safeTarget}, ${safeGood}, ${safeNotGood}, CURRENT_TIMESTAMP());
            MERGE \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\` T USING (SELECT ${safeUser} AS user_id, ${safeSubject} AS subject, ${safeTarget} AS sub_category) S ON T.user_id = S.user_id AND T.subject = S.subject AND T.sub_category = S.sub_category WHEN MATCHED THEN UPDATE SET correct_count = ${mergedCorrect}, total_count = ${mergedTotal}, accuracy_rate = ${mergedAccuracy} WHEN NOT MATCHED THEN INSERT (user_id, sub_category, subject, correct_count, total_count, accuracy_rate) VALUES (${safeUser}, ${safeTarget}, ${safeSubject}, ${mergedCorrect}, ${mergedTotal}, ${mergedAccuracy});
          `);

          mergedCount++;
        }
      }

      if (responseObj && Array.isArray(responseObj.parent_rollups) && responseObj.parent_rollups.length > 0) {
        for (const rollup of responseObj.parent_rollups) {
          const { subject, parent_topic, child_topics, good_at, not_good_at } = rollup;
          if (
            !subject ||
            !parent_topic ||
            !Array.isArray(child_topics) ||
            child_topics.length === 0 ||
            parent_topic.toLowerCase() === subject.toLowerCase() ||
            ['general', 'general topics', 'science'].includes(parent_topic.toLowerCase())
          ) {
            continue;
          }

          const safeUser = escapeSqlStr(sanitizedUser);
          const safeSubject = escapeSqlStr(subject);
          const safeParent = escapeSqlStr(parent_topic);
          const safeGood = escapeSqlStr(good_at || '');
          const safeNotGood = escapeSqlStr(not_good_at || '');

          const parentRow = masteryRows.find(m => (m.sub_category || '').toLowerCase() === parent_topic.toLowerCase() && (m.subject || '').toLowerCase() === subject.toLowerCase());
          let rollupCorrect = 0;
          let rollupTotal = 0;

          if (parentRow && Number((parentRow.total_count?.value ?? parentRow.total_count) || 0) > 0) {
            rollupCorrect = Number((parentRow.correct_count?.value ?? parentRow.correct_count) || 0);
            rollupTotal = Number((parentRow.total_count?.value ?? parentRow.total_count) || 0);
          } else {
            const lowerChildren = child_topics.map(c => c.toLowerCase());
            for (const m of masteryRows) {
              const catName = (m.sub_category || '').toLowerCase();
              if (lowerChildren.includes(catName)) {
                rollupCorrect += Number((m.correct_count?.value ?? m.correct_count) || 0);
                rollupTotal += Number((m.total_count?.value ?? m.total_count) || 0);
              }
            }
          }

          if (rollupTotal > 0) {
            const rollupAccuracy = rollupCorrect / rollupTotal;

            batchSqlStatements.push(`
              MERGE \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\` T USING (SELECT ${safeUser} AS user_id, ${safeSubject} AS subject, ${safeParent} AS topic) S ON T.user_id = S.user_id AND T.subject = S.subject AND T.topic = S.topic WHEN MATCHED THEN UPDATE SET good_at = COALESCE(NULLIF(${safeGood}, ''), T.good_at), not_good_at = COALESCE(NULLIF(${safeNotGood}, ''), T.not_good_at), updated_at = CURRENT_TIMESTAMP() WHEN NOT MATCHED THEN INSERT (user_id, subject, topic, good_at, not_good_at, updated_at) VALUES (${safeUser}, ${safeSubject}, ${safeParent}, ${safeGood}, ${safeNotGood}, CURRENT_TIMESTAMP());
              MERGE \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\` T USING (SELECT ${safeUser} AS user_id, ${safeSubject} AS subject, ${safeParent} AS sub_category) S ON T.user_id = S.user_id AND T.subject = S.subject AND T.sub_category = S.sub_category WHEN MATCHED THEN UPDATE SET correct_count = ${rollupCorrect}, total_count = ${rollupTotal}, accuracy_rate = ${rollupAccuracy} WHEN NOT MATCHED THEN INSERT (user_id, sub_category, subject, correct_count, total_count, accuracy_rate) VALUES (${safeUser}, ${safeParent}, ${safeSubject}, ${rollupCorrect}, ${rollupTotal}, ${rollupAccuracy});
            `);

            mergedCount++;
          }
        }
      }

      if (batchSqlStatements.length > 0) {
        await bq.query({ query: batchSqlStatements.join('\n') }).catch(err => console.error("Batch BigQuery execution error:", err));
      }
    }

    return await fetchAndResponseFinalState(mergedCount);

  } catch (err) {
    console.error('Condense topics error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
