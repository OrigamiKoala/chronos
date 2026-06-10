// WAIT. What if `extractCompleteObjects` DOES parse 5 questions.
// BUT `generateProblems` doesn't return them properly?

// Look at `extractCompleteObjects` again.
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
        }
        objStart = -1;
      }
    }
  }

  return objects;
}
// This works.

// What if the frontend uses `fetchProblems` asynchronously, and there's a React state update queue issue?
/*
        (question, index) => {
          if (index < aiCount) {
            setProblems(prev => {
              if (prev.length >= totalCount) return prev;
              return [...prev, question];
            });
          }
*/
// This adds to `problems`.
// But wait!
// What if `index` parameter is WRONG?
// In `readSSEStream`:
// `questions.push(event.data);`
// `if (onQuestion) onQuestion(event.data, questions.length - 1);`
// It pushes, then gets the length - 1. So it's 0, 1, 2, 3, 4.

// Wait. The user says: "it stops at question 4. Then, once the bot returns question 5, q5 is not loaded into the background automatically"
// IF the bot returns question 5, the frontend's `readSSEStream` MUST process it!
// What if `onQuestion` is NOT called for question 5?
// In `gemini.js`:
/*
      const wrappedOnQuestion = onQuestion
        ? (q, idx) => {
          if (idx < count) {
            onQuestion(q, idx);
          }
        }
        : null;
*/
// If `idx` is 4, and `count` is 5.
// 4 < 5 is true. It calls `onQuestion`.
// What if `idx` is 5? (i.e. the 6th question). It doesn't call it.

// Ah! What if `pregeneratedQuestion` was enabled before?
// No, the memory says "pregeneratedQuestion disabled by user instruction".
// Wait, the memory says "The AI generation process utilizes a `pregenerated_questions` table in Google BigQuery to cache questions and improve Time-To-First-Byte (TTFB) performance."
// Wait, `api/generate.js`:
/*
    // 1b. Fetch 1 pregenerated question disabled by user instruction
    let pregeneratedQuestion = null;
*/
// If it's `null`, it's not being used!
