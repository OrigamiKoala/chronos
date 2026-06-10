import fs from 'fs';

let content = fs.readFileSync('src/services/gemini.js', 'utf8');

const oldCode = `  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Split on double-newlines to isolate complete SSE frames
    const frames = buffer.split('\\n\\n');
    buffer = frames.pop(); // keep any trailing incomplete frame

    for (const frame of frames) {
      const trimmed = frame.trim();
      if (!trimmed.startsWith('data: ')) continue;

      try {
        const event = JSON.parse(trimmed.slice(6));

        if (event.type === 'question' && event.data) {
          questions.push(event.data);
          if (onQuestion) onQuestion(event.data, questions.length - 1);
        }
        // 'done' and 'error' events are handled implicitly by the loop ending
      } catch {
        // skip malformed SSE event
      }
    }
  }`;

const newCode = `  while (true) {
    const { done, value } = await reader.read();

    if (value) {
      buffer += decoder.decode(value, { stream: !done });

      // Split on double-newlines to isolate complete SSE frames
      const frames = buffer.split('\\n\\n');
      buffer = frames.pop(); // keep any trailing incomplete frame

      for (const frame of frames) {
        const trimmed = frame.trim();
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const event = JSON.parse(trimmed.slice(6));

          if (event.type === 'question' && event.data) {
            questions.push(event.data);
            if (onQuestion) onQuestion(event.data, questions.length - 1);
          }
        } catch {
        }
      }
    }

    if (done) {
      // Process any remaining buffer content
      if (buffer.trim()) {
        const frames = buffer.split('\\n\\n');
        for (const frame of frames) {
          const trimmed = frame.trim();
          if (!trimmed.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(trimmed.slice(6));
            if (event.type === 'question' && event.data) {
              questions.push(event.data);
              if (onQuestion) onQuestion(event.data, questions.length - 1);
            }
          } catch {}
        }
      }
      break;
    }
  }`;

fs.writeFileSync('src/services/gemini.js', content.replace(oldCode, newCode));
console.log("Patched src/services/gemini.js");
