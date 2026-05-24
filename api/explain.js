/* eslint-disable */
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { question, answer, userAnswer, isCorrect, userQuery } = req.body;

  if (!question || !answer) {
    return res.status(400).json({ error: 'Missing question or answer' });
  }

  try {
    const prompt = `You are a world-class tutor in science and mathematics.
Analyze this exam question:
Question: ${question}
Correct Answer: ${answer}
User's Answer: ${userAnswer || 'No answer'}
User's Attempt Was: ${isCorrect ? 'Correct' : 'Incorrect'}

The user is asking: ${userQuery || 'Explain the correct answer, step-by-step, and why it is correct.'}

Provide a highly clear, detailed, and pedagogically sound explanation of the problem, the concepts involved, and why the correct answer is indeed correct. Be concise but extremely helpful. For chemistry, represent molecules using LaTeX/SMILES as appropriate. Represent formulas in LaTeX. Do not include markdown headers or greetings.`;

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
      contents: prompt,
      config: {
        temperature: 0.3,
        thinkingConfig: { thinkingBudget: 1024 },
      },
    });

    return res.status(200).json({ explanation: response.text });
  } catch (err) {
    console.error('Explanation error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
