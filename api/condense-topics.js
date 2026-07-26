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
        query: `DELETE FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\` WHERE user_id = @username AND (LOWER(sub_category) = LOWER(subject) OR LOWER(sub_category) IN ('general', 'general topics', 'science', 'kinetics', 'thermodynamics', 'electrochemistry', 'stoichiometry & solutions', 'equilibrium', 'acids & bases', 'descriptive & laboratory chemistry', 'atomic structure & periodicity', 'organic chemistry & biochemistry', 'kinetics & rate laws'))`,
        params: { username: sanitizedUser }
      }).catch(err => console.error("Delete synthetic mastery error:", err)),
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
    const fetchAndResponseFinalState = async (mergedCount = 0, activeParentRollups = {}) => {
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

      const [examResultRows] = await bq.query({
        query: `SELECT h.subject, r.results_json
          FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_results\` r
          JOIN \`${projectId}\`.\`chronos_users\`.\`user_exam_history\` h
            ON r.exam_id = h.exam_id AND r.user_id = h.user_id
          WHERE r.user_id = @username`,
        params: { username: sanitizedUser }
      });

      const liveMasteryMap = {};
      for (const row of (examResultRows || [])) {
        const subject = row.subject || 'Chemistry';
        let resultsList = [];
        try {
          resultsList = typeof row.results_json === 'string' ? JSON.parse(row.results_json) : (row.results_json || []);
        } catch (e) {
          continue;
        }
        if (!Array.isArray(resultsList)) continue;

        for (const q of resultsList) {
          if (!q || !q.topic) continue;
          let isCorrect = false;
          if (typeof q.isCorrect === 'boolean') {
            isCorrect = q.isCorrect;
          } else if (typeof q.is_correct === 'boolean') {
            isCorrect = q.is_correct;
          } else if (q.score !== undefined && q.score !== null) {
            isCorrect = Number(q.score) > 0;
          } else if (q.earnedPoints !== undefined && q.earnedPoints !== null) {
            isCorrect = Number(q.earnedPoints) > 0;
          } else {
            const uAns = q.userAnswer ?? q.user_answer ?? q.selectedOption ?? q.selected_option;
            const cAns = q.answer ?? q.correctAnswer ?? q.correct_answer;
            if (uAns !== undefined && cAns !== undefined) {
              isCorrect = String(uAns).trim().toLowerCase() === String(cAns).trim().toLowerCase();
            }
          }
          const tags = String(q.topic).split(',').map(t => t.trim()).filter(Boolean);
          for (const tag of tags) {
            const key = `${subject.toLowerCase()}:${tag.toLowerCase()}`;
            if (!liveMasteryMap[key]) {
              liveMasteryMap[key] = { sub_category: tag, subject, correct_count: 0, total_count: 0 };
            }
            liveMasteryMap[key].total_count += 1;
            if (isCorrect) liveMasteryMap[key].correct_count += 1;
          }
        }
      }

      for (const row of finalMasteryRows) {
        const key = `${(row.subject || '').toLowerCase()}:${(row.sub_category || '').toLowerCase()}`;
        if (!liveMasteryMap[key]) {
          liveMasteryMap[key] = {
            sub_category: row.sub_category,
            subject: row.subject,
            correct_count: Number((row.correct_count?.value ?? row.correct_count) || 0),
            total_count: Number((row.total_count?.value ?? row.total_count) || 0)
          };
        }
      }

      const topicMastery = Object.values(liveMasteryMap).map(m => ({
        ...m,
        accuracy_rate: m.total_count > 0 ? m.correct_count / m.total_count : 0
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
        parentRollups: activeParentRollups,
        topicMastery
      });
    };
    const allTopicsMap = new Map();
    for (const b of breakdownRows) {
      if (!b.topic) continue;
      const key = `${(b.subject || 'Chemistry').toLowerCase()}:${b.topic.toLowerCase()}`;
      const mastery = masteryRows.find(m => m.sub_category?.toLowerCase() === b.topic.toLowerCase() && m.subject?.toLowerCase() === b.subject?.toLowerCase());
      allTopicsMap.set(key, {
        subject: b.subject || 'Chemistry',
        topic: b.topic,
        good_at: b.good_at || '',
        not_good_at: b.not_good_at || '',
        correct_count: mastery ? Number(mastery.correct_count || 0) : 0,
        total_count: mastery ? Number(mastery.total_count || 0) : 0
      });
    }

    for (const m of masteryRows) {
      if (!m.sub_category) continue;
      const key = `${(m.subject || 'Chemistry').toLowerCase()}:${m.sub_category.toLowerCase()}`;
      if (!allTopicsMap.has(key)) {
        allTopicsMap.set(key, {
          subject: m.subject || 'Chemistry',
          topic: m.sub_category,
          good_at: '',
          not_good_at: '',
          correct_count: Number(m.correct_count || 0),
          total_count: Number(m.total_count || 0)
        });
      }
    }

    const inputTopics = Array.from(allTopicsMap.values());

    if (inputTopics.length < 1) {
      return await fetchAndResponseFinalState(0);
    }

    const prompt = `You are an expert tutor and curriculum designer specializing in USNCO (US National Chemistry Olympiad) standards. Analyze the following topic breakdown data for a student.

Your tasks:
1. AGGRESSIVE SUBTOPIC CLUSTERING & MERGES: Eliminate hyper-specific one-off subtopic fragmentation by aggressively merging low-count or narrowly phrased subtopics into clean, standardized subtopic clusters within the SAME subject.
   - MANDATORY PUNCTUATION & SLASH MERGING: Always merge slashes (/), ampersands (&), and 'and' variations (e.g. "bonding/molecular structure", "bonding & molecular structure", "bonding and molecular structure") into ONE clean title like "Bonding & Molecular Structure".
   - Merge "Determination of Rate Laws", "Initial Rates Method", and "Reaction Orders" into "Rate Laws & Reaction Orders".
   - Merge "Arrhenius Equation Calculations" and "Activation Energy" into "Arrhenius & Activation Energy".
   - Combine synonymous terms aggressively.

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
3. ALWAYS MERGE PUNCTUATION VARIATIONS: If any two input topics differ only by slashes, ampersands, or spacing (e.g. "bonding/molecular structure" vs "bonding & molecular structure"), you MUST output a merge object combining them.
4. PRESERVE EXISTING MAPPINGS: Re-use existing valid parent_topic values to complete classification instantly without re-analyzing already sorted subtopics.

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
      const allDeleteSources = new Set();
      const breakdownItems = [];
      const masteryItems = [];

      if (responseObj && Array.isArray(responseObj.merges) && responseObj.merges.length > 0) {
        for (const merge of responseObj.merges) {
          const { subject, source_topics, target_topic, good_at, not_good_at } = merge;
          const majorTitles = [
            'stoichiometry & solutions', 'descriptive & laboratory chemistry', 'states of matter & phase changes',
            'thermodynamics', 'kinetics', 'equilibrium', 'acids & bases', 'electrochemistry',
            'atomic structure & periodicity', 'organic chemistry & biochemistry'
          ];
          if (!subject || !source_topics || !target_topic || source_topics.length < 2 || majorTitles.includes(target_topic.toLowerCase().trim())) {
            continue;
          }

          for (const s of source_topics) {
            allDeleteSources.add(s.toLowerCase());
          }

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

          breakdownItems.push({ subject, topic: target_topic, good_at: good_at || '', not_good_at: not_good_at || '' });
          masteryItems.push({ subject, sub_category: target_topic, correct_count: mergedCorrect, total_count: mergedTotal, accuracy_rate: mergedAccuracy });
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

          const lowerChildren = child_topics.map(c => c.toLowerCase());
          lowerChildren.push(parent_topic.toLowerCase());
          let rollupCorrect = 0;
          let rollupTotal = 0;

          for (const m of masteryRows) {
            const catName = (m.sub_category || '').toLowerCase();
            if (lowerChildren.includes(catName) && (m.subject || '').toLowerCase() === subject.toLowerCase()) {
              rollupCorrect += Number((m.correct_count?.value ?? m.correct_count) || 0);
              rollupTotal += Number((m.total_count?.value ?? m.total_count) || 0);
            }
          }

          if (rollupTotal > 0) {
            breakdownItems.push({ subject, topic: parent_topic, good_at: good_at || '', not_good_at: not_good_at || '' });
          }
        }
      }

      const generatedParentRollups = {};
      if (responseObj && Array.isArray(responseObj.parent_rollups)) {
        for (const rollup of responseObj.parent_rollups) {
          if (rollup.parent_topic && Array.isArray(rollup.child_topics)) {
            for (const child of rollup.child_topics) {
              generatedParentRollups[child.toLowerCase()] = rollup.parent_topic;
              breakdownItems.push({
                subject: rollup.subject || 'Chemistry',
                topic: child,
                parent_topic: rollup.parent_topic,
                good_at: '',
                not_good_at: ''
              });
            }
          }
        }
      }

      // Deduplicate breakdownItems by (subject, topic)
      const uniqueBreakdownMap = new Map();
      for (const item of breakdownItems) {
        if (!item.subject || !item.topic) continue;
        const key = `${item.subject.toLowerCase()}:${item.topic.toLowerCase()}`;
        if (!uniqueBreakdownMap.has(key)) {
          uniqueBreakdownMap.set(key, { ...item });
        } else {
          const existing = uniqueBreakdownMap.get(key);
          if (!existing.good_at && item.good_at) existing.good_at = item.good_at;
          if (!existing.not_good_at && item.not_good_at) existing.not_good_at = item.not_good_at;
        }
      }
      const uniqueBreakdownItems = Array.from(uniqueBreakdownMap.values());

      // Deduplicate masteryItems by (subject, sub_category)
      const uniqueMasteryMap = new Map();
      for (const item of masteryItems) {
        if (!item.subject || !item.sub_category) continue;
        const key = `${item.subject.toLowerCase()}:${item.sub_category.toLowerCase()}`;
        if (!uniqueMasteryMap.has(key)) {
          uniqueMasteryMap.set(key, { ...item });
        } else {
          const existing = uniqueMasteryMap.get(key);
          existing.correct_count += item.correct_count;
          existing.total_count += item.total_count;
          existing.accuracy_rate = existing.total_count > 0 ? (existing.correct_count / existing.total_count) : 0;
        }
      }
      const uniqueMasteryItems = Array.from(uniqueMasteryMap.values());

      const safeUser = escapeSqlStr(sanitizedUser);
      const statements = [];

      if (allDeleteSources.size > 0) {
        const sourcesList = Array.from(allDeleteSources).map(s => escapeSqlStr(s)).join(', ');
        statements.push(`DELETE FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\` WHERE user_id = ${safeUser} AND LOWER(topic) IN (${sourcesList});`);
        statements.push(`DELETE FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\` WHERE user_id = ${safeUser} AND LOWER(sub_category) IN (${sourcesList});`);
      }

      if (uniqueBreakdownItems.length > 0) {
        const selects = uniqueBreakdownItems.map(item => `SELECT ${safeUser} AS user_id, ${escapeSqlStr(item.subject)} AS subject, ${escapeSqlStr(item.topic)} AS topic, ${escapeSqlStr(item.good_at)} AS good_at, ${escapeSqlStr(item.not_good_at)} AS not_good_at`).join('\nUNION ALL\n');
        statements.push(`
          MERGE \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\` T
          USING (${selects}) S
          ON T.user_id = S.user_id AND T.subject = S.subject AND T.topic = S.topic
          WHEN MATCHED THEN UPDATE SET good_at = COALESCE(NULLIF(S.good_at, ''), T.good_at), not_good_at = COALESCE(NULLIF(S.not_good_at, ''), T.not_good_at), updated_at = CURRENT_TIMESTAMP()
          WHEN NOT MATCHED THEN INSERT (user_id, subject, topic, good_at, not_good_at, updated_at) VALUES (S.user_id, S.subject, S.topic, S.good_at, S.not_good_at, CURRENT_TIMESTAMP());
        `);
      }

      if (uniqueMasteryItems.length > 0) {
        const selects = uniqueMasteryItems.map(item => `SELECT ${safeUser} AS user_id, ${escapeSqlStr(item.subject)} AS subject, ${escapeSqlStr(item.sub_category)} AS sub_category, ${item.correct_count} AS correct_count, ${item.total_count} AS total_count, ${item.accuracy_rate} AS accuracy_rate`).join('\nUNION ALL\n');
        statements.push(`
          MERGE \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\` T
          USING (${selects}) S
          ON T.user_id = S.user_id AND T.subject = S.subject AND T.sub_category = S.sub_category
          WHEN MATCHED THEN UPDATE SET correct_count = S.correct_count, total_count = S.total_count, accuracy_rate = S.accuracy_rate
          WHEN NOT MATCHED THEN INSERT (user_id, sub_category, subject, correct_count, total_count, accuracy_rate) VALUES (S.user_id, S.sub_category, S.subject, S.correct_count, S.total_count, S.accuracy_rate);
        `);
      }

      if (statements.length > 0) {
        await bq.query({ query: statements.join('\n') }).catch(err => console.error("Batch BigQuery execution error:", err));
      }
      return await fetchAndResponseFinalState(mergedCount, generatedParentRollups);
    }

    return await fetchAndResponseFinalState(0, {});

  } catch (err) {
    console.error('Condense topics error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
