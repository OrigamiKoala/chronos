// Wait! What if the LAST event doesn't get processed because it's in the final chunk, and it has NO trailing `\n\n`?
// In `api/generate.js`:
/*
    for await (const chunk of stream) {
      ...
        while (questionsSent < parsed.length) {
          if (questionsSent < remainingCount) {
            res.write(`data: ${JSON.stringify({ type: 'question', data: parsed[questionsSent] })}\n\n`);
          }
          questionsSent++;
        }
      ...
    }
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
*/
// It always has `\n\n`.

// IF the LLM ONLY generates 4 questions instead of 5?
// Why would the LLM generate only 4 questions when `prompt` says "Generate exactly 5 problems"?
// Gemini 1.5 Flash has a maximum output token limit.
// A typical question with `thoughtProcess`, math rendering, options, etc. can be long.
// If it takes 1500 tokens per question, 5 questions = 7500 tokens.
// Gemini 1.5 Flash might stop at 8k tokens.
// If the stream ends prematurely due to MAX_TOKENS, `extractCompleteObjects` might only find 4 fully formed objects!
// If the stream ends early, `stream` loop ends.
// We write `done`.
// And the frontend gets 4 questions.

// BUT wait! In api/generate.js:
// `const parsed = extractCompleteObjects(accumulated);`
// If it stops mid-way through the 5th object, `parsed.length` is 4.
// `questionsSent` is 4.
// `remainingCount` is 5.
// We write `done` and `res.end()`.
// The frontend receives 4 questions and `done`.
// `resQuestions` length is 4.
// `resQuestions.slice(0, 5)` returns array of 4.
// AND THEN ExamScreen.jsx:
/*
      if (generated && generated.length > 0) {
        setProblems(prev => {
          const shared = prev.slice(0, sharedQuestions.length);
          return [...shared, ...generated].slice(0, totalCount);
        });
      }
*/
// `generated` has length 4.
// `totalCount` is 5.
// `prev` becomes length 4!
// `setLoading(false)`
// And `problems` has length 4 forever.

// If the LLM output was truncated, `generated.length` will be less than `aiCount`.
// AND the user experiences: "it stops at question 4... screen says it is loading q5."

// WAIT, the user explicitly said:
// "Then, once the bot returns question 5, q5 is not loaded into the background automatically - when I hit next on q4 there is still a screen that says it is loading q5"

// "once the bot returns question 5" !!!
// This means the LLM DID return question 5!
// Wait. How does the user KNOW the bot returned question 5?
// "when I ask for five questions, and they start streaming in, it stops at question 4. Then, once the bot returns question 5..."
// Ah! The bot IS streaming. But the UI STOPS UPDATING at question 4!
// WHY would the UI stop updating at question 4?
// Look at ExamScreen.jsx `onQuestion`!
