/* eslint-disable */
import { executeWithRetry } from './_gemini.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { question, answer, userAnswer, isCorrect, userQuery, subject } = req.body;

  if (!question || answer === undefined || answer === null) {
    return res.status(400).json({ error: 'Missing question or answer' });
  }

  try {
    let subjectInstructions = 'Represent formulas in LaTeX.';
    const normSubject = String(subject || '').trim().toLowerCase();
    if (normSubject === 'chemistry') {
      subjectInstructions = 'Represent organic molecules strictly using SMILES notation where appropriate (e.g., C(C)O for ethanol, CC(=O)O for acetic acid). Represent inorganic molecules, structures, and reaction equations strictly using LaTeX (e.g., $\\text{H}_2\\text{SO}_4$, $\\text{Fe}^{3+}$).';
    }

    const prompt = `You are a world-class tutor in science and mathematics.
Analyze this exam question:
Question: ${question}
Correct Answer: ${answer}
User's Answer: ${userAnswer || 'No answer'}
User's Attempt Was: ${isCorrect ? 'Correct' : 'Incorrect'}

The user is asking: ${userQuery || 'Explain the correct answer, step-by-step, and why it is correct.'}

Tasks:
1. Provide a highly clear, detailed, and pedagogically sound explanation of the problem, the concepts involved, and why the correct answer is indeed correct. ${subjectInstructions}
2. Critically review the user's answer. If their attempt was marked 'Incorrect', determine if it is actually mathematically, chemically, or scientifically equivalent to the correct answer (for example: minor rounding differences, spelling variations, standard hyphen vs unicode minus sign, spacing or symbol differences, or alternative valid representations). If it is indeed equivalent and correct, set 'shouldRemarkCorrect' to true. Otherwise, set it to false.

Return strictly a valid JSON object with the following schema:
{
  "explanation": "Clear, detailed step-by-step explanation (without markdown headers or greetings)",
  "shouldRemarkCorrect": true or false
}`;

    const modelId = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
    const response = await executeWithRetry(modelId, (ai) => ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.3,
      },
    }));

    try {
      const parsed = JSON.parse(response.text);
      return res.status(200).json(parsed);
    } catch (parseErr) {
      return res.status(200).json({ explanation: response.text, shouldRemarkCorrect: false });
    }
  } catch (err) {
    console.error('Explanation error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
