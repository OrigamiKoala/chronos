import { GoogleGenAI } from '@google/genai';

const apiKey = import.meta.env.GEMINI_API_KEY;

let ai;
if (apiKey) {
    ai = new GoogleGenAI({ apiKey });
} else {
    console.warn("GEMINI_API_KEY is not set. Problem generation will fail unless set.");
}

export async function generateProblem(difficultyLevel, subject = "Math") {
    if (!ai) {
        // Fallback for missing API key to allow UI testing
        console.warn("Using fallback mock data due to missing API key.");
        return {
            id: Date.now().toString(),
            question: `Mock Problem (Difficulty: ${difficultyLevel}): If 3x + 4 = 19, what is x?`,
            type: "short_answer",
            answer: "5",
            difficulty: difficultyLevel
        };
    }

    const prompt = `
    You are an expert examiner creating questions for high-stakes competitive olympiad exams.
    Generate a single ${subject} problem with a difficulty level of ${difficultyLevel} out of 10.
    
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
    For Chemistry questions, represent organic molecules strictly using SMILES notation (e.g., C(C)O for ethanol, CC(=O)O for acetic acid), and represent inorganic molecules, structures, and reaction equations strictly using LaTeX (e.g., $\text{H}_2\text{SO}_4$, $\text{Fe}^{3+}$).
    
    The output must be pure JSON with the following schema:
    {
        "id": "A unique string ID",
        "topic": "The brief sub-category or topic tested (e.g. 'Algebra', 'Stoichiometry', 'Mechanics')",
        "question": "The text of the question. It should be challenging and clear.",
        "type": "multiple_choice" or "short_answer",
        "options": ["Option A", "Option B", "Option C", "Option D"], // Provide ONLY if type is multiple_choice
        "answer": "The exact correct answer string",
        "difficulty": ${difficultyLevel}
    }
    Do not wrap the JSON in markdown code blocks. Return ONLY valid JSON.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                temperature: 0.7
            }
        });

        return JSON.parse(response.text);
    } catch (error) {
        console.error("Error generating problem:", error);
        throw error;
    }
}

export async function generateProblems(count, startingDifficulty, subject = "Math", username = "default_user") {
    // Attempt to call Vercel Serverless Function first in production or if VITE_USE_VERCEL_API is enabled
    if (import.meta.env.PROD || import.meta.env.VITE_USE_VERCEL_API) {
        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    count,
                    startingDifficulty,
                    subject,
                    targetUserId: username
                }),
            });
            if (response.ok) {
                const data = await response.json();
                return Array.isArray(data) ? data : [data];
            } else {
                console.warn(`Vercel API returned status ${response.status}. Falling back to direct Gemini client.`);
            }
        } catch (error) {
            console.error("Failed to connect to Vercel API, falling back to direct Gemini client:", error);
        }
    }

    if (!ai) {
        // Fallback for missing API key to allow UI testing
        console.warn("Using fallback mock data due to missing API key.");
        const mockProblems = [];
        for (let i = 0; i < count; i++) {
            const diff = Math.min(10, Math.max(1, startingDifficulty + (i % 2 === 0 ? 1 : -1) * Math.floor(i / 2)));
            mockProblems.push({
                id: `${Date.now()}-${i}`,
                question: `Mock ${subject} Problem ${i + 1} (Difficulty: ${diff}): What is ${i + 1} + ${diff}?`,
                type: i % 2 === 0 ? "multiple_choice" : "short_answer",
                options: i % 2 === 0 ? [`${i + 1 + diff}`, `${i + 2 + diff}`, `${i + 3 + diff}`, `${i + 4 + diff}`] : undefined,
                answer: `${i + 1 + diff}`,
                difficulty: diff
            });
        }
        return mockProblems;
    }

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
    For Chemistry questions, represent organic molecules strictly using SMILES notation (e.g., C(C)O for ethanol, CC(=O)O for acetic acid), and represent inorganic molecules, structures, and reaction equations strictly using LaTeX (e.g., $\text{H}_2\text{SO}_4$, $\text{Fe}^{3+}$).
    
    The output must be a pure JSON array containing exactly ${count} objects, with the following schema for each object:
    {
        "id": "A unique string ID",
        "topic": "The brief sub-category or topic tested (e.g. 'Algebra', 'Stoichiometry', 'Mechanics')",
        "question": "The text of the question. It should be challenging and clear.",
        "type": "multiple_choice" or "short_answer",
        "options": ["Option A", "Option B", "Option C", "Option D"], // Provide ONLY if type is multiple_choice
        "answer": "The exact correct answer string",
        "difficulty": a number between 1 and 10 representing difficulty
    }
    Do not wrap the JSON in markdown code blocks. Return ONLY valid JSON.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                temperature: 0.7
            }
        });

        const data = JSON.parse(response.text);
        return Array.isArray(data) ? data : [data];
    } catch (error) {
        console.error("Error generating problems:", error);
        throw error;
    }
}

export function generateBigQuerySQL(count, startingDifficulty, subject = "Math") {
    return `WITH user_profile AS (
  SELECT 
    user_id,
    STRING_AGG(
      FORMAT("Topic: %s (Accuracy: %d%%)", sub_category, CAST(accuracy_rate * 100 AS INT64)), 
      "; "
    ) AS weaknesses
  FROM \`your_project.your_dataset.user_topic_mastery\`
  WHERE accuracy_rate < 0.65 AND user_id = @targetUserId
  GROUP BY user_id
)

SELECT
  ml_generate_text_result AS ai_response
FROM
  ML.GENERATE_TEXT(
    MODEL \`your_project.your_dataset.gemini_pro_model\`,
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
}


