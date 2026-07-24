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

export function getGeminiApiKeys() {
  const keys = [];

  if (process.env.GEMINI_API_KEYS) {
    const list = process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(Boolean);
    keys.push(...list);
  }

  if (process.env.GEMINI_API_KEY) {
    const key = process.env.GEMINI_API_KEY.trim();
    if (key && !keys.includes(key)) keys.push(key);
  }

  const numberedKeysMap = new Map();
  for (const envKey of Object.keys(process.env)) {
    const match = envKey.match(/^api_(\d+)$/i);
    if (match && process.env[envKey]) {
      const idx = parseInt(match[1], 10);
      numberedKeysMap.set(idx, process.env[envKey].trim());
    }
  }

  for (let i = 1; i <= 100; i++) {
    const val = process.env[`api_${i}`];
    if (val && !numberedKeysMap.has(i)) {
      numberedKeysMap.set(i, val.trim());
    }
  }

  const sortedIndices = Array.from(numberedKeysMap.keys()).sort((a, b) => a - b);
  for (const idx of sortedIndices) {
    const k = numberedKeysMap.get(idx);
    if (k && !keys.includes(k)) {
      keys.push(k);
    }
  }

  return keys;
}

export async function executeWithRetry(models, apiCallFn) {
  const modelList = Array.isArray(models) ? models : [models];
  const keys = getGeminiApiKeys();

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
        console.log(`[AI Success] Successfully received response from model ${currentModel}:`, typeof result === 'string' ? result : JSON.stringify(result, null, 2));
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
          let isLatex = true;
          if (nextCh === 'n') {
            const match = jsonStr.slice(i + 1).match(/^[a-zA-Z]+/);
            if (match) {
              const word = match[0];
              const latexNCommands = new Set([
                'nu', 'neg', 'neq', 'notin', 'nexists', 'nearrow', 'nabla', 'natural', 
                'napprox', 'node', 'normalsize', 'nonumber', 'ncong', 'ni', 'nicefrac', 
                'nsim', 'nsub', 'nsubset', 'nsubseteq', 'nsucc', 'nsqsube', 'nsqsupe', 
                'nsupset', 'nsupseteq', 'ntriangle', 'nvar', 'nvdash', 'nvDash', 'nVDash',
                'nano'
              ]);
              const isCommonNCommand = latexNCommands.has(word) || word.startsWith('new') || word.startsWith('num');
              if (!isCommonNCommand) {
                isLatex = false;
              }
            } else {
              isLatex = false;
            }
          }
          if (isLatex) {
            result += '\\\\';
          } else {
            result += '\\n';
            i++;
          }
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


export function normalizeLaTeX(str) {
  if (typeof str !== 'string' || !str) return str;

  let cleaned = str;

  // 1. Convert TAB/control characters before LaTeX commands starting with t (e.g. \times, \text, \theta, \tau, \tilde, \to)
  cleaned = cleaned.replace(/\t(imes|ext|heta|au|ilde|riangle|op|an|anh|here|sfrac|o\b)/g, '\\\\t$1');

  // 2. Convert raw 'times' directly following numbers (e.g. 1.00times10^{-2} or 1.00 times 10^{-2}) to \times
  cleaned = cleaned.replace(/([0-9.]+)\s*\\?\t?times/gi, '$1 \\\\times ');

  // 3. Fix unescaped chemical formulas like ceH2A, ceNa2CO3, ceNaHCO3, ceAgCl, ce[ML2]+ outside or inside math mode
  cleaned = cleaned.replace(/(^|[^a-zA-Z0-9\\])ce([A-Z][a-zA-Z0-9_{}+\-]*|\{[^}]+\})/g, '$1\\\\ce{$2}');

  // 4. Unescape literal string escapes for newlines/tabs if present as literal "\n", "\r", "\t",
  // while preserving valid LaTeX commands like \nu, \rho, \tau, \text, \times, \tilde, \triangle, \theta, etc.
  cleaned = cleaned
    .replace(/\\+n(?![u]|eq|abla|eg|otin|exists|ot|atural|ewline|oindent|earrow|warrow|left|right|parallel|prec|succ|sim|sub|sup|vdash|vDash|Vdash|VDash|leqslant|geqslant|less|gtr|[a-z]*[0-9{}])/g, '\n')
    .replace(/\\+r(?![h]o|[a-z]*[0-9{}])/g, '\r')
    .replace(/\\+t(?![a]u|[h]eta|[e]xt|[i]mes|[i]lde|[a]n|[a]nh|[o]p|[r]iangle|[h]ere|[s]frac|[a-z]*[0-9{}])/g, '\t');

  // 5. Normalize 2 or more backslashes before LaTeX command names or symbols (e.g. \\ce -> \ce, \\text -> \text, \\circ -> \circ, \\times -> \times)
  cleaned = cleaned.replace(/\\{2,}([a-zA-Z]+|[%$_#{}^])/g, '\\$1');

  // 6. Normalize one or more backslashes before ^ (e.g. 200\ ^ -> 200^, 200\\ ^ -> 200^)
  cleaned = cleaned.replace(/\\+\s*\^/g, '^');

  // 7. Reduce 4 or more backslashes to double backslash \\ (for row breaks in arrays/matrices)
  cleaned = cleaned.replace(/\\{4,}/g, '\\\\');

  return cleaned;
}

export function deepCleanLaTeX(obj) {
  if (typeof obj === 'string') {
    return normalizeLaTeX(obj);
  } else if (Array.isArray(obj)) {
    return obj.map(deepCleanLaTeX);
  } else if (obj && typeof obj === 'object') {
    const newObj = {};
    for (const key of Object.keys(obj)) {
      newObj[key] = deepCleanLaTeX(obj[key]);
    }
    return newObj;
  }
  return obj;
}

export function parseJSONResponse(text) {
  if (!text) return null;

  let cleanText = text.trim();

  const tryParse = (str) => {
    try {
      const escaped = escapeLiteralNewlines(str.trim());
      const parsed = JSON.parse(escaped);
      return deepCleanLaTeX(parsed);
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
