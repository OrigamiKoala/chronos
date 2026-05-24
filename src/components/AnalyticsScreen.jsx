/* eslint-disable */
import { useState, useEffect, useCallback } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Activity, CheckCircle2, XCircle, TrendingUp, Award, BrainCircuit, Loader2, HelpCircle, AlertTriangle as TriangleIcon, BookOpen, Save, Check } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

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

export function AnalyticsScreen({ results: resultsObj, onRestart, user, examId }) {
  const { results, subject, oldRating, newRating, ratingChange } = resultsObj;
  const totalQuestions = results.length;
  const correctAnswers = results.filter(r => r.isCorrect).length;
  const accuracy = Math.round((correctAnswers / totalQuestions) * 100) || 0;

  const totalTime = results.reduce((acc, curr) => acc + curr.timeSpent, 0);
  const avgTime = Math.round(totalTime / totalQuestions) || 0;

  // Point efficiency calculation
  const pointsEarned = results.filter(r => r.isCorrect).reduce((acc, r) => acc + (r.difficulty || r.difficultyAtTime || 1), 0);
  const totalPoints = results.reduce((acc, r) => acc + (r.difficulty || r.difficultyAtTime || 1), 0);
  const totalMinutes = Math.max(totalTime / 60, 0.1);
  const efficiency = Math.round((pointsEarned / totalMinutes) * 10) / 10;

  // Panic Points
  const panicPoints = results.filter(r => !r.isCorrect && r.timeSpent > (avgTime * 1.5));

  const [activeExplanations, setActiveExplanations] = useState({});

  // Problem tagging state
  const [tags, setTags] = useState(() => {
    const initial = {};
    // Pre-populate from saved tags if available
    if (resultsObj.savedTags) {
      for (const st of resultsObj.savedTags) {
        initial[st.questionIndex] = st.tag;
      }
    }
    return initial;
  });
  const [tagsSaving, setTagsSaving] = useState(false);
  const [tagsSaved, setTagsSaved] = useState(false);

  const handleTag = useCallback((index, tag) => {
    setTags(prev => {
      const current = prev[index];
      // Toggle off if same tag
      if (current === tag) {
        const next = { ...prev };
        delete next[index];
        return next;
      }
      return { ...prev, [index]: tag };
    });
    setTagsSaved(false);
  }, []);

  const saveTags = async () => {
    if (!user || !examId) return;
    setTagsSaving(true);
    try {
      const tagEntries = Object.entries(tags).map(([idx, tag]) => ({
        questionIndex: parseInt(idx),
        tag,
        isCorrect: results[parseInt(idx)]?.isCorrect || false,
        pointsValue: results[parseInt(idx)]?.difficulty || results[parseInt(idx)]?.difficultyAtTime || 1
      }));

      await fetch('/api/save-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.user_id,
          examId,
          tags: tagEntries
        })
      });
      setTagsSaved(true);
    } catch (err) {
      console.error('Failed to save tags:', err);
    } finally {
      setTagsSaving(false);
    }
  };

  const handleAskAI = async (index, problemObj, userQuery = '') => {
    setActiveExplanations(prev => ({
      ...prev,
      [index]: {
        ...prev[index],
        loading: true,
        error: null
      }
    }));

    try {
      const response = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: problemObj.question,
          answer: problemObj.answer,
          userAnswer: problemObj.userAnswer,
          isCorrect: problemObj.isCorrect,
          userQuery,
          subject
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch explanation');
      }

      const data = await response.json();
      setActiveExplanations(prev => ({
        ...prev,
        [index]: {
          ...prev[index],
          loading: false,
          text: data.explanation,
          query: ''
        }
      }));

      setTimeout(() => {
        if (window.MathJax && window.MathJax.typesetPromise) {
          window.MathJax.typesetPromise();
        }
      }, 100);

    } catch (err) {
      console.error('AI Explanation failed:', err);
      setActiveExplanations(prev => ({
        ...prev,
        [index]: {
          ...prev[index],
          loading: false,
          error: 'Failed to retrieve explanation from AI. Please try again.'
        }
      }));
    }
  };

  const updateExplanationQuery = (index, value) => {
    setActiveExplanations(prev => ({
      ...prev,
      [index]: {
        ...prev[index],
        query: value
      }
    }));
  };

  useEffect(() => {
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise();
    }
  }, [resultsObj]);

  // Per-question efficiency bar chart
  const perQuestionEfficiency = {
    labels: results.map((_, i) => `Q${i + 1}`),
    datasets: [{
      label: 'Points Earned',
      data: results.map(r => r.isCorrect ? (r.difficulty || r.difficultyAtTime || 1) : 0),
      backgroundColor: results.map(r => r.isCorrect ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.3)'),
      borderColor: results.map(r => r.isCorrect ? '#10b981' : '#ef4444'),
      borderWidth: 1,
      borderRadius: 4,
      barPercentage: 0.7
    }]
  };

  const hasAnyTags = Object.keys(tags).length > 0;

  return (
    <div className="glass-panel animate-fade-in" style={{ padding: '2rem', maxWidth: '850px', margin: '0 auto' }}>

      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h2 className="text-gradient" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Session Complete</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Review your performance and tag problems for analytics.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>

        <div className="glass-panel" style={{ padding: '1.25rem', textAlign: 'center', background: 'var(--bg-tertiary)' }}>
          <Activity size={28} color="var(--accent-primary)" style={{ margin: '0 auto 0.75rem' }} />
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Accuracy</h4>
          <span style={{ fontSize: '1.75rem', fontWeight: '700', color: accuracy > 70 ? 'var(--success)' : accuracy > 40 ? 'var(--warning)' : 'var(--danger)' }}>
            {accuracy}%
          </span>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem', textAlign: 'center', background: 'var(--bg-tertiary)' }}>
          <TrendingUp size={28} color={ratingChange >= 0 ? 'var(--success)' : 'var(--danger)'} style={{ margin: '0 auto 0.75rem' }} />
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Rating</h4>
          <span style={{ fontSize: '1.75rem', fontWeight: '700', color: ratingChange >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {ratingChange >= 0 ? `+${ratingChange}` : ratingChange}
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.25rem', display: 'block' }}>
              ({oldRating} → {newRating})
            </span>
          </span>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem', textAlign: 'center', background: 'var(--bg-tertiary)' }}>
          <Award size={28} color="var(--accent-secondary)" style={{ margin: '0 auto 0.75rem' }} />
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Efficiency</h4>
          <span style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text-primary)' }}>
            {efficiency}
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>pts/min</span>
          </span>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem', textAlign: 'center', background: 'var(--bg-tertiary)' }}>
          <Award size={28} color="var(--accent-secondary)" style={{ margin: '0 auto 0.75rem' }} />
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem', fontSize: '0.85rem' }}>{subject} Level</h4>
          <span style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
            {getSubjectLevelName(subject, newRating)}
          </span>
        </div>
      </div>

      {/* Point Efficiency Chart */}
      <div className="glass-panel" style={{ padding: '1.5rem', background: 'var(--bg-tertiary)', marginBottom: '2.5rem' }}>
        <h4 style={{ marginBottom: '1rem', fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Activity size={18} color="var(--accent-primary)" /> Points Earned Per Question
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '400', marginLeft: 'auto' }}>
            {pointsEarned}/{totalPoints} pts in {Math.round(totalMinutes * 10) / 10} min
          </span>
        </h4>
        <div style={{ height: '140px' }}>
          <Bar data={perQuestionEfficiency} options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: 'rgba(26, 26, 33, 0.95)',
                titleColor: '#f0f0f5',
                bodyColor: '#a0a0b0',
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                cornerRadius: 8
              }
            },
            scales: {
              x: { ticks: { color: '#666677', font: { size: 10 } }, grid: { display: false } },
              y: { ticks: { color: '#666677', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
            }
          }} />
        </div>
      </div>

      {panicPoints.length > 0 && (
        <div style={{ padding: '1.5rem', background: 'var(--danger-glass)', borderRadius: 'var(--radius-md)', border: '1px solid var(--danger)', marginBottom: '2.5rem' }}>
          <h3 style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Activity size={20} /> Panic Points Detected
          </h3>
          <p style={{ color: 'var(--text-primary)', marginBottom: '1rem' }}>
            You spent significantly longer than average on these questions but still answered incorrectly.
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

      {resultsObj.mistakePatterns && (
        <div style={{ 
          padding: '1.5rem', 
          background: 'rgba(168, 85, 247, 0.05)', 
          borderRadius: 'var(--radius-md)', 
          border: '1px solid rgba(168, 85, 247, 0.2)', 
          marginBottom: '2.5rem',
          boxShadow: '0 4px 20px -2px rgba(168, 85, 247, 0.1)'
        }}>
          <h3 style={{ color: 'var(--accent-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', margin: 0 }}>
            <BrainCircuit size={20} /> AI Error & Mistake Pattern Diagnosis
          </h3>
          <p style={{ fontSize: '0.925rem', lineHeight: '1.6', color: 'var(--text-secondary)', marginTop: '0.75rem', marginBottom: 0, whiteSpace: 'pre-line' }}>
            {resultsObj.mistakePatterns}
          </p>
        </div>
      )}

      {/* Save Tags Bar */}
      {user && examId && (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          padding: '1rem 1.25rem', 
          background: 'rgba(99, 102, 241, 0.05)', 
          border: '1px solid rgba(99, 102, 241, 0.15)', 
          borderRadius: 'var(--radius-md)', 
          marginBottom: '1.5rem' 
        }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Tag your problems</strong> — mark questions as <em>unsure</em>, <em>silly mistake</em>, or <em>concept problem</em> below, then save.
          </div>
          <button
            className={`btn ${tagsSaved ? 'btn-outline' : 'btn-primary'}`}
            style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap' }}
            onClick={saveTags}
            disabled={tagsSaving || !hasAnyTags}
          >
            {tagsSaving ? <Loader2 size={14} className="animate-spin" /> : tagsSaved ? <Check size={14} /> : <Save size={14} />}
            {tagsSaved ? 'Saved' : 'Save Tags'}
          </button>
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

              {/* Tag buttons */}
              {user && examId && (
                <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {/* Unsure — available for all problems */}
                  <button
                    className={`tag-btn ${tags[i] === 'unsure' ? 'tag-btn-active tag-unsure' : ''}`}
                    onClick={() => handleTag(i, 'unsure')}
                  >
                    <HelpCircle size={14} /> Unsure
                  </button>

                  {/* Silly & Concept — only for incorrect */}
                  {!r.isCorrect && (
                    <>
                      <button
                        className={`tag-btn ${tags[i] === 'silly' ? 'tag-btn-active tag-silly' : ''}`}
                        onClick={() => handleTag(i, 'silly')}
                      >
                        <TriangleIcon size={14} /> Silly Mistake
                      </button>
                      <button
                        className={`tag-btn ${tags[i] === 'concept' ? 'tag-btn-active tag-concept' : ''}`}
                        onClick={() => handleTag(i, 'concept')}
                      >
                        <BookOpen size={14} /> Concept Problem
                      </button>
                    </>
                  )}

                  {tags[i] && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: '0.25rem' }}>
                      Tagged: {tags[i]}
                    </span>
                  )}
                </div>
              )}

              <div style={{ marginTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
                {!activeExplanations[i] ? (
                  <button 
                    className="btn btn-outline" 
                    style={{ fontSize: '0.85rem', padding: '0.4rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    onClick={() => handleAskAI(i, r)}
                  >
                    <BrainCircuit size={16} color="var(--accent-secondary)" /> Ask AI why this is correct
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {activeExplanations[i].text && (
                      <div style={{ 
                        background: 'var(--bg-tertiary)', 
                        padding: '1rem', 
                        borderRadius: 'var(--radius-sm)', 
                        fontSize: '0.9rem', 
                        lineHeight: '1.6',
                        borderLeft: '3px solid var(--accent-secondary)',
                        color: 'var(--text-secondary)'
                      }}>
                        <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{activeExplanations[i].text}</p>
                      </div>
                    )}

                    {activeExplanations[i].loading && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        <Loader2 size={16} className="animate-spin" /> Analyzing problem...
                      </div>
                    )}

                    {activeExplanations[i].error && (
                      <div style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>
                        {activeExplanations[i].error}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <input 
                        type="text" 
                        placeholder="Ask a follow-up or custom question..." 
                        className="input-field" 
                        style={{ flex: 1, padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                        value={activeExplanations[i].query || ''}
                        onChange={(e) => updateExplanationQuery(i, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && activeExplanations[i].query?.trim() && handleAskAI(i, r, activeExplanations[i].query)}
                        disabled={activeExplanations[i].loading}
                      />
                      <button 
                        className="btn btn-primary" 
                        style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}
                        onClick={() => handleAskAI(i, r, activeExplanations[i].query)}
                        disabled={activeExplanations[i].loading || !activeExplanations[i].query?.trim()}
                      >
                        Ask
                      </button>
                    </div>
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
