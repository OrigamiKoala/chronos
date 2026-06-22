/* eslint-disable */
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

// Random key selection on page load
if (typeof sessionStorage !== 'undefined') {
  const keysCount = [
    import.meta.env.GEMINI_API_KEY,
    import.meta.env.GEMINI_API_KEY_2,
    import.meta.env.GEMINI_API_KEY_3,
    import.meta.env.GEMINI_API_KEY_4,
    import.meta.env.GEMINI_API_KEY_5,
    import.meta.env.GEMINI_API_KEY_6,
    import.meta.env.GEMINI_API_KEY_7,
    import.meta.env.GEMINI_API_KEY_8,
    import.meta.env.GEMINI_API_KEY_9,
    import.meta.env.GEMINI_API_KEY_10,
    import.meta.env.GEMINI_API_KEY_11,
    import.meta.env.GEMINI_API_KEY_12
  ].filter(Boolean).length;

  if (keysCount > 0) {
    let selectedKeyIndex = sessionStorage.getItem('gemini_key_index');
    if (selectedKeyIndex === null) {
      selectedKeyIndex = String(Math.floor(Math.random() * keysCount));
      sessionStorage.setItem('gemini_key_index', selectedKeyIndex);
    }
    document.cookie = `gemini_key_index=${selectedKeyIndex}; path=/; SameSite=Strict`;
  }
}

async function executeWithRetry(modelId, apiCallFn) {
  const keys = [
    import.meta.env.GEMINI_API_KEY,
    import.meta.env.GEMINI_API_KEY_2,
    import.meta.env.GEMINI_API_KEY_3,
    import.meta.env.GEMINI_API_KEY_4,
    import.meta.env.GEMINI_API_KEY_5,
    import.meta.env.GEMINI_API_KEY_6,
    import.meta.env.GEMINI_API_KEY_7,
    import.meta.env.GEMINI_API_KEY_8,
    import.meta.env.GEMINI_API_KEY_9,
    import.meta.env.GEMINI_API_KEY_10,
    import.meta.env.GEMINI_API_KEY_11,
    import.meta.env.GEMINI_API_KEY_12
  ].filter(Boolean);

  if (keys.length === 0) {
    throw new Error('GEMINI_API_KEYs are missing');
  }

  let selectedIndex = 0;
  if (typeof sessionStorage !== 'undefined') {
    const stored = sessionStorage.getItem('gemini_key_index');
    if (stored !== null) {
      selectedIndex = parseInt(stored, 10);
    }
  }

  if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= keys.length) {
    selectedIndex = 0;
  }

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
      const aiClient = new GoogleGenAI({ apiKey });
      return await apiCallFn(aiClient);
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

const hasKeys = !!(
  import.meta.env.GEMINI_API_KEY ||
  import.meta.env.GEMINI_API_KEY_2 ||
  import.meta.env.GEMINI_API_KEY_3 ||
  import.meta.env.GEMINI_API_KEY_4 ||
  import.meta.env.GEMINI_API_KEY_5 ||
  import.meta.env.GEMINI_API_KEY_6 ||
  import.meta.env.GEMINI_API_KEY_7 ||
  import.meta.env.GEMINI_API_KEY_8 ||
  import.meta.env.GEMINI_API_KEY_9 ||
  import.meta.env.GEMINI_API_KEY_10 ||
  import.meta.env.GEMINI_API_KEY_11 ||
  import.meta.env.GEMINI_API_KEY_12
);

function extractCompleteObjects(jsonStr) {
  const objects = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let objStart = -1;

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr.charAt(i);

    if (escape) {
      escape = false;
      continue;
    }

    if (inString) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try {
          objects.push(JSON.parse(jsonStr.substring(objStart, i + 1)));
        } catch {
          // ignore incomplete JSON blocks
        }
        objStart = -1;
      }
    }
  }

  return objects;
}


/**
 * Read an SSE stream from a fetch Response and invoke onQuestion for each
 * complete question object that arrives.
 * Returns a promise that resolves with the full array of questions.
 */
