// Okay, let's fix the buffer processing in `readSSEStream`.
// If `done` is true, the loop breaks BEFORE processing any remaining text in `buffer`.
// Usually, the last chunk ends with `\n\n`, so `buffer` is empty.
// BUT what if the final chunk contains `{"type":"question"}` and `{"type":"done"}` with trailing newlines, but somehow is parsed such that the last `value` doesn't end neatly?
// Wait, no. If `done` is true, we should still process the buffer.
/*
  while (true) {
    const { done, value } = await reader.read();

    if (value) {
        buffer += decoder.decode(value, { stream: !done });
        const frames = buffer.split('\n\n');
        buffer = frames.pop();

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
        if (buffer.trim()) {
           // process remaining buffer just in case
        }
        break;
    }
  }
*/
// This is much safer.
