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
1. MERGES: Identify and consolidate duplicate or synonymous topic names within the SAME subject that represent the EXACT SAME concept (e.g., "kinetics", "chemical kinetics", and "reaction kinetics" should be merged into "Chemical Kinetics").
   - DO NOT merge distinct specialized sub-topics into general ones (e.g., do NOT merge "michaelis-menten kinetics" into "kinetics").

2. PARENT ROLLUPS & RETAGGING: Identify specific detailed sub-topics (e.g., "Michaelis-Menten Kinetics", "Hess's Law", "Nernst Equation", "Snell's Law") and map them to their standard overall parent category (e.g., "Chemical Kinetics", "Thermodynamics", "Electrochemistry", "Optics").
   - This ensures questions tagged with narrow sub-topics are also tagged with the overall parent topic (e.g., "Chemical Kinetics, Michaelis-Menten Kinetics").

CRITICAL CONSTRAINTS:
1. DO combine topic names that are synonymous or equivalent descriptions of the same concept (e.g. "kinetics" and "chemical kinetics", "calc" and "calculus").
2. DO NOT combine topics that are distinct specialized sub-concepts or advanced branches into single topics! (e.g., keep "michaelis-menten kinetics" as its own detailed topic).
3. For parent_rollups, map specific sub-topics to their appropriate overall parent topic (e.g., "Michaelis-Menten Kinetics" -> parent "Chemical Kinetics", "Hess's Law" -> parent "Thermodynamics").
4. For target topic names, use clean, standardized title-case capitalization (e.g. "Chemical Kinetics" or "Michaelis-Menten Kinetics").
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

          let rollupCorrect = 0;
          let rollupTotal = 0;
          const lowerChildren = child_topics.map(c => c.toLowerCase());
          lowerChildren.push(parent_topic.toLowerCase());

          for (const m of currentMasteryRows) {
            const catName = (m.sub_category || '').toLowerCase();
            if (lowerChildren.includes(catName)) {
              rollupCorrect += Number((m.correct_count?.value ?? m.correct_count) || 0);
              rollupTotal += Number((m.total_count?.value ?? m.total_count) || 0);
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
