import { BigQuery } from '@google-cloud/bigquery';

const projectId = process.env.BIGQUERY_PROJECT_ID || 'chronos-stress-sandbox';
const bq = new BigQuery({
  projectId: projectId,
  credentials: {
    client_email: process.env.BIGQUERY_CLIENT_EMAIL,
    private_key: process.env.BIGQUERY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

async function main() {
  console.log("Starting points recalculation...");

  try {
    // 1. Fetch all user exam results
    const resultsQuery = `
      SELECT user_id, exam_id, results_json, subject 
      FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`
    `;
    const [resultRows] = await bq.query({ query: resultsQuery });
    console.log(`Fetched ${resultRows.length} exam results rows.`);

    // 2. Fetch all user problem tags
    const tagsQuery = `
      SELECT user_id, exam_id, question_index, tag, points_value
      FROM \`${projectId}\`.\`chronos_users\`.\`user_problem_tags\`
    `;
    const [tagRows] = await bq.query({ query: tagsQuery });
    console.log(`Fetched ${tagRows.length} problem tags rows.`);

    // Build exam questions map
    // Key: user_id + '|' + exam_id + '|' + question_index
    const questionMap = new Map();
    for (const row of resultRows) {
      try {
        const results = JSON.parse(row.results_json);
        results.forEach((r, idx) => {
          const key = `${row.user_id}|${row.exam_id}|${idx}`;
          questionMap.set(key, r);
        });
      } catch (err) {
        console.error(`Error parsing JSON for exam ${row.exam_id}:`, err);
      }
    }

    // 3. Compare and prepare updates
    let updateCount = 0;
    for (const tag of tagRows) {
      const key = `${tag.user_id}|${tag.exam_id}|${tag.question_index}`;
      const question = questionMap.get(key);

      if (!question) {
        console.warn(`Warning: No question details found for tag ${key}`);
        continue;
      }

      const isFRQ = question.type === 'free_response';
      const correctPoints = isFRQ ? (question.difficulty || question.difficultyAtTime || 1) : 1;

      // Check if points_value needs updating (allow slight float inaccuracy check)
      if (Math.abs((tag.points_value || 0) - correctPoints) > 0.01) {
        console.log(`Updating ${key}: points_value ${tag.points_value} -> ${correctPoints}`);
        
        await bq.query({
          query: `
            UPDATE \`${projectId}\`.\`chronos_users\`.\`user_problem_tags\`
            SET points_value = @correctPoints
            WHERE user_id = @username 
              AND exam_id = @examId 
              AND question_index = @questionIndex
          `,
          params: {
            correctPoints,
            username: tag.user_id,
            examId: tag.exam_id,
            questionIndex: tag.question_index
          }
        });
        updateCount++;
      }
    }

    console.log(`Points recalculation completed successfully. Updated ${updateCount} tag rows.`);
  } catch (err) {
    console.error("Recalculation error:", err);
    process.exit(1);
  }
}

main();
