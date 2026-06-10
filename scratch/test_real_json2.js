// Is there a bug with `readSSEStream` parsing the SSE events?
// In src/services/gemini.js:

async function testReadSSE() {
  const bufferChunks = [
    "data: {\"type\":\"question\",\"data\":{\"id\":1}}\n\n",
    "data: {\"type\":\"question\",\"data\":{\"id\":2}}\n\n",
    "data: {\"type\":\"question\",\"data\":{\"id\":3}}\n\n",
    "data: {\"type\":\"question\",\"data\":{\"id\":4}}\n\n",
    "data: {\"type\":\"question\",\"data\":{\"id\":5}}\n\n",
    "data: {\"type\":\"done\"}\n\n"
  ];

  let buffer = '';
  const questions = [];

  for (const value of bufferChunks) {
    buffer += value;

    const frames = buffer.split('\n\n');
    buffer = frames.pop(); // keep any trailing incomplete frame

    for (const frame of frames) {
      const trimmed = frame.trim();
      if (!trimmed.startsWith('data: ')) continue;

      try {
        const event = JSON.parse(trimmed.slice(6));

        if (event.type === 'question' && event.data) {
          questions.push(event.data);
          console.log(`Parsed question! length=${questions.length}`);
        }
      } catch (e) {
      }
    }
  }

  // WHAT HAPPENS AT THE END OF THE LOOP IN `readSSEStream`?
  // `buffer` might contain the last frame IF it didn't end with '\n\n'.
  // BUT the API explicitly writes:
  // res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  // So it ends with '\n\n'. The last split frame will be empty, and `buffer = ''`.

  console.log("Final questions length:", questions.length);
}

testReadSSE();
