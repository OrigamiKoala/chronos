// In ExamScreen.jsx:
/*
        (question, index) => {
          if (index < aiCount) {
            setProblems(prev => {
              if (prev.length >= totalCount) return prev;
              return [...prev, question];
            });
          }
*/

// What if totalCount is 5.
// aiCount is 5.
// The pregenerated question is emitted as `index` 0.
// Then the 4 LLM questions are emitted.
// But wait! Look at the API side:
/*
    let remainingCount = count; // 5
    if (pregeneratedQuestion) {
      res.write(`data: ${JSON.stringify({ type: 'question', data: pregeneratedQuestion })}\n\n`);
      remainingCount = count - 1; // 4
    }
*/

// Then Gemini stream loop runs:
/*
        // Emit any newly completed questions
        while (questionsSent < parsed.length) {
          if (questionsSent < remainingCount) {
            res.write(`data: ${JSON.stringify({ type: 'question', data: parsed[questionsSent] })}\n\n`);
          }
          questionsSent++;
        }
*/
// The Gemini prompt is: "Generate exactly 4 problems."
// So the LLM generates 4 problems!
// parsed.length will be 4.
// It will emit exactly 4 LLM questions.

// Wait. If it emits 1 pregenerated + 4 LLM = 5 total questions.
// In `src/services/gemini.js`:
// It reads the stream, receives 5 'question' events.
// It pushes them to `questions` array.
// For the 1st event (pregenerated): `questions.length - 1` is 0.
// `onQuestion(q, 0)` is called.
// For the 2nd event (LLM #1): `questions.length - 1` is 1.
// `onQuestion(q, 1)` is called.
// For the 3rd event (LLM #2): `questions.length - 1` is 2.
// `onQuestion(q, 2)` is called.
// For the 4th event (LLM #3): `questions.length - 1` is 3.
// `onQuestion(q, 3)` is called.
// For the 5th event (LLM #4): `questions.length - 1` is 4.
// `onQuestion(q, 4)` is called.

// ALL 5 ARE EMITTED AND RECEIVED!
// And `prev.length` goes from 0 to 5.
// So `problems` ends up with 5 items during streaming.
// Wait, is there a race condition?
// `setProblems(prev => [...prev, question])`
// This uses the functional form, so it safely queues updates!

// IS THERE A PROBLEM WITH `totalCount`?
// `if (prev.length >= totalCount) return prev;`
// 0 >= 5 (false) -> [q1]
// 1 >= 5 (false) -> [q1, q2]
// 2 >= 5 (false) -> [q1, q2, q3]
// 3 >= 5 (false) -> [q1, q2, q3, q4]
// 4 >= 5 (false) -> [q1, q2, q3, q4, q5]

// THIS IS CORRECT!

// Then why "stops at question 4... once the bot returns question 5... not loaded into the background automatically"?
