/* eslint-disable */
import { executeWithRetry } from './_gemini.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image, question } = req.body;

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

    const prompt = `You are a transcription assistant.
You are given this exam question:
Question: ${question || 'Not specified'}

Your goal is to transcribe/explain the user's handwritten work, calculations, steps, and final answer as shown in the image for this question.
Ensure you describe the user's full step-by-step process, calculations, logic, scratch work, and final proof in extensive detail so that a grading/explanation bot can analyze precisely where the user made progress or where they went wrong.
Even if their solution is mathematically, chemically, or scientifically wrong, transcribe exactly what they did and what their final answer is. Do NOT correct their mistakes; simply explain in words what is shown in the image.
Represent formulas and equations in LaTeX.

STRICT RULE: ONLY output the user's response/work/process based on the image. Do NOT output any introductory text (e.g. "Based on the image...", "Here is the transcription...", "The drawing shows..."), meta-commentary, or references to the canvas/drawing itself. Just start directly with the transcription of their work.`;

    const modelId = 'gemini-3.1-flash-lite';
    const models = [modelId, 'gemini-3-flash'];
    const response = await executeWithRetry(models, (ai, currentModel) => ai.models.generateContent({
      model: currentModel,
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        },
        prompt
      ],
      safety_settings: [
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        }
      ],
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        }
      ],
      config: {
        temperature: 0.3,
        safety_settings: [
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          }
        ],
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          }
        ]
      }
    }), req);

    const transcription = response.text || '';
    return res.status(200).json({ transcription });
  } catch (err) {
    console.error('Transcription error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
