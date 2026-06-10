// WAIT! I JUST FOUND IT.
// "Then, once the bot returns question 5, q5 is not loaded into the background automatically - when I hit next on q4 there is still a screen that says it is loading q5."

// Look at the API `generate.js`!
/*
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        accumulated += text;

        // Extract all fully-formed question objects so far
        const parsed = extractCompleteObjects(accumulated);

        // Emit any newly completed questions
        while (questionsSent < parsed.length) {
          if (questionsSent < remainingCount) {
            res.write(`data: ${JSON.stringify({ type: 'question', data: parsed[questionsSent] })}\n\n`);
          }
          questionsSent++;
        }
      }
    }
*/

// If the bot returns the stream output chunk by chunk.
// It parses it.
// WHAT IF Gemini generates text AFTER the 5th question?
// Usually, the array `]` is the last thing.
// `extractCompleteObjects` finds `{ ... }` and parses it when `depth === 0`.
// It finds the 5th question when the LAST `}` arrives in the stream.
// If the stream ends EXACTLY after `}`, it is parsed.

// BUT wait!
// What if `extractCompleteObjects` has a bug?
// When `jsonStr.charAt(i)` is `}`, `depth` becomes 0.
// `objects.push(JSON.parse(...))`
// It parses the object.
// BUT is `extractCompleteObjects` run one last time at the very end of the stream?
// YES, because the loop processes every chunk. The last chunk contains `}`.

// Let's reconsider the user's report:
// "when I ask for five questions, and they start streaming in, it stops at question 4. Then, once the bot returns question 5, q5 is not loaded into the background automatically"

// "Then, once the bot returns question 5"
// Could "the bot" refer to the LEGACY FALLBACK?
// If the API request fails or errors out AFTER 4 questions have been streamed?
// If it errors out after 4 questions, `generate.js` would write `{"type": "error"}` to the stream and `res.end()`.
// Then the frontend sees `type: "error"`.
// Wait, the frontend `readSSEStream` ignores `error` events!
/*
        if (event.type === 'question' && event.data) {
          questions.push(event.data);
          if (onQuestion) onQuestion(event.data, questions.length - 1);
        }
        // 'done' and 'error' events are handled implicitly by the loop ending
*/
// And then it returns the array of 4 questions.
// AND `generateProblems` returns `resQuestions.slice(0, count)`. It returns 4 questions.
// So `generated` has 4 questions.
// This doesn't explain "once the bot returns question 5".

// "once the bot returns question 5"
// Maybe "the bot" means the LLM stream?
// It "starts streaming in" (q1, q2, q3, q4). "stops at question 4".
// "Then, once the bot returns question 5"
// Maybe it takes a long time to generate question 5?
// YES! Gemini might be slow.
// If Gemini is slow, the stream pauses at question 4.
// The user hits Next on Q4. They see "Loading next question..."
// Then Gemini FINISHES generating Q5, and sends the chunk with Q5.
// THE BACKEND PARSES IT AND SENDS IT VIA SSE.
// The frontend `readSSEStream` parses it and calls `onQuestion(event.data, 4)`.
