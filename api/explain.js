/* eslint-disable */
import { executeWithRetry } from './_gemini.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { question, answer, userAnswer, isCorrect, userQuery, subject, history } = req.body;

  if (!question || answer === undefined || answer === null) {
    return res.status(400).json({ error: 'Missing question or answer' });
  }

  try {
    let subjectInstructions = 'Represent formulas in LaTeX.';
    const normSubject = String(subject || '').trim().toLowerCase();
    if (normSubject === 'chemistry') {
      subjectInstructions = 'Represent organic molecules strictly using SMILES notation where appropriate (e.g., C(C)O for ethanol, CC(=O)O for acetic acid). Represent inorganic molecules, structures, and reaction equations strictly using LaTeX (e.g., $\\text{H}_2\\text{SO}_4$, $\\text{Fe}^{3+}$).';
    }

    let historyContext = '';
    if (Array.isArray(history) && history.length > 0) {
      historyContext = '\n\nPrevious conversation history:\n' + history.map(msg => `${msg.sender === 'user' ? 'User' : 'Tutor'}: ${msg.text}`).join('\n');
    }

    const prompt = `You are a world-class tutor in science and mathematics.
Analyze this exam question:
Question: ${question}
Correct Answer: ${answer}
User's Answer: ${userAnswer || 'No answer'}
User's Attempt Was: ${isCorrect ? 'Correct' : 'Incorrect'}${historyContext}

The user is asking: ${userQuery || 'Explain the correct answer, step-by-step, and why it is correct.'}

Tasks:
1. Provide a highly clear, detailed, and pedagogically sound explanation of the problem, the concepts involved, and why the correct answer is indeed correct. ${subjectInstructions}
2. Critically review the user's answer. If their attempt was marked 'Incorrect', determine if it is actually mathematically, chemically, or scientifically equivalent to the correct answer (for example: minor rounding differences, spelling variations, standard hyphen vs unicode minus sign, spacing or symbol differences, or alternative valid representations). If it is indeed equivalent and correct, set 'shouldRemarkCorrect' to true. Otherwise, set it to false.

Return strictly a valid JSON object with the following schema:
{
  "explanation": "Clear, detailed step-by-step explanation (without markdown headers or greetings)",
  "shouldRemarkCorrect": true or false
}`;

    const modelId = 'gemini-3.1-flash-lite';
    const models = [modelId, 'gemini-3-flash-preview'];
    const response = await executeWithRetry(models, (ai, currentModel) => ai.models.generateContent({
      model: currentModel,
      contents: prompt,
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
        responseMimeType: "application/json",
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
      },
    }), req);

    let explanationText = '';
    let shouldRemarkCorrectVal = false;

    const parsed = parseJSONResponse(response.text);
    if (parsed) {
      explanationText = parsed.explanation;
      shouldRemarkCorrectVal = parsed.shouldRemarkCorrect || false;
    } else {
      console.warn('Failed to parse JSON response from Gemini, using robust extractors as fallback.');
      explanationText = extractExplanationFallback(response.text);
      shouldRemarkCorrectVal = extractShouldRemarkCorrectFallback(response.text);
    }

    return res.status(200).json({
      explanation: explanationText,
      shouldRemarkCorrect: shouldRemarkCorrectVal
    });
  } catch (err) {
    console.error('Explanation error:', err);
    const isBusyOrRateLimited = err.status === 503 || err.status === 429 || 
                                (err.message && (err.message.includes('503') || 
                                                 err.message.includes('429') ||
                                                 err.message.includes('overloaded') || 
                                                 err.message.includes('rate limit') ||
                                                 err.message.includes('busy') ||
                                                 err.message.includes('demand') ||
                                                 err.message.includes('limit')));
    if (isBusyOrRateLimited) {
      return res.status(503).json({
        error: "Sorry, the bot is busy right now. Try again later.",
        explanation: "Sorry, the bot is busy right now. Try again later.",
        shouldRemarkCorrect: false
      });
    }
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}

function escapeLiteralNewlines(jsonStr) {
  let result = '';
  let inString = false;
  let escape = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr.charAt(i);

    if (inString) {
      if (escape) {
        result += ch;
        escape = false;
      } else if (ch === '\\') {
        result += ch;
        escape = true;
      } else if (ch === '"') {
        result += ch;
        inString = false;
      } else if (ch === '\n') {
        result += '\\n';
      } else if (ch === '\r') {
        result += '\\r';
      } else {
        result += ch;
      }
    } else {
      if (ch === '"') {
        inString = true;
      }
      result += ch;
    }
  }
  return result;
}

function parseJSONResponse(text) {
  if (!text) return null;
  
  let cleanText = text.trim();

  const tryParse = (str) => {
    try {
      const escaped = escapeLiteralNewlines(str.trim());
      return JSON.parse(escaped);
    } catch (e) {
      return null;
    }
  };

  let parsed = tryParse(cleanText);
  if (parsed) return parsed;

  const jsonMatch = cleanText.match(/```json\s*([\s\S]*?)\s*```/i);
  if (jsonMatch) {
    parsed = tryParse(jsonMatch[1]);
    if (parsed) return parsed;
  }

  const codeMatch = cleanText.match(/```\s*([\s\S]*?)\s*```/i);
  if (codeMatch) {
    parsed = tryParse(codeMatch[1]);
    if (parsed) return parsed;
  }

  const firstBrace = cleanText.indexOf('{');
  const lastBrace = cleanText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = cleanText.substring(firstBrace, lastBrace + 1);
    parsed = tryParse(candidate);
    if (parsed) return parsed;
  }

  return null;
}

function extractExplanationFallback(text) {
  const keyIndex = text.indexOf('"explanation"');
  if (keyIndex === -1) return text;

  const afterKey = text.substring(keyIndex + '"explanation"'.length);
  const colonIndex = afterKey.indexOf(':');
  if (colonIndex === -1) return text;

  const afterColon = afterKey.substring(colonIndex + 1).trim();
  if (!afterColon.startsWith('"')) return text;

  let val = '';
  let escape = false;
  for (let i = 1; i < afterColon.length; i++) {
    const ch = afterColon.charAt(i);
    if (escape) {
      if (ch === 'n') val += '\n';
      else if (ch === 'r') val += '\r';
      else if (ch === 't') val += '\t';
      else val += ch;
      escape = false;
    } else if (ch === '\\') {
      escape = true;
    } else if (ch === '"') {
      return val;
    } else {
      val += ch;
    }
  }
  return val || text;
}

function extractShouldRemarkCorrectFallback(text) {
  const match = text.match(/"shouldRemarkCorrect"\s*:\s*(true|false)/i);
  if (match) {
    return match[1].toLowerCase() === 'true';
  }
  return false;
}

