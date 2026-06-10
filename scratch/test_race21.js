// Actually, why did the user say "once the bot returns question 5"?
// If the LLM generates the 5th question, `extractCompleteObjects` might find it!
// Let's look at `api/generate.js` again.
/*
        // Emit any newly completed questions
        while (questionsSent < parsed.length) {
          if (questionsSent < remainingCount) {
            res.write(`data: ${JSON.stringify({ type: 'question', data: parsed[questionsSent] })}\n\n`);
          }
          questionsSent++;
        }
*/
// If `remainingCount` is 5.
// `parsed` gets 5 items.
// `questionsSent` goes 0, 1, 2, 3, 4.
// All 5 items are sent!
// IF THEY ARE SENT, why does ExamScreen say "loading q5"?
// Let's check `readSSEStream` again:
/*
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
*/
// IF the very last chunk from the server is `data: {"type":"question", ...}\n\ndata: {"type":"done"}\n\n`
// Then it splits on `\n\n`.
// `frames` = `['data: {"type":"question", ...}', 'data: {"type":"done"}', '']`
// `buffer = frames.pop()` -> `buffer = ''`.
// It processes both frames.
// `questions` gets pushed.
// Everything is fine.

// WHAT IF `done` IS RETURNED SIMULTANEOUSLY WITH THE LAST CHUNK?
// i.e., `const { done, value } = await reader.read();`
// `done` is true, AND `value` contains `data: {"type":"question", ...}\n\n`
// The loop `if (done) break;` executes!
// `value` is ignored!
// `questions` never gets the 5th question!
// THIS IS A VERY COMMON BUG WITH STREAMS!
// `if (done) break;` ignores the final `value`!
