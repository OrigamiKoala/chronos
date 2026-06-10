// Is it possible `readSSEStream` does NOT call `onQuestion` for the 5th item?
// Look at `readSSEStream` AGAIN:
/*
      try {
        const event = JSON.parse(trimmed.slice(6));

        if (event.type === 'question' && event.data) {
          questions.push(event.data);
          if (onQuestion) onQuestion(event.data, questions.length - 1);
        }
      } catch {
      }
*/
// This loop processes all frames.
// BUT WAIT!
// `buffer = frames.pop(); // keep any trailing incomplete frame`
// When `done` becomes true, it BREAKS out of the loop:
/*
    const { done, value } = await reader.read();
    if (done) break;
*/
// IF the very last chunk contains `done: true` AND `value` is `undefined`, it breaks!
// WHAT HAPPENS TO THE LAST FRAME IN `buffer`???
// It's NEVER PROCESSED!
// If the 5th question's SSE event was NOT fully separated by `\n\n` in the previous chunk, or if it was the last chunk and didn't have a trailing `\n\n`?
// In `api/generate.js`:
/*
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
*/
// The final chunk will contain `data: {"type":"done"}\n\n`.
// It DOES have a trailing `\n\n`.
// So `frames.pop()` will be an empty string `""`.
// So the 5th question AND the `done` event will be in `frames` and processed!

// Wait... What if the `TextDecoder` doesn't output anything on the last `reader.read()` where `done` is true?
// That's correct, `value` is undefined, it breaks, and the remaining `buffer` is discarded!
// What if `value` had some bytes but `done` was true simultaneously?
// In Node.js/browser fetch, `done: true` usually comes with `value: undefined`.
// But occasionally, the last chunk can be returned WITH `done: true`.
// Wait, if `done: true` breaks BEFORE `buffer += decoder.decode(value, {stream: true})`, then `value` is LOST!
/*
    const { done, value } = await reader.read();
    if (done) break;
*/
// If `value` is defined, we lose it!
