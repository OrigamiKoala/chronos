// WAIT. If `setProblems` updates `problems` to length 5.
// Does it trigger a re-render? Yes.
// Does `problem = problems[4]` get evaluated? Yes.
// Is `problem` truthy? Yes, it's the 5th object!
// If `problem` is truthy, then `!problem` is FALSE.
// So the "Loading next question..." UI should disappear!
// BUT the user says it DOES NOT disappear!

// HOW IS IT POSSIBLE that `problem` is falsy?
// 1. `problems` array DOES NOT have 5 items!
// 2. `problems[4]` IS `undefined`!
// 3. `currentQuestionIndex` is somehow 5? No, user says "when I hit next on q4 there is still a screen that says it is loading q5."
// If q4 is index 3, next makes index 4. `problems[4]` is the 5th question.

// So `problems` array MUST have length 4.
// Why would `problems` have length 4 after `setProblems(prev => [...shared, ...generated].slice(0, totalCount))`?
// IT MUST BE THAT `generated.length` is 4!
// WHY is `generated.length` 4?
// Because `resQuestions.slice(0, count)` from `readSSEStream` returned 4!
// WHY did `readSSEStream` return 4?
// Because `questions` array only had 4 items!
// WHY did `questions` only have 4 items?
// Because the API only sent 4 items?
// BUT THE USER SAYS: "once the bot returns question 5".

// "once the bot returns question 5, q5 is not loaded into the background automatically"
// Could it mean: the streaming API returns question 5's *text/JSON* in the stream, but it's not parsed?
// WHY WOULD IT NOT BE PARSED?
