// Ah. Wait!
// `pregeneratedQuestion` is null. It's disabled!
// So `remainingCount` is `count`, which is 5.
// The LLM is generating all 5 questions.
// So `extractCompleteObjects` handles all 5 questions.
// Wait! If the LLM generates all 5 questions, let's look at `extractCompleteObjects` output.

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

// In the streaming API, `stream` gives chunks.
// `Text` is appended to `accumulated`.
// What if the VERY LAST closing brace `}` is received in the final chunk, BUT...
// wait, does Gemini always output standard JSON?
// The prompt says: "Output ONLY the valid JSON array starting with `[`."
// What if the model outputs something like:
/*
[
  { "id": 1 },
  { "id": 2 },
  { "id": 3 },
  { "id": 4 },
  { "id": 5 }
]
*/
// And the stream ends.
// `extractCompleteObjects` will successfully parse 5 objects!
// What if the model outputs markdown backticks?
// ` ```json\n [ ... ] \n``` `
// The trailing backticks won't affect the JSON parsing because `extractCompleteObjects` only looks for `{` and `}`!
// So it will parse 5 objects.

// WHY WOULD IT STOP AT 4?
// User said: "once the bot returns question 5, q5 is not loaded into the background automatically"
// This IMPLIES: The Bot DOES generate Q5! But it's NOT loaded "into the background automatically".
// Wait. "Not loaded into the background automatically" -> What does "background automatically" mean?
// It means the state `problems` array!
// If the LLM generated 5 objects, `readSSEStream` handles 5 events.
// The `onQuestion` updates `problems`.

// Is there a bug in ExamScreen's `onQuestion` logic?
