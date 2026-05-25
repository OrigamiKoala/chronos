/* eslint-disable */
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image } = req.body;

  if (!image) {
    return res.status(400).json({ error: 'Missing image data' });
  }

  try {
    const parts = image.split(',');
    let base64Data = parts[1] || image;
    let mimeType = 'image/png';
    const mimeMatch = parts[0].match(/data:(.*?);/);
    if (mimeMatch) {
      mimeType = mimeMatch[1];
    }

    const prompt = `You are a transcription assistant. Your goal is to transcribe the user's handwritten work, drawings, or uploaded image of their academic solution.
Turn their image into clear, detailed words explaining their process, calculations, steps, and final answer.
Even if their solution is mathematically, chemically, or scientifically wrong, transcribe exactly what they did and what their final answer is. Do NOT correct their mistakes; simply explain in words what is shown in the image.
Represent formulas and equations in LaTeX. Keep the explanation clear and structured. No greetings or meta-commentary.`;

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        },
        prompt
      ],
      config: {
        temperature: 0.3
      }
    });

    const transcription = response.text || '';
    return res.status(200).json({ transcription });
  } catch (err) {
    console.error('Transcription error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