async function readSSEStream(response, onQuestion) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const questions = [];

  while (true) {
    const { done, value } = await reader.read();

    if (value) {
      buffer += decoder.decode(value, { stream: !done });

      // Split on double-newlines to isolate complete SSE frames
      const frames = buffer.split('\n\n');
      buffer = frames.pop(); // keep any trailing incomplete frame

      for (const frame of frames) {
        const trimmed = frame.trim();
        if (!trimmed.startsWith('data:')) continue;

        try {
          const colonIdx = trimmed.indexOf(':');
          const jsonPayload = trimmed.slice(colonIdx + 1).trim();
          const event = JSON.parse(jsonPayload);

          if (event.type === 'question' && event.data) {
            questions.push(event.data);
            if (onQuestion) onQuestion(event.data, questions.length - 1);
          }
        } catch {
        }
      }
    }

    if (done) {
      // Process any remaining buffer content
      if (buffer.trim()) {
        const frames = buffer.split('\n\n');
        for (const frame of frames) {
          const trimmed = frame.trim();
          if (!trimmed.startsWith('data:')) continue;
          try {
            const colonIdx = trimmed.indexOf(':');
            const jsonPayload = trimmed.slice(colonIdx + 1).trim();
            const event = JSON.parse(jsonPayload);
            if (event.type === 'question' && event.data) {
              questions.push(event.data);
              if (onQuestion) onQuestion(event.data, questions.length - 1);
            }
          } catch {}
        }
      }
      break;
    }
  }

  return questions;
}

/**
 * Generate exam problems.
 *
 * @param {number}   count
 * @param {number}   difficulty
 * @param {string}   subject
 * @param {string}   username
 * @param {function} onQuestion - optional callback (questionObj, index) invoked
 *                                for each question the moment it fully arrives.
 * @returns {Promise<Array>} Resolves with the complete array of question objects.
 */
export async function generateProblems(count, difficulty, subject = "Math", username = "default_user", onQuestion = null, freeResponseMode = false, examFormat = 'mix', lessonTitle = null, lessonDescription = null, topics = '', assignmentId = null) {
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        count,
        difficulty,
        subject,
        targetUserId: username,
        freeResponseMode,
        examFormat,
        lessonTitle,
        lessonDescription,
        topics,
        assignmentId
      }),
    });

    if (!response.ok) {
      console.warn(`Vercel API returned status ${response.status}.`);
      if (response.status === 504) {
        throw new Error("Timeout");
      }
      throw new Error(`API call failed with status ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream')) {
      // SSE streaming path
      const wrappedOnQuestion = onQuestion
        ? (q, idx) => {
          if (idx < count) {
            onQuestion(q, idx);
          }
        }
        : null;
      const resQuestions = await readSSEStream(response, wrappedOnQuestion);
      return resQuestions.slice(0, count);
    } else {
      // Legacy non-streaming JSON fallback
      const data = await response.json();
      const questions = (Array.isArray(data) ? data : [data]).slice(0, count);
      if (onQuestion) questions.forEach((q, i) => onQuestion(q, i));
      return questions;
    }
  } catch (error) {
    console.error("Failed to connect to API:", error);
    // Fallback for missing API key or network error to allow UI testing
    console.warn("Using fallback mock data due to API failure.");
    const mockProblems = [];
    for (let i = 0; i < count; i++) {
      const offset = (i % 5) - 2; // yields -2, -1, 0, 1, 2
      const diff = Math.min(10, Math.max(0, difficulty + offset));
      const format = examFormat || (freeResponseMode ? 'free_response' : 'mix');

      if (format === 'free_response' || (format === 'mix' && i % 3 === 2)) {
        mockProblems.push({
          id: `${Date.now()}-${i}`,
          question: `Mock ${subject} FRQ Problem ${i + 1} (Difficulty: ${diff}): Explain and solve for $x$ in the equation ${diff}x + ${i + 1} = ${diff * 2 + i + 1}$.`,
          type: "free_response",
          answer: `Subtract ${i + 1} from both sides to get ${diff}x = ${diff * 2}$. Then divide by ${diff}$ to get $x = 2$.`,
          difficulty: diff
        });
      } else if (format === 'multiple_choice' || (format === 'mix' && i % 3 === 0)) {
        mockProblems.push({
          id: `${Date.now()}-${i}`,
          question: `Mock ${subject} MCQ Problem ${i + 1} (Difficulty: ${diff}): What is ${i + 1} + ${diff}?`,
          type: "multiple_choice",
          options: [`${i + 1 + diff}`, `${i + 2 + diff}`, `${i + 3 + diff}`, `${i + 4 + diff}`],
          answer: `${i + 1 + diff}`,
          difficulty: diff
        });
      } else {
        mockProblems.push({
          id: `${Date.now()}-${i}`,
          question: `Mock ${subject} Short Answer Problem ${i + 1} (Difficulty: ${diff}): What is ${i + 1} + ${diff}?`,
          type: "short_answer",
          answer: `${i + 1 + diff}`,
          difficulty: diff
        });
      }
    }
    if (onQuestion) mockProblems.forEach((q, i) => onQuestion(q, i));
    return mockProblems;
  }
}
