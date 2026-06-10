// If `if (!problem)` renders "Loading next question...", it shows this FOREVER if the array length is short and `loading` is false!
// Wait. What if `loading` IS FALSE?
// Look at line 614: `if (loading) { return ( <div ...> <h3>Generating test...</h3> ... ) }`
// But line 679: `if (!problem) { return ( <div ...> <h3>Loading next question...</h3> ... ) }`

// So if `loading` is false (meaning API call finished), BUT `!problem` is true (meaning the question doesn't exist), it shows "Loading next question..." FOREVER!
// This PERFECTLY matches the user's description.
// They get stuck on "Loading next question..." because the question was never generated, BUT the API call has actually FINISHED.

// How to fix this?
// 1. If `!problem` AND `!loading`, it means the backend finished but we don't have enough questions!
// If `currentQuestionIndex >= problems.length`, we should probably handle it!
// BUT wait, why wouldn't the question be generated?
// If the LLM generates only 4 questions, we should adjust `config.numQuestions` to match `problems.length`, OR we should trigger a retry for the remaining questions!

// What if the user DID see question 5 being generated in the backend logs?
// The user said: "once the bot returns question 5, q5 is not loaded into the background automatically - when I hit next on q4 there is still a screen that says it is loading q5."
// IF THE BOT RETURNED QUESTION 5.
// This implies the bot DID generate question 5.
// Why would the bot generate question 5, but it NOT be loaded?
