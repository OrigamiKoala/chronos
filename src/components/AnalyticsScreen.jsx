import { useEffect } from 'react';
import { Activity, CheckCircle2, XCircle, TrendingUp, Award } from 'lucide-react';

const getSubjectLevelName = (subject, rating) => {
  if (subject === 'Math') {
    if (rating >= 3000) return 'IMO Level';
    if (rating >= 2500) return 'USAMO Level';
    if (rating >= 1500) return 'AIME Level';
    if (rating >= 1000) return 'Intermediate AMC 10/12 Level';
    return 'School Math Level';
  } else if (subject === 'Chemistry') {
    if (rating >= 3000) return 'IMChO Level';
    if (rating >= 2500) return 'IChO Level';
    if (rating >= 2000) return 'Camp Level';
    if (rating >= 1500) return 'USNCO Honors Level';
    if (rating >= 1000) return 'USNCO Level';
    if (rating >= 500) return 'AP Chem / ACS Local level';
    return 'Honors/AP Chem Level';
  } else if (subject === 'Physics') {
    if (rating >= 3000) return 'IPhO Level';
    if (rating >= 2500) return 'Camp Level';
    if (rating >= 2000) return 'USAPhO Level';
    if (rating >= 1000) return 'F=ma Level';
    if (rating >= 500) return 'AP Physics Level';
    return 'HS Physics Level';
  }
  return 'Novice';
};

export function AnalyticsScreen({ results: resultsObj, onRestart }) {
  const { results, subject, oldRating, newRating, ratingChange } = resultsObj;
  const totalQuestions = results.length;
  const correctAnswers = results.filter(r => r.isCorrect).length;
  const accuracy = Math.round((correctAnswers / totalQuestions) * 100) || 0;

  const totalTime = results.reduce((acc, curr) => acc + curr.timeSpent, 0);
  const avgTime = Math.round(totalTime / totalQuestions) || 0;

  // Identify Panic Points (wrong answer, time spent > 1.5x average)
  const panicPoints = results.filter(r => !r.isCorrect && r.timeSpent > (avgTime * 1.5));

  useEffect(() => {
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise();
    }
  }, [resultsObj]);

  return (
    <div className="glass-panel animate-fade-in" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>

      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h2 className="text-gradient" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Session Complete</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Review your performance and identify stress bottlenecks.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem', marginBottom: '3rem' }}>

        <div className="glass-panel" style={{ padding: '1.25rem', textAlign: 'center', background: 'var(--bg-tertiary)' }}>
          <Activity size={28} color="var(--accent-primary)" style={{ margin: '0 auto 0.75rem' }} />
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem', fontSize: '0.9rem' }}>Accuracy</h4>
          <span style={{ fontSize: '1.75rem', fontWeight: '700', color: accuracy > 70 ? 'var(--success)' : accuracy > 40 ? 'var(--warning)' : 'var(--danger)' }}>
            {accuracy}%
          </span>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem', textAlign: 'center', background: 'var(--bg-tertiary)' }}>
          <TrendingUp size={28} color={ratingChange >= 0 ? 'var(--success)' : 'var(--danger)'} style={{ margin: '0 auto 0.75rem' }} />
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem', fontSize: '0.9rem' }}>Rating Change</h4>
          <span style={{ fontSize: '1.75rem', fontWeight: '700', color: ratingChange >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {ratingChange >= 0 ? `+${ratingChange}` : ratingChange}
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: '0.25rem', display: 'block' }}>
              ({oldRating} → {newRating})
            </span>
          </span>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem', textAlign: 'center', background: 'var(--bg-tertiary)', gridColumn: 'span 2' }}>
          <Award size={28} color="var(--accent-secondary)" style={{ margin: '0 auto 0.75rem' }} />
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem', fontSize: '0.9rem' }}>Current {subject} Level</h4>
          <span style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-primary)' }}>
            {getSubjectLevelName(subject, newRating)}
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
                <strong>Q:</strong> {p.question} <br />
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
