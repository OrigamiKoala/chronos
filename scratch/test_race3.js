// If an error is caught in `generateProblems`, it logs "Using fallback mock data due to API failure."
// And generates 5 mock problems.
// `if (onQuestion) mockProblems.forEach((q, i) => onQuestion(q, i));`
// It instantly calls `onQuestion` for all 5.
// So this doesn't fit the "starts streaming in, stops at question 4, then returns question 5" description.

// "Then, once the bot returns question 5, q5 is not loaded into the background automatically"
// Could this mean that the LLM streaming paused/took a long time?
// If it takes a long time, the UI should show the loading screen for q5 IF the user clicks NEXT quickly!
// The user hits Next on q4, sees "Loading next question... Streaming question 5 of 5".
// BUT when q5 FINALLY streams in, the UI DOES NOT UPDATE to show q5!
// Why wouldn't the UI update when q5 streams in?

// Let's look at `ExamScreen.jsx` again.
/*
        (question, index) => {
          if (index < aiCount) {
            setProblems(prev => {
              if (prev.length >= totalCount) return prev;
              return [...prev, question];
            });
          }
*/
// Does this update the `problem` variable?
// `const problem = problems[currentQuestionIndex];`
// Yes, when `problems` changes, the component re-renders, `problem` becomes defined, and the "Loading next question" screen disappears.

// BUT wait!
// What if `extractCompleteObjects` fails to extract the 5th object because the JSON string stream didn't add it correctly?
// In `api/generate.js`:
// `accumulated += text;`
// The LLM writes the JSON.
// What if the LLM output ends WITHOUT a closing `]`?
// Wait, the Prompt says "Output ONLY the valid JSON array starting with `[`."
// What if the model outputs:
/*
[
  { "id": 1 },
  { "id": 2 },
  { "id": 3 },
  { "id": 4 },
  { "id": 5 }
]
*/
// As `chunk.text` streams in, `accumulated` grows.
// `extractCompleteObjects` parses objects when it sees `}`.
// So when the 5th object's closing `}` arrives, `extractCompleteObjects` extracts it!
// It pushes it to `parsed` array.
// It SHOULD emit it immediately!

// EXCEPT: what if `extractCompleteObjects` only extracts 4 objects?
// Why would it only extract 4 objects?
