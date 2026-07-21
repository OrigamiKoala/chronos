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

      const strengths = finalMasteryRows
        .filter(m => m.total_count >= 3 && m.accuracy_rate >= 0.70)
        .map(m => ({ topic: m.sub_category, subject: m.subject }));

      const weaknesses = finalMasteryRows
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
        topicMastery: finalMasteryRows
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
Your task is to identify and consolidate duplicate or redundant topic names within the SAME subject (e.g., "reaction kinetics" and "kinetics" should be merged into "Kinetics").

Rules:
1. ONLY combine topics that are truly duplicates or extremely similar variants representing the same concept within the same subject.
2. DO NOT combine topics that are distinct sub-concepts or specialized fields (e.g., "kinetics" and "michealis-menten kinetics" or "enzyme kinetics" MUST remain separate).
3. If two or more topics are combined, synthesize their "good_at" and "not_good_at" descriptions into concise, clear, and comprehensive summaries.
4. For the target topic name, use clean, standardized title-case capitalization (e.g. "Kinetics" or "Reaction Kinetics").
5. If no topics need to be combined, return an empty array for "merges".

Input Data:
${JSON.stringify(inputTopics, null, 2)}

Output format must be a JSON object matching this schema:
{
  "merges": [
    {
      "subject": "the subject of the topics (e.g. Chemistry)",
      "source_topics": ["array of exact topic names to merge"],
      "target_topic": "the new consolidated topic name",
      "good_at": "the synthesized description of what the user is good at in this topic",
      "not_good_at": "the synthesized description of what the user needs help with in this topic"
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
              mergedCorrect += Number(m.correct_count || 0);
              mergedTotal += Number(m.total_count || 0);
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

          mergedCount++;
        }
      }
    }

    return await fetchAndResponseFinalState(mergedCount);

  } catch (err) {
    console.error('Condense topics error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
