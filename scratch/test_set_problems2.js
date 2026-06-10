// If `if (!problem)` matches, it shows "Loading next question...".
// `problem` is `problems[currentQuestionIndex]`.
// The user hits Next on q4 (which is index 3).
// `currentQuestionIndex` becomes 4.
// `problem` evaluates to `problems[4]`.
// If `problems` only has 4 elements, `problems[4]` is `undefined`, so it shows "Loading next question...".

// WHY DOES `problems` ONLY HAVE 4 ELEMENTS at the end of streaming?

// Look at extractCompleteObjects again.
// It parses the stream incrementally.
// In `api/generate.js`:
// It reads the `chunk.text`, appends to `accumulated`.
// Calls `extractCompleteObjects(accumulated)`.
// `extractCompleteObjects` parses ALL fully formed objects in `accumulated`.
// Then it emits them via `res.write`.

// BUT if `accumulated` does NOT contain the full JSON of the 5th question at the end?
// The Gemini API streams JSON.
// The output format is:
/*
[
  { "id": "1", ... },
  { "id": "2", ... },
  { "id": "3", ... },
  { "id": "4", ... },
  { "id": "5", ... }
]
*/
// Let's say the last chunk from Gemini is `... } ]`.
// `extractCompleteObjects` processes this string.
// At the `}`, `depth` becomes 0. It pushes the 5th object!
// Why wouldn't it push the 5th object?

// Let's test `extractCompleteObjects` on a real Gemini JSON response.
