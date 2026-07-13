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

export async function executeWithRetry(models, apiCallFn) {
  const modelList = Array.isArray(models) ? models : [models];
  const keys = [
    process.env.api_1,
    process.env.api_2,
    process.env.api_3,
    process.env.api_4,
    process.env.api_5,
    process.env.api_6,
    process.env.api_7,
    process.env.api_8,
    process.env.api_9,
    process.env.api_10,
    process.env.api_11,
    process.env.api_12,
    process.env.api_13,
    process.env.api_14,
    process.env.api_15,
    process.env.api_16,
    process.env.api_17,
    process.env.api_18,
    process.env.api_19,
    process.env.api_20,
    process.env.api_21,
    process.env.api_22,
    process.env.api_23,
    process.env.api_24,
    process.env.api_25
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
    for (let i = 0; i < keysOrder.length; i++) {
      const apiKey = keysOrder.at(i);
      if (isKeyRateLimited(currentModel, apiKey)) {
        continue;
      }

      try {
        if (i > 0) {
          console.warn(`[API Rotation] Selected key failed. Rotating to backup key ${i + 1} for model ${currentModel}.`);
        }
        const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 300_000 } }); // 5-minute timeout
        const result = await apiCallFn(ai, currentModel);
        console.log(`[AI Success] Successfully received response from model ${currentModel}:`, JSON.stringify(result, null, 2));
        return result;
      } catch (err) {
        lastError = err;
        let status = err.status || err.statusCode;
        const msg = err.message ? err.message.toLowerCase() : '';
        if (status === 500 || status === 503 || msg.includes('demand') || msg.includes('500') || msg.includes('503') || msg.includes('overloaded') || msg.includes('unavailable') || msg.includes('busy')) {
          status = 503;
        } else if (status === 429 || msg.includes('429') || msg.includes('exhausted') || msg.includes('rate limit')) {
          status = 429;
        }

        if (status !== 503) {
          all503 = false;
        }

        if (status === 503) {
          console.warn(`[503] Model overloaded for ${currentModel}. Breaking out of key loop to try next model.`);
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

export function escapeLiteralNewlines(jsonStr) {
  let result = '';
  let inString = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr.charAt(i);

    if (ch === '"') {
      inString = !inString;
      result += ch;
    } else if (inString && ch === '\\') {
      const nextCh = jsonStr.charAt(i + 1);
      if (nextCh === '"') {
        result += '\\"';
        i++;
      } else if (nextCh === '\\') {
        result += '\\\\';
        i++;
      } else if ('nrtbfu/'.includes(nextCh)) {
        // If it's n, r, t, b, f followed by a letter, it's likely a LaTeX command (like \nu, \rho, \text, \beta, \frac)
        const nextNextCh = jsonStr.charAt(i + 2);
        if ('nrtbf'.includes(nextCh) && /[a-zA-Z]/.test(nextNextCh)) {
          result += '\\\\';
        } else {
          // Valid JSON escape sequence — pass through unchanged
          result += '\\' + nextCh;
          i++;
        }
      } else {
        // Dangling backslash — escape it
        result += '\\\\';
      }
    } else {
      if (inString && ch === '\n') {
        result += '\\n';
      } else if (inString && ch === '\r') {
        result += '\\r';
      } else {
        result += ch;
      }
    }
  }
  return result;
}


export function parseJSONResponse(text) {
  if (!text) return null;

  let cleanText = text.trim();

  const tryParse = (str) => {
    try {
      const escaped = escapeLiteralNewlines(str.trim());
      return JSON.parse(escaped);
    } catch {
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

  // Try extracting the first [...] array block
  const firstBracket = cleanText.indexOf('[');
  const lastBracket = cleanText.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const candidate = cleanText.substring(firstBracket, lastBracket + 1);
    parsed = tryParse(candidate);
    if (parsed) return parsed;
  }

  // Try extracting the first {...} object block
  const firstBrace = cleanText.indexOf('{');
  const lastBrace = cleanText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = cleanText.substring(firstBrace, lastBrace + 1);
    parsed = tryParse(candidate);
    if (parsed) {
      // If the parsed object has a property whose value is an array,
      // that's probably the wrapped array from a json_object response.
      for (const key of Object.keys(parsed)) {
        if (Array.isArray(parsed[key]) && parsed[key].length > 0) {
          return parsed[key];
        }
      }
      return parsed;
    }
  }

  return null;
}
