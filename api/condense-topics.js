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
    // 1. Fetch current breakdowns and mastery
    const getTopicsQuery = `
      SELECT topic, good_at, not_good_at, subject
      FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\`
      WHERE user_id = @username
    `;
    const [breakdownRows] = await bq.query({
      query: getTopicsQuery,
      params: { username: sanitizedUser }
    });

    // 0. Auto-repair historic corrupt mastery rows where correct_count > total_count
    await bq.query({
      query: `UPDATE \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
        SET correct_count = total_count,
            accuracy_rate = 1.0
        WHERE user_id = @username AND correct_count > total_count`,
      params: { username: sanitizedUser }
    }).catch(err => console.error("Auto-repair mastery error:", err));

    const getMasteryQuery = `
      SELECT sub_category, subject, correct_count, total_count, accuracy_rate
      FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
      WHERE user_id = @username
    `;
    const [masteryRows] = await bq.query({
      query: getMasteryQuery,
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
        topicMastery
      });
    };

    if (breakdownRows.length < 2) {
      return await fetchAndResponseFinalState(0);
    }

    // 2. Prepare AI input
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

    const prompt = `You are an expert tutor and curriculum designer. Analyze the following topic breakdown data for a student.

Your tasks:
1. AGGRESSIVE SUBTOPIC CLUSTERING & MERGES: Eliminate hyper-specific one-off subtopic fragmentation by aggressively merging low-count or narrowly phrased subtopics into clean, standardized subtopic clusters within the SAME subject.
   - Merge "Determination of Rate Laws", "Initial Rates Method", and "Reaction Orders" into "Rate Laws & Reaction Orders".
   - Merge "Arrhenius Equation Calculations" and "Activation Energy" into "Arrhenius Equation & Activation Energy".
   - Merge "Hückel's Rule" and "Aromatic Compounds" into "Aromaticity".
   - Combine synonymous terms (e.g., "kinetics", "chemical kinetics", and "reaction kinetics" -> "Chemical Kinetics").

2. PARENT ROLLUPS & RETAGGING: Map specific subtopics to their standard overall parent category (e.g., "Chemical Kinetics", "Thermodynamics", "Electrochemistry", "Organic Chemistry").
   - Ensures questions tagged with subtopics are also tagged with their parent category (e.g., "Chemical Kinetics, Rate Laws & Reaction Orders").

CRITICAL CONSTRAINTS:
1. ELIMINATE ONE-OFF SUBTOPIC SPAM: Actively combine minor/specific variants into clean, reusable subtopic clusters.
2. DO NOT combine completely distinct major fields or unrelated concepts (e.g., do not merge Thermodynamics into Kinetics).
3. Synthesize "good_at" and "not_good_at" descriptions when topics are merged.
4. Target names MUST be clean, standardized Title-Case (e.g., "Rate Laws & Reaction Orders", "Chemical Kinetics").
5. If no topics need to be combined or rolled up, return empty arrays for "merges" and "parent_rollups".

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

    const modelId = 'gemini-3.5-flash-lite';
    const models = [modelId, 'gemini-3.1-flash-lite'];
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

    let mergedCount = 0;
    if (response.output_text) {
      const responseObj = parseJSONResponse(response.output_text);
      if (responseObj && Array.isArray(responseObj.merges) && responseObj.merges.length > 0) {
        for (const merge of responseObj.merges) {
          const { subject, source_topics, target_topic, good_at, not_good_at } = merge;
          if (!subject || !source_topics || !target_topic || source_topics.length < 2) {
            continue;
          }

          // Calculate combined mastery
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

          // 1. Delete source topics from breakdown
          await bq.query({
            query: `DELETE FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\`
              WHERE user_id = @username AND LOWER(subject) = LOWER(@subject) AND LOWER(topic) IN UNNEST(@sources)`,
            params: { username: sanitizedUser, subject, sources: source_topics.map(s => s.toLowerCase()) }
          });

          // 2. Delete source topics from mastery
          await bq.query({
            query: `DELETE FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
              WHERE user_id = @username AND LOWER(subject) = LOWER(@subject) AND LOWER(sub_category) IN UNNEST(@sources)`,
            params: { username: sanitizedUser, subject, sources: source_topics.map(s => s.toLowerCase()) }
          });

          // 3. Upsert target topic into breakdown
          await bq.query({
            query: `MERGE \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\` T
              USING (SELECT @username AS user_id, @subject AS subject, @target AS topic) S
              ON T.user_id = S.user_id AND T.subject = S.subject AND T.topic = S.topic
              WHEN MATCHED THEN
                UPDATE SET good_at = @goodAt, not_good_at = @notGoodAt, updated_at = CURRENT_TIMESTAMP()
              WHEN NOT MATCHED THEN
                INSERT (user_id, subject, topic, good_at, not_good_at, updated_at)
                VALUES (@username, @subject, @target, @goodAt, @notGoodAt, CURRENT_TIMESTAMP())`,
            params: { username: sanitizedUser, subject, target: target_topic, goodAt: good_at || '', notGoodAt: not_good_at || '' }
          });

          // 4. Upsert target topic into mastery
          await bq.query({
            query: `MERGE \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\` T
              USING (SELECT @username AS user_id, @subject AS subject, @target AS sub_category) S
              ON T.user_id = S.user_id AND T.subject = S.subject AND T.sub_category = S.sub_category
              WHEN MATCHED THEN
                UPDATE SET correct_count = @correct, total_count = @total, accuracy_rate = @accuracy
              WHEN NOT MATCHED THEN
                INSERT (user_id, sub_category, subject, correct_count, total_count, accuracy_rate)
                VALUES (@username, @target, @subject, @correct, @total, @accuracy)`,
            params: { username: sanitizedUser, subject, target: target_topic, correct: mergedCorrect, total: mergedTotal, accuracy: mergedAccuracy },
            types: { correct: 'INT64', total: 'INT64', accuracy: 'FLOAT64' }
          });

          // 6. Update question category topics in user_wrong_problems (supporting comma-separated topics)
          await bq.query({
            query: `UPDATE \`${projectId}\`.\`chronos_users\`.\`user_wrong_problems\`
              SET topic = ARRAY_TO_STRING(
                ARRAY(
                  SELECT DISTINCT IF(LOWER(TRIM(part)) IN UNNEST(@sources), @target, TRIM(part))
                  FROM UNNEST(SPLIT(topic, ',')) part
                  WHERE TRIM(part) != ''
                ),
                ', '
              )
              WHERE user_id = @username AND LOWER(subject) = LOWER(@subject)
                AND EXISTS (
                  SELECT 1 FROM UNNEST(SPLIT(topic, ',')) part
                  WHERE LOWER(TRIM(part)) IN UNNEST(@sources)
                )`,
            params: { username: sanitizedUser, subject, target: target_topic, sources: source_topics.map(s => s.toLowerCase()) }
          }).catch(err => console.error("Failed to update user_wrong_problems for condense:", err));

          // 7. Update topic in pregenerated_questions (supporting comma-separated topics)
          await bq.query({
            query: `UPDATE \`${projectId}\`.\`chronos_users\`.\`pregenerated_questions\`
              SET topic = ARRAY_TO_STRING(
                ARRAY(
                  SELECT DISTINCT IF(LOWER(TRIM(part)) IN UNNEST(@sources), @target, TRIM(part))
                  FROM UNNEST(SPLIT(topic, ',')) part
                  WHERE TRIM(part) != ''
                ),
                ', '
              )
              WHERE LOWER(subject) = LOWER(@subject)
                AND EXISTS (
                  SELECT 1 FROM UNNEST(SPLIT(topic, ',')) part
                  WHERE LOWER(TRIM(part)) IN UNNEST(@sources)
                )`,
            params: { subject, target: target_topic, sources: source_topics.map(s => s.toLowerCase()) }
          }).catch(err => console.error("Failed to update pregenerated_questions for condense:", err));

          mergedCount++;
        }
      }

      // Process parent rollups so that specific sub-topics are also factored into overall parent categories
      if (responseObj && Array.isArray(responseObj.parent_rollups) && responseObj.parent_rollups.length > 0) {
        for (const rollup of responseObj.parent_rollups) {
          const { subject, parent_topic, child_topics, good_at, not_good_at } = rollup;
          if (!subject || !parent_topic || !Array.isArray(child_topics) || child_topics.length === 0) {
            continue;
          }

          // Refetch fresh mastery rows to include any merges that just happened
          const [currentMasteryRows] = await bq.query({
            query: `SELECT sub_category, subject, correct_count, total_count, accuracy_rate
              FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
              WHERE user_id = @username AND LOWER(subject) = LOWER(@subject)`,
            params: { username: sanitizedUser, subject }
          });

          // Check if parent_topic already has a direct mastery row
          const parentRow = currentMasteryRows.find(m => (m.sub_category || '').toLowerCase() === parent_topic.toLowerCase());
          let rollupCorrect = 0;
          let rollupTotal = 0;

          if (parentRow && Number((parentRow.total_count?.value ?? parentRow.total_count) || 0) > 0) {
            rollupCorrect = Number((parentRow.correct_count?.value ?? parentRow.correct_count) || 0);
            rollupTotal = Number((parentRow.total_count?.value ?? parentRow.total_count) || 0);
          } else {
            const lowerChildren = child_topics.map(c => c.toLowerCase());
            for (const m of currentMasteryRows) {
              const catName = (m.sub_category || '').toLowerCase();
              if (lowerChildren.includes(catName)) {
                rollupCorrect += Number((m.correct_count?.value ?? m.correct_count) || 0);
                rollupTotal += Number((m.total_count?.value ?? m.total_count) || 0);
              }
            }
          }

          if (rollupTotal > 0) {
            const rollupAccuracy = rollupCorrect / rollupTotal;

            // 1. Upsert parent topic into breakdown
            await bq.query({
              query: `MERGE \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\` T
                USING (SELECT @username AS user_id, @subject AS subject, @target AS topic) S
                ON T.user_id = S.user_id AND T.subject = S.subject AND T.topic = S.topic
                WHEN MATCHED THEN
                  UPDATE SET good_at = COALESCE(NULLIF(@goodAt, ''), T.good_at), not_good_at = COALESCE(NULLIF(@notGoodAt, ''), T.not_good_at), updated_at = CURRENT_TIMESTAMP()
                WHEN NOT MATCHED THEN
                  INSERT (user_id, subject, topic, good_at, not_good_at, updated_at)
                  VALUES (@username, @subject, @target, @goodAt, @notGoodAt, CURRENT_TIMESTAMP())`,
              params: { username: sanitizedUser, subject, target: parent_topic, goodAt: good_at || '', notGoodAt: not_good_at || '' }
            }).catch(err => console.error("Failed to rollup parent breakdown:", err));

            // 2. Upsert parent topic into mastery
            await bq.query({
              query: `MERGE \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\` T
                USING (SELECT @username AS user_id, @subject AS subject, @target AS sub_category) S
                ON T.user_id = S.user_id AND T.subject = S.subject AND T.sub_category = S.sub_category
                WHEN MATCHED THEN
                  UPDATE SET correct_count = @correct, total_count = @total, accuracy_rate = @accuracy
                WHEN NOT MATCHED THEN
                  INSERT (user_id, sub_category, subject, correct_count, total_count, accuracy_rate)
                  VALUES (@username, @target, @subject, @correct, @total, @accuracy)`,
              params: { username: sanitizedUser, subject, target: parent_topic, correct: rollupCorrect, total: rollupTotal, accuracy: rollupAccuracy },
              types: { correct: 'INT64', total: 'INT64', accuracy: 'FLOAT64' }
            }).catch(err => console.error("Failed to rollup parent mastery:", err));

            // 3. Retag questions in pregenerated_questions to include parent_topic if missing
            await bq.query({
              query: `UPDATE \`${projectId}\`.\`chronos_users\`.\`pregenerated_questions\`
                SET topic = ARRAY_TO_STRING(
                  ARRAY(
                    SELECT DISTINCT TRIM(part)
                    FROM UNNEST(SPLIT(CONCAT(@parentTopic, ', ', topic), ',')) part
                    WHERE TRIM(part) != ''
                  ),
                  ', '
                )
                WHERE LOWER(subject) = LOWER(@subject)
                  AND EXISTS (
                    SELECT 1 FROM UNNEST(SPLIT(topic, ',')) part
                    WHERE LOWER(TRIM(part)) IN UNNEST(@childSources)
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM UNNEST(SPLIT(topic, ',')) part
                    WHERE LOWER(TRIM(part)) = LOWER(@parentTopic)
                  )`,
              params: { subject, parentTopic: parent_topic, childSources: child_topics.map(c => c.toLowerCase()) }
            }).catch(err => console.error("Failed to retag pregenerated_questions for parent rollup:", err));

            // 4. Retag questions in user_wrong_problems to include parent_topic if missing
            await bq.query({
              query: `UPDATE \`${projectId}\`.\`chronos_users\`.\`user_wrong_problems\`
                SET topic = ARRAY_TO_STRING(
                  ARRAY(
                    SELECT DISTINCT TRIM(part)
                    FROM UNNEST(SPLIT(CONCAT(@parentTopic, ', ', topic), ',')) part
                    WHERE TRIM(part) != ''
                  ),
                  ', '
                )
                WHERE user_id = @username AND LOWER(subject) = LOWER(@subject)
                  AND EXISTS (
                    SELECT 1 FROM UNNEST(SPLIT(topic, ',')) part
                    WHERE LOWER(TRIM(part)) IN UNNEST(@childSources)
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM UNNEST(SPLIT(topic, ',')) part
                    WHERE LOWER(TRIM(part)) = LOWER(@parentTopic)
                  )`,
              params: { username: sanitizedUser, subject, parentTopic: parent_topic, childSources: child_topics.map(c => c.toLowerCase()) }
            }).catch(err => console.error("Failed to retag user_wrong_problems for parent rollup:", err));

            mergedCount++;
          }
        }
      }
    }

    return await fetchAndResponseFinalState(mergedCount);

  } catch (err) {
    console.error('Condense topics error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
