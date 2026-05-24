/* eslint-disable */
import { BigQuery } from '@google-cloud/bigquery';
import { GoogleGenAI } from '@google/genai';

const bq = new BigQuery({
  projectId: process.env.BIGQUERY_PROJECT_ID,
  credentials: {
    client_email: process.env.BIGQUERY_CLIENT_EMAIL,
    // Replace literal '\n' text strings back into true newline characters
    private_key: process.env.BIGQUERY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { count, startingDifficulty, subject, targetUserId = 'default_user' } = req.body;

  if (!count || !startingDifficulty || !subject) {
    return res.status(400).json({ error: 'Missing required parameters: count, startingDifficulty, subject' });
  }

  const sanitizedUser = String(targetUserId).replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
  const projectId = process.env.BIGQUERY_PROJECT_ID || 'chronos-stress-sandbox';

  // 1. Run a fast, lightweight BigQuery query to fetch weaknesses
  const sqlQuery = `
    SELECT 
      COALESCE(
        STRING_AGG(
          FORMAT("Topic: %s (Accuracy: %d%%)", sub_category, CAST(accuracy_rate * 100 AS INT64)), 
          "; "
        ),
        "None (excellent performance across all topics)"
      ) AS weaknesses
    FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
    WHERE accuracy_rate < 0.65 AND user_id = @targetUserId
  `;

  let weaknesses = "None (excellent performance across all topics)";

  try {
    const [rows] = await bq.query({
      query: sqlQuery,
      params: { targetUserId: sanitizedUser },
    });
    if (rows && rows.length > 0 && rows[0].weaknesses) {
      weaknesses = rows[0].weaknesses;
    }
  } catch (err) {
    console.error('BigQuery execution error:', err);
    // Continue with the default "None" value if query fails to avoid blocking the user
  }

  // 2. Ask Gemini directly via the modern API client with exact schema enforcement
  const prompt = `
  You are an expert examiner creating questions for high-stakes competitive olympiad exams.
  Generate exactly ${count} ${subject} problems. The difficulty should start around ${startingDifficulty} out of 10 and can vary slightly to provide a balanced test.
  
  If the subject is "Math", calibrate the 1-10 difficulty scale exactly as follows:
  - 1: MATHCOUNTS school/chapter level
  - 5: AMC 12 question 20-ish level
  - 8: Average USAJMO problem level
  - 10: Hardest problems on the IMO
  
  If the subject is "Physics", calibrate the 1-10 difficulty scale exactly as follows:
  - 1: introductory level
  - 3: AP Physics C level
  - 5: F=ma level
  - 8: USAPhO level
  - 10: hardest problem on the IPhO
  
  If the subject is "Chemistry", calibrate the 1-10 difficulty scale exactly as follows:
  - 1: simple Honors/early AP chem
  - 3: harder problems on the ACS Local Exam
  - 5: harder problems on the USNCO Nationals
  - 10: hardest problem on the IChO
  For Chemistry questions, represent organic molecules strictly using SMILES notation (e.g., C(C)O for ethanol, CC(=O)O for acetic acid), and represent inorganic molecules, structures, and reaction equations strictly using LaTeX (e.g., $\\text{H}_2\\text{SO}_4$, $\\text{Fe}^{3+}$).
  
  Additionally, focus on these weak concepts of the user: ${weaknesses}.
  
  Ensure the generated JSON matches the requested schema precisely.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "A unique string ID" },
              topic: { type: "string", description: "The brief sub-category or topic tested (e.g. 'Algebra', 'Stoichiometry', 'Mechanics')" },
              question: { type: "string", description: "The text of the question. It should be challenging and clear." },
              type: { type: "string", enum: ["multiple_choice", "short_answer"] },
              options: { 
                type: "array", 
                items: { type: "string" }, 
                description: "Provide four options if type is multiple_choice. Omit or leave empty if short_answer." 
              },
              answer: { type: "string", description: "The exact correct answer string" },
              difficulty: { type: "integer", description: "A number between 1 and 10 representing difficulty" }
            },
            required: ["id", "topic", "question", "type", "answer", "difficulty"]
          }
        },
        temperature: 0.3
      }
    });

    if (response && response.text) {
      const parsedData = JSON.parse(response.text);
      return res.status(200).json(parsedData);
    } else {
      return res.status(500).json({ error: 'Empty response from Gemini' });
    }
  } catch (err) {
    console.error('Gemini direct invocation error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
