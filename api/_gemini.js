import { GoogleGenAI } from '@google/genai';

const rateLimitRegistry = new Map();

function isKeyRateLimited(modelId, apiKey) {
  const today = new Date().toDateString();
  return rateLimitRegistry.get(`${modelId}:${apiKey}`) === today;
}

function markKeyRateLimited(modelId, apiKey) {
  const today = new Date().toDateString();
  rateLimitRegistry.set(`${modelId}:${apiKey}`, today);
  console.warn(`[API Rotation] Key marked rate-limited for model ${modelId} today.`);
}

export async function executeWithRetry(modelId, apiCallFn) {
  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3
  ].filter(Boolean);

  if (keys.length === 0) {
    throw new Error('GEMINI_API_KEY, GEMINI_API_KEY_2, and GEMINI_API_KEY_3 are missing');
  }

  let lastError;

  for (let i = 0; i < keys.length; i++) {
    const apiKey = keys.at(i);
    if (isKeyRateLimited(modelId, apiKey)) {
      continue;
    }

    try {
      if (i > 0) {
        console.warn(`[API Rotation] Trying ${modelId} with backup key ${i + 1}.`);
      }
      const ai = new GoogleGenAI({ apiKey });
      return await apiCallFn(ai);
    } catch (err) {
      lastError = err;
      const status = err.status || err.statusCode || (err.message && err.message.includes('429') ? 429 : null);
      if (status === 429) {
        console.warn(`[429] Rate limit hit for ${modelId} on key ${i + 1}.`);
        markKeyRateLimited(modelId, apiKey);
      } else {
        throw err;
      }
    }
  }

  throw lastError || new Error('All API keys are rate limited');
}
