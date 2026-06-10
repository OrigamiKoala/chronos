// If `done` is true, AND `value` is defined, `if (done) break` will cause it to be dropped.
// This is exactly why "the bot returns question 5, [but] q5 is not loaded into the background".
// Because the stream API (`api/generate.js`) wrote the 5th question and `res.end()` in rapid succession!
// `api/generate.js`:
/*
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
*/
// The final chunk contains the 5th question, the `done` event, AND the connection closes!
// In the browser, `fetch` reader might return `done: true` WITH `value` containing the final chunk!
// If `if (done) break;` is evaluated BEFORE processing `value`, the ENTIRE FINAL CHUNK IS DROPPED!
// This means the 5th question is never parsed!

// BUT WAIT! Does the browser `reader.read()` return `done: true` AND `value` at the same time?
// Usually, `done: true` comes with `value: undefined`.
// However, the specification allows `value` to be present when `done` is true in some stream implementations.

// And even if it doesn't, what if the 5th question wasn't followed by `\n\n` in `buffer`?
// If `buffer` has leftover data when `done` is true, it is ignored because we break out!

// So the fix is:
/*
    const { done, value } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split('\n\n');
      buffer = frames.pop();

      for (const frame of frames) {
        ...
      }
    }
    if (done) {
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const event = JSON.parse(trimmed.slice(6));
            if (event.type === 'question' && event.data) {
              questions.push(event.data);
              if (onQuestion) onQuestion(event.data, questions.length - 1);
            }
          } catch { }
        }
      }
      break;
    }
*/

// AND there's ANOTHER bug!
// Look at `ExamScreen.jsx` again!
/*
      if (generated && generated.length > 0) {
        setProblems(prev => {
          const shared = prev.slice(0, sharedQuestions.length);
          return [...shared, ...generated].slice(0, totalCount);
        });
      }
*/
// If `generated` DOES have length 5 (maybe because `resQuestions` was 5), it will update `problems`.
// But if `generated` only has length 4, `problems` stays length 4!

// Wait, the user said: "Then, once the bot returns question 5, q5 is not loaded into the background automatically".
// If the stream completes, `generateProblems` resolves.
// IF the last chunk had question 5, and it was LOST because of `done: true` or left in `buffer`.
// Then `generated` has length 4!
// Then `setProblems` sets `problems` to length 4.
// AND the user sees "Loading next question..." FOREVER!

// So fixing `readSSEStream` should fix this perfectly!
