/* eslint-disable */

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
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Split on double-newlines to isolate complete SSE frames
    const frames = buffer.split('\n\n');
    buffer = frames.pop(); // keep any trailing incomplete frame

    for (const frame of frames) {
      const trimmed = frame.trim();
      if (!trimmed.startsWith('data: ')) continue;

      try {
        const event = JSON.parse(trimmed.slice(6));

        if (event.type === 'question' && event.data) {
          questions.push(event.data);
          if (onQuestion) onQuestion(event.data, questions.length - 1);
        }
        // 'done' and 'error' events are handled implicitly by the loop ending
      } catch {
        // skip malformed SSE event
      }
    }
  }

  return questions;
}

/**
 * Generate exam problems.
 *
 * @param {number}   count
 * @param {number}   startingDifficulty
 * @param {string}   subject
 * @param {string}   username
 * @param {function} onQuestion - optional callback (questionObj, index) invoked
 *                                for each question the moment it fully arrives.
 * @returns {Promise<Array>} Resolves with the complete array of question objects.
 */
export async function generateProblems(count, startingDifficulty, subject = "Math", username = "default_user", onQuestion = null, freeResponseMode = false, examFormat = 'mix', lessonTitle = null, lessonDescription = null, topics = '') {
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        count,
        startingDifficulty,
        subject,
        targetUserId: username,
        freeResponseMode,
        examFormat,
        lessonTitle,
        lessonDescription,
        topics
      }),
    });

    if (!response.ok) {
      console.warn(`Vercel API returned status ${response.status}.`);
      throw new Error("API call failed");
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
      const diff = Math.min(10, Math.max(1, startingDifficulty + (i % 2 === 0 ? 1 : -1) * Math.floor(i / 2)));
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
