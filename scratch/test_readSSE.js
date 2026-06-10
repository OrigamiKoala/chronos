// If `readSSEStream` breaks out of the loop and there's still a trailing `done` event in `buffer`.
// buffer = frames.pop(); leaves the last frame (which might not end in '\n\n') in `buffer`.
// When `done` is true, it breaks `while(true)`.
// It RETURNS `questions`!
// It completely IGNORES anything left in `buffer`!

// In `api/generate.js`:
// res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
// res.end();

// The `done` event ends with `\n\n`. So `frames.pop()` might be an empty string if there's no trailing data.
// But what if the LAST question was sent without a `\n\n` somehow? No, `res.write` always does `\n\n`.

// BUT WHAT IF `done` is TRUE but `value` has the LAST chunk?
// Node `TextDecoder.decode(value, {stream: true})`
// If `done` is true, the `value` is undefined in fetch body reader.

async function mock() {
  const chunks = [
    "data: {\"type\":\"question\",\"data\":{\"id\":1}}\n\n",
    "data: {\"type\":\"question\",\"data\":{\"id\":2}}\n\n",
    "data: {\"type\":\"question\",\"data\":{\"id\":3}}\n\n",
    "data: {\"type\":\"question\",\"data\":{\"id\":4}}\n\ndata: {\"type\":\"question\",\"data\":{\"id\":5}}\n\n"
  ];
  let i = 0;
  const reader = {
    read: async () => {
      if (i < chunks.length) {
        return { done: false, value: Buffer.from(chunks[i++]) };
      }
      return { done: true, value: undefined };
    }
  };

  const decoder = new TextDecoder();
  let buffer = '';
  const questions = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split('\n\n');
    buffer = frames.pop();

    for (const frame of frames) {
      const trimmed = frame.trim();
      if (!trimmed.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(trimmed.slice(6));
        if (event.type === 'question' && event.data) {
          questions.push(event.data);
          console.log(`Pushed:`, event.data.id);
        }
      } catch (e) { }
    }
  }

  // Handle any remaining data in the buffer after the stream closes
  if (buffer.trim()) {
    const trimmed = buffer.trim();
    if (trimmed.startsWith('data: ')) {
      try {
        const event = JSON.parse(trimmed.slice(6));
        if (event.type === 'question' && event.data) {
          questions.push(event.data);
          console.log(`Pushed from buffer:`, event.data.id);
        }
      } catch (e) { }
    }
  }

  console.log("Total questions:", questions.length);
}

mock();
