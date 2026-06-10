// Wait! Look at generate.js:
// `let pregeneratedQuestion = null;`
// The LLM generates 5.
// questionsSent: 0 to 4.
// `extractCompleteObjects` pushes questions to `parsed`.
// What if the LLM output is NOT perfectly closed until the very end?
// Example:
// Gemini output:
/*
[
  {
    "id": 1
  },
  {
    "id": 2
  },
  {
    "id": 3
  },
  {
    "id": 4
  },
  {
    "id": 5
  }
]
*/
// The final stream chunk from Gemini is `\n  }\n]`.
// `extractCompleteObjects` sees `}` and parses the 5th object!
// It gets added to `parsed`.
// `while (questionsSent < parsed.length)` executes.
// `res.write` sends question 5!
// AND THEN `stream` loop ends!
// AND THEN `res.write(done)`!
// It should work perfectly!

// SO WHAT IS THE PROBLEM?
// "when I hit next on q4 there is still a screen that says it is loading q5."
// BUT `problems` array DOES get the 5th question AFTER the LLM streaming completes:
/*
      if (generated && generated.length > 0) {
        setProblems(prev => {
          const shared = prev.slice(0, sharedQuestions.length);
          return [...shared, ...generated].slice(0, totalCount);
        });
      }
*/
// If the UI is stuck saying "Loading next question", it means `problem = problems[4]` evaluates to falsy!
// `problems[4]` is falsy ONLY IF `problems` has length 4!
// Why would `problems` have length 4 after `setProblems(..., ...generated)`?
// Because `generated` only has 4 items!
// `generated` comes from `generateProblems` which returns `resQuestions.slice(0, count)`.
// So `resQuestions.length` must be 4!
// WHY WOULD `resQuestions.length` be 4 if we requested 5?

// Ah! What if `readSSEStream` drops the 5th question?
