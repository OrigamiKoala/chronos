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
  const primaryKey = process.env.GEMINI_API_KEY;
  const backupKey = process.env.GEMINI_API_KEY_2;

  if (!primaryKey && !backupKey) {
    throw new Error('GEMINI_API_KEY and GEMINI_API_KEY_2 are missing');
  }

  let lastError;

  if (primaryKey && !isKeyRateLimited(modelId, primaryKey)) {
    try {
      const ai = new GoogleGenAI({ apiKey: primaryKey });
      return await apiCallFn(ai);
    } catch (err) {
      lastError = err;
      const status = err.status || err.statusCode || (err.message && err.message.includes('429') ? 429 : null);
      if (status === 429) {
        console.warn(`[429] Rate limit hit for ${modelId} on primary key.`);
        markKeyRateLimited(modelId, primaryKey);
      } else {
        throw err;
      }
    }
  }

  if (backupKey) {
    if (isKeyRateLimited(modelId, backupKey)) {
      throw new Error(`Both primary and backup keys are rate limited for ${modelId}`);
    }
    try {
      console.warn(`[API Rotation] Trying ${modelId} with backup key.`);
      const ai = new GoogleGenAI({ apiKey: backupKey });
      return await apiCallFn(ai);
    } catch (err) {
      const status = err.status || err.statusCode || (err.message && err.message.includes('429') ? 429 : null);
      if (status === 429) {
        console.warn(`[429] Rate limit hit for ${modelId} on backup key.`);
        markKeyRateLimited(modelId, backupKey);
      }
      throw err;
    }
  }

  throw lastError || new Error('No API key available or all rate limited');
}
