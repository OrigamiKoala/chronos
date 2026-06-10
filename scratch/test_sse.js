async function mock() {
  const chunks = [
    "data: {\"type\":\"question\",\"data\":{\"id\":1}}\n\n",
    "data: {\"type\":\"question\",\"data\":{\"id\":2}}\n\n",
    "data: {\"type\":\"question\",\"data\":{\"id\":3}}\n\n",
    "data: {\"type\":\"question\",\"data\":{\"id\":4}}\n\n",
    "data: {\"type\":\"question\",\"data\":{\"id\":5}}\n\ndata: {\"type\":\"done\"}\n\n"
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
    buffer = frames.pop(); // keep any trailing incomplete frame

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

  // Handle remaining buffer
  console.log("Buffer at end:", buffer);
}

mock();
