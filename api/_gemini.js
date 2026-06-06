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

export async function executeWithRetry(modelId, apiCallFn, req) {
  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
    process.env.GEMINI_API_KEY_6,
    process.env.GEMINI_API_KEY_7,
    process.env.GEMINI_API_KEY_8,
    process.env.GEMINI_API_KEY_9,
    process.env.GEMINI_API_KEY_10,
    process.env.GEMINI_API_KEY_11,
    process.env.GEMINI_API_KEY_12
  ].filter(Boolean);

  if (keys.length === 0) {
    throw new Error('GEMINI_API_KEYs are missing');
  }

  // Use Math.random to pick a starting index for rotation
  const selectedIndex = Math.floor(Math.random() * keys.length);

  // Build the rotation order starting from selectedIndex
  const keysOrder = [];
  for (let i = 0; i < keys.length; i++) {
    const idx = (selectedIndex + i) % keys.length;
    keysOrder.push(keys.at(idx));
  }

  let lastError;

  for (let i = 0; i < keysOrder.length; i++) {
    const apiKey = keysOrder.at(i);
    if (isKeyRateLimited(modelId, apiKey)) {
      continue;
    }

    try {
      if (i > 0) {
        console.warn(`[API Rotation] Selected key failed. Rotating to backup key ${i + 1} for model ${modelId}.`);
      }
      const ai = new GoogleGenAI({ apiKey });
      return await apiCallFn(ai);
    } catch (err) {
      lastError = err;
      const status = err.status || err.statusCode || (err.message && err.message.includes('429') ? 429 : null);
      if (status === 429) {
        console.warn(`[429] Rate limit hit for ${modelId} on key.`);
        markKeyRateLimited(modelId, apiKey);
      } else {
        console.warn(`[API Rotation] Error for ${modelId}: ${err.message}. Trying next key...`);
      }
    }
  }

  throw lastError || new Error('All API keys failed or are rate limited');
}
