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

export async function executeWithRetry(models, apiCallFn, req) {
  const modelList = Array.isArray(models) ? models : [models];
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
  let all503 = true;

  for (const currentModel of modelList) {
    let modelFailedDueTo503 = false;

    for (let i = 0; i < keysOrder.length; i++) {
      const apiKey = keysOrder.at(i);
      if (isKeyRateLimited(currentModel, apiKey)) {
        continue;
      }

      try {
        if (i > 0) {
          console.warn(`[API Rotation] Selected key failed. Rotating to backup key ${i + 1} for model ${currentModel}.`);
        }
        const ai = new GoogleGenAI({ apiKey });
        return await apiCallFn(ai, currentModel);
      } catch (err) {
        lastError = err;
        let status = err.status || err.statusCode;
        if (!status && err.message) {
          const msg = err.message.toLowerCase();
          if (msg.includes('429') || msg.includes('exhausted') || msg.includes('rate limit')) {
            status = 429;
          } else if (msg.includes('503') || msg.includes('overloaded') || msg.includes('unavailable') || msg.includes('busy') || msg.includes('high demand')) {
            status = 503;
          }
        }

        if (status !== 503) {
          all503 = false;
        }

        if (status === 503) {
          console.warn(`[503] Model overloaded for ${currentModel}. Breaking out of key loop to try next model.`);
          modelFailedDueTo503 = true;
          break; // Model overloaded, trying other keys for the SAME model won't help
        } else if (status === 429) {
          console.warn(`[429] Rate limit hit for ${currentModel} on key.`);
          markKeyRateLimited(currentModel, apiKey);
        } else {
          console.warn(`[API Rotation] Error for ${currentModel}: ${err.message}. Trying next key...`);
        }
      }
    }

    // If we broke out of the keys loop due to 503, proceed to the next model.
    // If we exhausted all keys without success, also proceed to the next model.
  }

  if (all503 && lastError) {
    throw new Error('Models are currently experiencing high demand. Please try again later.');
  }

  throw lastError || new Error('All API keys failed or are rate limited');
}
