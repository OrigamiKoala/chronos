/* eslint-disable */
import { BigQuery } from '@google-cloud/bigquery';

const bq = new BigQuery({
  projectId: process.env.BIGQUERY_PROJECT_ID,
  credentials: {
    client_email: process.env.BIGQUERY_CLIENT_EMAIL,
    // Replace literal '\n' text strings back into true newline characters
    private_key: process.env.BIGQUERY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { count, startingDifficulty, subject, targetUserId = 'default_user' } = req.body;

  if (!count || !startingDifficulty || !subject) {
    return res.status(400).json({ error: 'Missing required parameters: count, startingDifficulty, subject' });
  }

  const sanitizedUser = String(targetUserId).replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();

  const sqlQuery = `WITH user_profile AS (
  SELECT 
    COALESCE(
      STRING_AGG(
        FORMAT("Topic: %s (Accuracy: %d%%)", sub_category, CAST(accuracy_rate * 100 AS INT64)), 
        "; "
      ),
      "None (excellent performance across all topics)"
    ) AS weaknesses
  FROM \`chronos-stress-sandbox\`.\`chronos_users\`.\`user_topic_mastery\`
  WHERE accuracy_rate < 0.65 AND user_id = '${sanitizedUser}'
)

SELECT
  ml_generate_text_llm_result AS ai_response
FROM
  ML.GENERATE_TEXT(
    MODEL \`chronos-stress-sandbox\`.\`chronos_users\`.\`gemini_flash_model\`,
    (
      SELECT 
        CONCAT(
          "You are an expert examiner creating questions for high-stakes competitive olympiad exams. ",
          "Generate exactly ${count} ${subject} problems. The difficulty should start around ${startingDifficulty} out of 10 and can vary slightly to provide a balanced test. ",
          "If the subject is 'Math', calibrate the 1-10 difficulty scale exactly as follows: ",
          "- 1: MATHCOUNTS school/chapter level, 5: AMC 12 question 20-ish level, 8: Average USAJMO problem level, 10: Hardest problems on the IMO. ",
          "If the subject is 'Physics', calibrate the 1-10 difficulty scale exactly as follows: ",
          "- 1: introductory level, 3: AP Physics C level, 5: F=ma level, 8: USAPhO level, 10: hardest problem on the IPhO. ",
          "If the subject is 'Chemistry', calibrate the 1-10 difficulty scale exactly as follows: ",
          "- 1: simple Honors/early AP chem, 3: harder problems on the ACS Local Exam, 5: harder problems on the USNCO Nationals, 10: hardest problem on the IChO. ",
          "For Chemistry questions, represent organic molecules strictly using SMILES notation (e.g., C(C)O for ethanol, CC(=O)O for acetic acid), and represent inorganic molecules, structures, and reaction equations strictly using LaTeX (e.g., $\\\\text{H}_2\\\\text{SO}_4$, $\\\\text{Fe}^{3+}$). ",
          "Additionally, focus on these weak concepts of the user: ", weaknesses, ". ",
          "The output must be a pure JSON array containing exactly ${count} objects, with the following schema for each object: ",
          "{ 'id': 'A unique string ID', 'topic': 'The brief sub-category or topic tested (e.g. \\'Algebra\\', \\'Stoichiometry\\', \\'Mechanics\\')', 'question': 'The text of the question. It should be challenging and clear.', 'type': 'multiple_choice' or 'short_answer', 'options': ['Option A', 'Option B', 'Option C', 'Option D'], 'answer': 'The exact correct answer string', 'difficulty': a number between 1 and 10 representing difficulty } ",
          "Do not wrap the JSON in markdown code blocks. Return ONLY valid JSON."
        ) AS prompt
      FROM user_profile
    ),
    STRUCT(
      0.3 AS temperature,
      2048 AS max_output_tokens,
      TRUE AS flatten_json_output
    )
  );`;

  try {
    const [rows] = await bq.query({ query: sqlQuery });
    if (rows && rows.length > 0 && rows[0].ai_response) {
      const responseText = rows[0].ai_response;
      const parsedData = JSON.parse(responseText);
      return res.status(200).json(parsedData);
    } else {
      return res.status(500).json({ error: 'Empty response from BigQuery Gemini model' });
    }
  } catch (err) {
    console.error('BigQuery execution error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
