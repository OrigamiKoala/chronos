import { BarChart, Activity, Clock, CheckCircle2, XCircle } from 'lucide-react';

export function AnalyticsScreen({ results, onRestart }) {
  const totalQuestions = results.length;
  const correctAnswers = results.filter(r => r.isCorrect).length;
  const accuracy = Math.round((correctAnswers / totalQuestions) * 100) || 0;
  
  const totalTime = results.reduce((acc, curr) => acc + curr.timeSpent, 0);
  const avgTime = Math.round(totalTime / totalQuestions) || 0;

  // Identify Panic Points (wrong answer, time spent > 1.5x average)
  const panicPoints = results.filter(r => !r.isCorrect && r.timeSpent > (avgTime * 1.5));

  return (
    <div className="glass-panel animate-fade-in" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h2 className="text-gradient" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Session Complete</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Review your performance and identify stress bottlenecks.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
        
        <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center', background: 'var(--bg-tertiary)' }}>
          <Activity size={32} color="var(--accent-primary)" style={{ margin: '0 auto 1rem' }} />
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Accuracy</h4>
          <span style={{ fontSize: '2rem', fontWeight: '700', color: accuracy > 70 ? 'var(--success)' : accuracy > 40 ? 'var(--warning)' : 'var(--danger)' }}>
            {accuracy}%
          </span>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center', background: 'var(--bg-tertiary)' }}>
          <Clock size={32} color="var(--accent-secondary)" style={{ margin: '0 auto 1rem' }} />
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Avg Time</h4>
          <span style={{ fontSize: '2rem', fontWeight: '700' }}>
            {avgTime}s <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/ q</span>
          </span>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center', background: 'var(--bg-tertiary)' }}>
          <BarChart size={32} color="var(--text-primary)" style={{ margin: '0 auto 1rem' }} />
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Final Difficulty</h4>
          <span style={{ fontSize: '2rem', fontWeight: '700' }}>
            Level {results[results.length - 1]?.difficultyAtTime || 0}
          </span>
        </div>
      </div>

      {panicPoints.length > 0 && (
        <div style={{ padding: '1.5rem', background: 'var(--danger-glass)', borderRadius: 'var(--radius-md)', border: '1px solid var(--danger)', marginBottom: '3rem' }}>
          <h3 style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Activity size={20} /> Panic Points Detected
          </h3>
          <p style={{ color: 'var(--text-primary)', marginBottom: '1rem' }}>
            You spent significantly longer than average on these questions but still answered incorrectly. This indicates structural bottlenecks or panic freezing.
          </p>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {panicPoints.map((p, i) => (
              <li key={i} style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '0.5rem' }}>
                <strong>Q:</strong> {p.question} <br/>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Time Spent: {p.timeSpent}s (Avg: {avgTime}s)</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 style={{ marginBottom: '1.5rem' }}>Question Breakdown</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {results.map((r, i) => (
            <div key={i} className="glass-panel" style={{ padding: '1.5rem', borderLeft: `4px solid ${r.isCorrect ? 'var(--success)' : 'var(--danger)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>Question {i + 1} (Level {r.difficultyAtTime})</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: r.isCorrect ? 'var(--success)' : 'var(--danger)' }}>
                  {r.timeSpent}s {r.isCorrect ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                </span>
              </div>
              <p style={{ marginBottom: '1rem' }}>{r.question}</p>
              
              <div style={{ display: 'flex', gap: '2rem', fontSize: '0.9rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Your Answer: </span>
                  <span style={{ color: r.isCorrect ? 'var(--success)' : 'var(--danger)' }}>{r.userAnswer}</span>
                </div>
                {!r.isCorrect && (
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Correct Answer: </span>
                    <span style={{ color: 'var(--success)' }}>{r.answer}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '3rem', textAlign: 'center' }}>
        <button className="btn btn-primary" onClick={onRestart}>
          Start New Session
        </button>
      </div>

    </div>
  );
}
