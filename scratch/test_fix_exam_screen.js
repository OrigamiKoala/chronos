// If `loading` is false AND `!problem`, it means the backend FINISHED, but we don't have the question.
// This happens if the LLM generated FEWER questions than `config.numQuestions`!
// We should tell the user, and allow them to finish the exam.

/*
  if (!problem) {
    if (!loading) {
      return (
        <div className="glass-panel" style={{ padding: 'var(--panel-padding-lg)', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
          <AlertTriangle className="text-gradient" size={48} style={{ margin: '0 auto 1rem', color: 'var(--danger)' }} />
          <h3>Generation Incomplete</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
            The AI could not generate the full number of requested questions. You can finish the exam now.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            {config.stressMode !== 'strict' && (
              <button className="btn btn-outline" onClick={() => {
                recordActiveInterval(currentQuestionIndex);
                clearInterval(timerRef.current);
                setCurrentQuestionIndex(prev => prev - 1);
              }}>
                <ArrowLeft size={18} style={{ marginRight: '0.5rem' }} /> Go Back
              </button>
            )}
            <button className="btn btn-primary" onClick={() => handleFinishExam(null, answers, frqSubmissions)}>
              Finish Exam
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="glass-panel" style={{ padding: 'var(--panel-padding-lg)', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
...
*/
// This gracefully handles LLM generation drop-offs!

// BUT WAIT! The user says: "Then, once the bot returns question 5, q5 is not loaded into the background automatically - when I hit next on q4 there is still a screen that says it is loading q5."
// IF "the bot returns question 5" literally means the 5th question is printed out in the backend or sent via SSE?
// Yes, we FIXED the stream processing bug in `gemini.js` where the `done: true` chunk could drop the `value`!
// If the final question was in the same chunk as `done: true`, `buffer` gets it, but the loop breaks BEFORE processing it!
// My patch for `src/services/gemini.js` fixes that.

// Is there another issue in `ExamScreen.jsx`?
// Yes! Look at `handleConfirmFRQSubmit` / `handleNextQuestion`:
