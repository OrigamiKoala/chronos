import fs from 'fs';

let content = fs.readFileSync('src/components/ExamScreen.jsx', 'utf8');

const oldCode = `  if (!problem) {
    return (
      <div className="glass-panel" style={{ padding: 'var(--panel-padding-lg)', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
        <Loader2 className="animate-spin text-gradient" size={48} style={{ margin: '0 auto 1rem' }} />
        <h3>Loading next question...</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Streaming question {currentQuestionIndex + 1} of {config.numQuestions}</p>
        {config.stressMode !== 'strict' && (
          <button
            className="btn btn-outline"
            style={{ margin: '0 auto' }}
            onClick={() => {
              recordActiveInterval(currentQuestionIndex);
              clearInterval(timerRef.current);
              setCurrentQuestionIndex(prev => prev - 1);
            }}
          >
            <ArrowLeft size={18} style={{ marginRight: '0.5rem' }} /> Go Back
          </button>
        )}
      </div>
    );
  }`;

const newCode = `  if (!problem) {
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
        <Loader2 className="animate-spin text-gradient" size={48} style={{ margin: '0 auto 1rem' }} />
        <h3>Loading next question...</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Streaming question {currentQuestionIndex + 1} of {config.numQuestions}</p>
        {config.stressMode !== 'strict' && (
          <button
            className="btn btn-outline"
            style={{ margin: '0 auto' }}
            onClick={() => {
              recordActiveInterval(currentQuestionIndex);
              clearInterval(timerRef.current);
              setCurrentQuestionIndex(prev => prev - 1);
            }}
          >
            <ArrowLeft size={18} style={{ marginRight: '0.5rem' }} /> Go Back
          </button>
        )}
      </div>
    );
  }`;

if (content.includes(oldCode)) {
  fs.writeFileSync('src/components/ExamScreen.jsx', content.replace(oldCode, newCode));
  console.log("Patched src/components/ExamScreen.jsx");
} else {
  console.log("OLD CODE NOT FOUND");
}
