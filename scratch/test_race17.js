// WAIT! I KNOW WHY `questions` ONLY HAS 4 ITEMS!
// If the very last fetch chunk from the server is `data: {"type":"done"}\n\n`.
// AND the PREVIOUS chunk was the 5th question:
// `data: {"type":"question","data": {...}}\n\n`
// Then it works.

// BUT what if the 5th question AND `done` are sent in the SAME final chunk?
// `data: {"type":"question","data": {...}}\n\ndata: {"type":"done"}\n\n`
// Then `buffer += ...`
// `frames` = `["data: {...}", "data: {\"type\":\"done\"}", ""]`
// `buffer = frames.pop()` -> `buffer = ""`
// `for (const frame of frames)` -> parses both.
// It works!

// BUT what if the 5th question's trailing `\n\n` is NOT in the chunk with the question data?
// What if the 5th question is split across chunks?
// It works.

// What if the FINAL `done` event is sent, and then the stream ends WITHOUT any trailing chunks?
// The `done` event handles it.

// What if Gemini finishes the stream, BUT it throws an error before generating the 5th question?
// The prompt asks for EXACTLY 5 questions.
// If it errors, `generate.js` writes `{"type":"error"}` to the stream and ends it!
// If it ends, `readSSEStream` ignores `error` events.
// It returns an array of 4 questions!
// `generateProblems` resolves with 4 questions!
// `ExamScreen.jsx` sets `problems` to length 4.
// The user hits Next on Q4, and gets stuck on "Loading Q5..." forever!

// WHY WOULD IT ERROR?
// "Then, once the bot returns question 5, q5 is not loaded into the background automatically"
// IF IT ERROR'D, HOW DOES THE BOT "RETURN QUESTION 5"?
// Unless the user is saying: "once the bot returns question 5" meaning that it SEEMS like the request finished (the loading indicator on the browser tab stops, or the stream finishes), BUT q5 is still not there!
// If the user means: "once the generation is complete" -> "once the bot returns [the result for] question 5".

// Is it possible the LLM simply generates an array with 4 items?
// Yes, LLMs often miscount.
// If Gemini is asked to generate exactly 5 problems, it might only generate 4 problems!
// Then the stream completes normally.
// `parsed.length` is 4.
// `questionsSent` is 4.
// `remainingCount` is 5.
// The stream ends. `done` is sent.
// `readSSEStream` returns 4 questions.
// `generateProblems` returns 4 questions.
// `ExamScreen.jsx` sets `problems` to 4 questions.
// The user goes to Q5, and gets stuck on "Loading next question..." FOREVER!

// EXACTLY! LLMs miscounting is extremely common!
// If the LLM generates 4 items instead of 5, the UI gets stuck on the last question!
// The user says "once the bot returns question 5, q5 is not loaded". Maybe they meant "once the bot reaches the point where it should return q5" or "once the request finishes".

// If the problem is that the `problems` array never reaches `totalCount`, the UI waits FOREVER because `!problem` is true for index 4, but `loading` is set to false in the `finally` block!
// Wait! If `loading` is false, `ExamScreen.jsx` handles it!
