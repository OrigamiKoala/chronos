// If `done` is true, we break.
// Wait! IF there is anything left in `buffer` when `done` is true, it is discarded!
// "buffer = frames.pop(); // keep any trailing incomplete frame"
// If the very last SSE event doesn't end with '\n\n', `frames.pop()` sets `buffer` to the event!
// And then the loop breaks.
// AND WE RETURN `questions`!
// WE LOSE THE LAST EVENT!
// But wait, the API writes:
/*
res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
*/
// It DOES end with '\n\n'. So `buffer` is empty.
// What about the LAST QUESTION?
// The last question is sent like this:
/*
res.write(`data: ${JSON.stringify({ type: 'question', data: parsed[questionsSent] })}\n\n`);
*/
// That ALSO ends with `\n\n`.
// So it is processed in the same iteration! `frames.pop()` is empty string.

// Let's go back to `ExamScreen.jsx` logic for `onQuestion`:
/*
        (question, index) => {
          if (index < aiCount) {
            setProblems(prev => {
              if (prev.length >= totalCount) return prev;
              return [...prev, question];
            });
          }
*/
// WHAT IF `totalCount` IS NOT 5?
// WHAT IF `totalCount` is 4?
// User said: "when I ask for five questions" -> totalCount IS 5.
// Why would `problems` have 4 items?
// Wait! `setProblems(prev => { if (prev.length >= totalCount) return prev; return [...prev, question]; })`
// What if `index` is NOT `< aiCount`?
// `index` comes from `questions.length - 1` in `readSSEStream`.
// If `readSSEStream` pushed 5 items, index is 4.
// `aiCount` is 5. 4 < 5 is true.

// Wait. Look at the `fetchProblems` finally block again.
/*
    } catch (err) {
      ...
    } finally {
      setLoading(false);
    }
*/
// Does this mean the promise resolves and `finally` runs?
// When `generateProblems` finishes, it returns `generated` which is an array of size 5.
/*
      if (generated && generated.length > 0) {
        setProblems(prev => {
          const shared = prev.slice(0, sharedQuestions.length);
          return [...shared, ...generated].slice(0, totalCount);
        });
      }
*/
// If `generated` has length 5, `problems` is updated to have 5 questions!
// AND THEN `setLoading(false)`!
// SO `problems` DOES have 5 questions!
// THEN WHY does the UI say "loading q5"?
// "when I hit next on q4 there is still a screen that says it is loading q5."
// If the screen says "Loading next question...", it means `problem` is falsy.
// `problem = problems[4]`.
// If `problems` has 5 items, `problems[4]` CANNOT BE FALSY!
// Unless the 5th item is `undefined`?!
// Why would `generated[4]` be undefined?
