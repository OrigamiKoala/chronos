// Wait! Look at `readSSEStream` again:
// It collects all `event.data` and returns `questions`.
// And `generateProblems` returns `resQuestions.slice(0, count)`.
// If `questions.length` is 4, it returns an array of length 4.
// If it's an array of length 4, `[...shared, ...generated].slice(0, 5)` returns an array of length 4.
// And `problems` has length 4!
// Then `currentQuestionIndex` becomes 4.
// `problem` = `problems[4]` = `undefined`.
// THIS MATCHES THE SYMPTOMS EXACTLY!

// So `questions.length` MUST BE 4!
// Why is `questions.length` 4?
// Because `readSSEStream` only received 4 'question' events.
// Why did it only receive 4 'question' events?
// Because the API only sent 4 'question' events.
// Why did the API only send 4 'question' events?
// Let's look at `api/generate.js`:
/*
        while (questionsSent < parsed.length) {
          if (questionsSent < remainingCount) {
            res.write(`data: ${JSON.stringify({ type: 'question', data: parsed[questionsSent] })}\n\n`);
          }
          questionsSent++;
        }
*/
// If `remainingCount` is 5 (because pregeneratedQuestion is null/disabled), it sends up to 5 questions.
// If it only sent 4, `parsed.length` must be 4.
// Why is `parsed.length` 4?
// Because the LLM only generated 4 questions!
// WHY did the LLM only generate 4 questions?
// Wait. "once the bot returns question 5, q5 is not loaded into the background automatically".
// The user says "once the bot returns question 5".
// If the LLM generates the 5th question AFTER a long pause?
// NO!
