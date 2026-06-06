/* eslint-disable */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Activity, CheckCircle2, XCircle, TrendingUp, Award, BrainCircuit, Loader2, HelpCircle, AlertTriangle as TriangleIcon, BookOpen, Save, Check, Clock } from 'lucide-react';
import { ChemicalText, isSmiles, SmilesRenderer } from './ChemicalText';
import { normalizeAnswer } from './ExamScreen';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler);

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

const formatTime = (sec) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const formatIntervals = (intervals) => {
  if (!intervals || intervals.length === 0) return '0:00-0:00';
  return intervals.map(inv => `${formatTime(inv.start)}-${formatTime(inv.end)}`).join(', ');
};

export function AnalyticsScreen({ results: resultsObj, onRestart, user, examId, strengths = [], weaknesses = [], detailedAnalysis = {}, topicBreakdowns = {}, history = [], loadingExamId = null, onReviewExam = null, formatDate = (d) => d, onRefreshData = null }) {
  const [localResults, setLocalResults] = useState(() => resultsObj.results || []);
  const [localNewRating, setLocalNewRating] = useState(() => resultsObj.newRating ?? resultsObj.new_rating);
  const [localRatingChange, setLocalRatingChange] = useState(() => resultsObj.ratingChange ?? resultsObj.rating_change);

  useEffect(() => {
    setLocalResults(resultsObj.results || []);
    setLocalNewRating(resultsObj.newRating ?? resultsObj.new_rating);
    setLocalRatingChange(resultsObj.ratingChange ?? resultsObj.rating_change);

    // Sync/reset tags
    const initialTags = {};
    if (resultsObj.savedTags) {
      for (const st of resultsObj.savedTags) {
        let qIdx = st.questionIndex;
        if (qIdx !== null && qIdx !== undefined) {
          if (typeof qIdx === 'object' && qIdx.value !== undefined) {
            qIdx = parseInt(qIdx.value, 10);
          } else if (typeof qIdx === 'bigint') {
            qIdx = Number(qIdx);
          } else {
            qIdx = parseInt(qIdx, 10);
          }
          initialTags[qIdx] = st.tag;
        }
      }
    }
    setTags(initialTags);

    // Sync/reset explanations
    const initialExplanations = {};
    const list = resultsObj.results || [];
    list.forEach((r, i) => {
      if (r.aiExplanation) {
        initialExplanations[i] = {
          loading: false,
          text: r.aiExplanation,
          query: '',
          remarkedCorrect: false
        };
      }
    });
    setActiveExplanations(initialExplanations);

    setTagsSaving(false);
    setTagsSaved(true);
  }, [resultsObj]);

  const { subject, oldRating } = resultsObj;
  const newRating = localNewRating;
  const ratingChange = localRatingChange;
  const results = localResults;
  const totalQuestions = results.length;
  const correctAnswers = results.filter(r => r.isCorrect).length;
  const accuracy = Math.round((correctAnswers / totalQuestions) * 100) || 0;

  const totalTime = results.reduce((acc, curr) => acc + curr.timeSpent, 0);
  const avgTime = Math.round(totalTime / totalQuestions) || 0;

  // Point efficiency calculation
  const rawPointsEarned = results.reduce((acc, r) => {
    if (r.type === 'free_response') {
      const difficulty = r.difficulty || r.difficultyAtTime || 1;
      const score = r.score !== undefined ? Number(r.score) : (r.isCorrect ? 1.0 : 0.0);
      return acc + (score * difficulty);
    } else {
      return acc + (r.isCorrect ? 1 : 0);
    }
  }, 0);
  const pointsEarned = Math.round(rawPointsEarned * 10) / 10;

  const totalPoints = results.reduce((acc, r) => {
    if (r.type === 'free_response') {
      return acc + (r.difficulty || r.difficultyAtTime || 1);
    } else {
      return acc + 1;
    }
  }, 0);
  const totalMinutes = Math.max(totalTime / 60, 0.1);
  const efficiency = Math.round((pointsEarned / totalMinutes) * 10) / 10;

  // Panic Points
  const panicPoints = results.filter(r => !r.isCorrect && r.timeSpent > (avgTime * 1.5));

  const [activeExplanations, setActiveExplanations] = useState(() => {
    const initial = {};
    const list = resultsObj.results || [];
    list.forEach((r, i) => {
      if (r.aiExplanation) {
        initial[i] = {
          loading: false,
          text: r.aiExplanation,
          query: '',
          remarkedCorrect: false
        };
      }
    });
    return initial;
  });
  const [selectedTopicDetail, setSelectedTopicDetail] = useState(null);

  // Problem tagging state
  const [tags, setTags] = useState(() => {
    const initial = {};
    if (resultsObj.savedTags) {
      for (const st of resultsObj.savedTags) {
        let qIdx = st.questionIndex;
        if (qIdx !== null && qIdx !== undefined) {
          if (typeof qIdx === 'object' && qIdx.value !== undefined) {
            qIdx = parseInt(qIdx.value, 10);
          } else if (typeof qIdx === 'bigint') {
            qIdx = Number(qIdx);
          } else {
            qIdx = parseInt(qIdx, 10);
          }
          initial[qIdx] = st.tag;
        }
      }
    }
    return initial;
  });
  const [tagsSaving, setTagsSaving] = useState(false);
  const [tagsSaved, setTagsSaved] = useState(true);
  const latestTagsRef = useRef(null);
  const isSavingRef = useRef(false);

  const autoSaveTags = async (updatedTags) => {
    if (!user || !examId) return;
    latestTagsRef.current = updatedTags;
    if (isSavingRef.current) return;

    isSavingRef.current = true;
    setTagsSaving(true);
    setTagsSaved(false);

    try {
      while (latestTagsRef.current !== null) {
        const tagsToSave = latestTagsRef.current;
        latestTagsRef.current = null;

        const tagEntries = Object.entries(tagsToSave).map(([idx, tag]) => {
          const problem = results[parseInt(idx)];
          const isFRQ = problem?.type === 'free_response';
          const pointsValue = isFRQ
            ? (problem?.difficulty || problem?.difficultyAtTime || 1)
            : 1;
          return {
            questionIndex: parseInt(idx),
            tag,
            isCorrect: problem?.isCorrect || false,
            pointsValue
          };
        });

        await fetch('/api/save-tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: user.user_id,
            examId,
            tags: tagEntries
          })
        });
      }
      setTagsSaved(true);
      if (onRefreshData) {
        onRefreshData();
      }
    } catch (err) {
      console.error('Auto-save tags error:', err);
    } finally {
      isSavingRef.current = false;
      setTagsSaving(false);
    }
  };

  const handleTag = useCallback((index, tag) => {
    setTags(prev => {
      const current = prev[index];
      let next;
      if (current === tag) {
        next = { ...prev };
        delete next[index];
      } else {
        next = { ...prev, [index]: tag };
      }
      setTimeout(() => {
        autoSaveTags(next);
      }, 0);
      return next;
    });
  }, [user, examId, results, onRefreshData]);

  const handleAskAI = async (index, problemObj, userQuery = '') => {
    setActiveExplanations(prev => ({
      ...prev,
      [index]: {
        ...prev[index],
        loading: true,
        error: null
      }
    }));

    let questionToSend = problemObj.question;
    if (problemObj.type === 'multiple_choice' && problemObj.options && Array.isArray(problemObj.options)) {
      const optsList = problemObj.options.map((opt, i) => `${['A', 'B', 'C', 'D'][i]}. ${opt}`).join('\n');
      questionToSend = `${problemObj.question}\n\nOptions:\n${optsList}`;
    }

    try {
      const response = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: questionToSend,
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
          query: '',
          remarkedCorrect: data.shouldRemarkCorrect || false
        }
      }));

      setLocalResults(prev => {
        const next = [...prev];
        if (next[index]) {
          next[index] = {
            ...next[index],
            aiExplanation: data.explanation,
            isCorrect: data.shouldRemarkCorrect ? true : next[index].isCorrect
          };
        }
        return next;
      });

      if (user && examId) {
        if (data.shouldRemarkCorrect) {
          fetch('/api/remark-correct', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: user.user_id,
              examId,
              questionId: problemObj.id,
              subject,
              topic: problemObj.topic || 'General',
              explanation: data.explanation
            })
          })
            .then(res => {
              if (res.ok) return res.json();
              throw new Error('Failed to update ELO');
            })
            .then(resData => {
              if (resData.newRatingVal !== undefined && resData.newRatingChange !== undefined) {
                setLocalNewRating(resData.newRatingVal);
                setLocalRatingChange(resData.newRatingChange);
              }
              if (onRefreshData) {
                onRefreshData();
              }
            })
            .catch(err => console.error('Failed to update remark-correct in database:', err));
        } else {
          // Just save explanation
          fetch('/api/save-explanation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: user.user_id,
              examId,
              questionId: problemObj.id,
              explanation: data.explanation
            })
          })
            .then(res => {
              if (res.ok && onRefreshData) {
                onRefreshData();
              }
            })
            .catch(err => console.error('Failed to save explanation in database:', err));
        }
      }

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

  // Points timeline chart: continuous points earned rate over time intervals
  const timelineData = (() => {
    let maxTime = 0;
    for (const r of results) {
      if (r.intervals && r.intervals.length > 0) {
        for (const inv of r.intervals) {
          if (inv.end > maxTime) maxTime = inv.end;
        }
      } else {
        maxTime += (r.timeSpent || 0);
      }
    }
    const totalTime = maxTime || 1;
    const intervalSeconds = totalTime > 1800 ? 60 : (totalTime > 900 ? 30 : 15);
    const numIntervals = Math.ceil(totalTime / intervalSeconds);
    const data = [];
    const labels = [];

    for (let i = 0; i < numIntervals; i++) {
      const start = i * intervalSeconds;
      const end = (i + 1) * intervalSeconds;
      let intervalValue = 0;
      let cursor = 0;

      for (const r of results) {
        const questionIntervals = (r.intervals && r.intervals.length > 0)
          ? r.intervals
          : [{ start: cursor, end: cursor + (r.timeSpent || 0) }];
        cursor += (r.timeSpent || 0);

        for (const inv of questionIntervals) {
          const overlapStart = Math.max(inv.start, start);
          const overlapEnd = Math.min(inv.end, end);

          if (overlapEnd > overlapStart) {
            const overlapDuration = overlapEnd - overlapStart;
            const score = r.score !== undefined ? Number(r.score) : (r.isCorrect ? 1.0 : 0.0);
            if (score > 0) {
              const isFRQ = r.type === 'free_response';
              const points = isFRQ ? (r.difficulty || r.difficultyAtTime || 1) : 1;
              intervalValue += (points * score) * (overlapDuration / intervalSeconds);
            }
          }
        }
      }

      data.push(Math.round(intervalValue * 100) / 100);
      const minutes = Math.floor(end / 60);
      const seconds = end % 60;
      const timeStr = seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
      labels.push(timeStr);
    }

    return { labels, data };
  })();

  const timelineChartData = {
    labels: timelineData.labels,
    datasets: [{
      label: 'pts',
      data: timelineData.data,
      fill: true,
      backgroundColor: 'rgba(99, 102, 241, 0.12)',
      borderColor: '#6366f1',
      borderWidth: 2,
      pointBackgroundColor: timelineData.data.map(v => v > 0 ? '#10b981' : 'rgba(239,68,68,0.5)'),
      pointRadius: 4,
      tension: 0.35
    }]
  };

  // Filter S/W to the current subject
  const subjectStrengths = strengths.filter(s => s.subject === resultsObj.subject).map(s => s.topic);
  const subjectWeaknesses = weaknesses.filter(w => w.subject === resultsObj.subject).map(w => w.topic);
  const subjectDiagnosis = detailedAnalysis[resultsObj.subject];

  const hasAnyTags = Object.keys(tags).length > 0;

  return (
    <div className="glass-panel animate-fade-in" style={{ padding: 'var(--panel-padding)', maxWidth: '850px', margin: '0 auto' }}>

      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h2 className="text-gradient" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Session Complete</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Review your performance and tag problems for analytics.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>

        <div className="glass-panel" style={{ padding: 'var(--card-padding-sm)', textAlign: 'center', background: 'var(--bg-tertiary)' }}>
          <Activity size={28} color="var(--accent-primary)" style={{ margin: '0 auto 0.75rem' }} />
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Accuracy</h4>
          <span style={{ fontSize: '1.75rem', fontWeight: '700', color: accuracy > 70 ? 'var(--success)' : accuracy > 40 ? 'var(--warning)' : 'var(--danger)' }}>
            {accuracy}%
          </span>
        </div>

        <div className="glass-panel" style={{ padding: 'var(--card-padding-sm)', textAlign: 'center', background: 'var(--bg-tertiary)' }}>
          <TrendingUp size={28} color={ratingChange >= 0 ? 'var(--success)' : 'var(--danger)'} style={{ margin: '0 auto 0.75rem' }} />
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Rating</h4>
          <span style={{ fontSize: '1.75rem', fontWeight: '700', color: ratingChange >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {ratingChange >= 0 ? `+${ratingChange}` : ratingChange}
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.25rem', display: 'block' }}>
              ({oldRating} → {newRating})
            </span>
          </span>
        </div>

        <div className="glass-panel" style={{ padding: 'var(--card-padding-sm)', textAlign: 'center', background: 'var(--bg-tertiary)' }}>
          <Clock size={28} color="var(--accent-secondary)" style={{ margin: '0 auto 0.75rem' }} />
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Avg Time / Q</h4>
          <span style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text-primary)' }}>
            {avgTime}
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>seconds</span>
          </span>
        </div>

        <div className="glass-panel" style={{ padding: 'var(--card-padding-sm)', textAlign: 'center', background: 'var(--bg-tertiary)' }}>
          <Award size={28} color="var(--accent-secondary)" style={{ margin: '0 auto 0.75rem' }} />
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem', fontSize: '0.85rem' }}>{subject} Level</h4>
          <span style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
            {getSubjectLevelName(subject, newRating)}
          </span>
        </div>
      </div>

      {/* Points timeline Chart */}
      <div className="glass-panel" style={{ padding: 'var(--card-padding)', background: 'var(--bg-tertiary)', marginBottom: '2.5rem' }}>
        <h4 style={{ marginBottom: '1rem', fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Activity size={18} color="var(--accent-primary)" /> Points Earned Timeline (Continuous)
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '400', marginLeft: 'auto' }}>
            {pointsEarned}/{totalPoints} pts · {Math.round(totalMinutes * 10) / 10} min total
          </span>
        </h4>
        <div style={{ height: '150px' }}>
          <Line data={timelineChartData} options={{
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
                cornerRadius: 8,
                callbacks: {
                  label: ctx => `Interval Value: ${ctx.parsed.y} pts`
                }
              }
            },
            scales: {
              x: { ticks: { color: '#666677', font: { size: 10 } }, grid: { display: false } },
              y: {
                min: 0,
                ticks: { color: '#666677', font: { size: 10 } },
                grid: { color: 'rgba(255,255,255,0.04)' },
                title: { display: true, text: 'points', color: '#666677', font: { size: 9 } }
              }
            }
          }} />
        </div>
      </div>

      {panicPoints.length > 0 && (
        <div style={{ padding: 'var(--card-padding)', background: 'var(--danger-glass)', borderRadius: 'var(--radius-md)', border: '1px solid var(--danger)', marginBottom: '2.5rem' }}>
          <h3 style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Activity size={20} /> Panic Points Detected
          </h3>
          <p style={{ color: 'var(--text-primary)', marginBottom: '1rem' }}>
            You spent significantly longer than average on these questions but still answered incorrectly.
          </p>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {panicPoints.map((p, i) => (
              <li key={i} style={{ background: 'var(--bg-primary)', padding: 'var(--card-padding-sm)', borderRadius: 'var(--radius-sm)', marginBottom: '0.5rem' }}>
                <strong>Q:</strong> <ChemicalText text={p.question} theme="dark" /> <br />
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Time Spent: {p.timeSpent}s (Avg: {avgTime}s)</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Strengths & Weaknesses */}
      {(subjectStrengths.length > 0 || subjectWeaknesses.length > 0) && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: selectedTopicDetail ? '0.75rem' : 0 }}>
            {subjectStrengths.length > 0 && (
              <div style={{ padding: 'var(--card-padding-sm)', background: 'rgba(74, 222, 128, 0.05)', border: '1px solid rgba(74, 222, 128, 0.2)', borderRadius: 'var(--radius-md)' }}>
                <h4 style={{ color: 'var(--success)', marginBottom: '0.75rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <CheckCircle2 size={15} /> {subject} Strengths
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {subjectStrengths.map((s, i) => (
                    <span
                      key={i}
                      onClick={() => setSelectedTopicDetail(prev => prev?.topic === s && prev?.type === 'strength' ? null : { topic: s, type: 'strength' })}
                      style={{
                        background: 'rgba(74,222,128,0.1)', color: 'var(--success)',
                        padding: '0.2rem 0.55rem', borderRadius: '4px', fontSize: '0.75rem',
                        cursor: 'pointer', userSelect: 'none', transition: 'all 0.2s ease',
                        border: selectedTopicDetail?.topic === s && selectedTopicDetail?.type === 'strength' ? '1px solid var(--success)' : '1px solid transparent'
                      }}
                    >{s}</span>
                  ))}
                </div>
              </div>
            )}
            {subjectWeaknesses.length > 0 && (
              <div style={{ padding: 'var(--card-padding-sm)', background: 'rgba(248, 113, 113, 0.05)', border: '1px solid rgba(248, 113, 113, 0.2)', borderRadius: 'var(--radius-md)' }}>
                <h4 style={{ color: 'var(--danger)', marginBottom: '0.75rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <XCircle size={15} /> {subject} Weaknesses
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {subjectWeaknesses.map((w, i) => (
                    <span
                      key={i}
                      onClick={() => setSelectedTopicDetail(prev => prev?.topic === w && prev?.type === 'weakness' ? null : { topic: w, type: 'weakness' })}
                      style={{
                        background: 'rgba(248,113,113,0.1)', color: 'var(--danger)',
                        padding: '0.2rem 0.55rem', borderRadius: '4px', fontSize: '0.75rem',
                        cursor: 'pointer', userSelect: 'none', transition: 'all 0.2s ease',
                        border: selectedTopicDetail?.topic === w && selectedTopicDetail?.type === 'weakness' ? '1px solid var(--danger)' : '1px solid transparent'
                      }}
                    >{w}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {selectedTopicDetail && (
            <div style={{
              marginTop: '0.75rem',
              padding: 'var(--card-padding-sm)',
              background: selectedTopicDetail.type === 'strength' ? 'rgba(74,222,128,0.03)' : 'rgba(248,113,113,0.03)',
              border: `1px solid ${selectedTopicDetail.type === 'strength' ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`,
              borderRadius: 'var(--radius-md)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                  <strong style={{ color: selectedTopicDetail.type === 'strength' ? 'var(--success)' : 'var(--danger)' }}>{selectedTopicDetail.topic}</strong>
                </h4>
                <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', height: 'auto', minHeight: 'auto' }} onClick={() => setSelectedTopicDetail(null)}>Close</button>
              </div>
              {topicBreakdowns[selectedTopicDetail.topic] ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.85rem', lineHeight: '1.6' }}>
                  <div>
                    <span style={{ color: 'var(--success)', fontWeight: '600', display: 'block', marginBottom: '0.15rem' }}>✓ What you are good at:</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{topicBreakdowns[selectedTopicDetail.topic].good_at}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--danger)', fontWeight: '600', display: 'block', marginBottom: '0.15rem' }}>✗ What you are not good at:</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{topicBreakdowns[selectedTopicDetail.topic].not_good_at}</span>
                  </div>
                </div>
              ) : (
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No AI breakdown stored yet for this topic. Complete more sessions to build detail!</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Detailed Diagnosis */}
      {subjectDiagnosis && (
        <div style={{
          padding: 'var(--card-padding)',
          background: 'rgba(168, 85, 247, 0.05)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid rgba(168, 85, 247, 0.2)',
          marginBottom: '2.5rem',
          boxShadow: '0 4px 20px -2px rgba(168, 85, 247, 0.1)'
        }}>
          <h3 style={{ color: 'var(--accent-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', margin: 0 }}>
            <BrainCircuit size={20} /> Detailed {subject} Diagnosis
          </h3>
          <p style={{ fontSize: '0.9rem', lineHeight: '1.65', color: 'var(--text-secondary)', marginTop: '0.75rem', marginBottom: 0, whiteSpace: 'pre-line' }}>
            {subjectDiagnosis}
          </p>
        </div>
      )}

      {resultsObj.mistakePatterns && (
        <div style={{
          padding: 'var(--card-padding)',
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



      <div>
        <h3 style={{ marginBottom: '1.5rem' }}>Question Breakdown</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {results.map((r, i) => {
            const isPartial = r.score !== undefined && r.score > 0 && r.score < 1;
            const statusColor = isPartial ? 'var(--warning)' : (r.isCorrect ? 'var(--success)' : 'var(--danger)');
            return (
              <div key={i} className="glass-panel" style={{ padding: 'var(--card-padding)', borderLeft: `4px solid ${statusColor}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>Question {i + 1} (Level {r.difficultyAtTime})</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: statusColor }}>
                    {(() => {
                      const qIntervals = (r.intervals && r.intervals.length > 0)
                        ? r.intervals
                        : (() => {
                          let start = 0;
                          for (let j = 0; j < i; j++) {
                            start += results[j].timeSpent || 0;
                          }
                          return [{ start, end: start + (r.timeSpent || 0) }];
                        })();
                      return formatIntervals(qIntervals);
                    })()} {isPartial ? (
                      <>
                        <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--warning)' }}>
                          {Math.round(r.score * 100)}% Credit
                        </span>
                        <TriangleIcon size={18} color="var(--warning)" />
                      </>
                    ) : r.isCorrect ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <XCircle size={18} />
                    )}
                  </span>
                </div>
                <p style={{ marginBottom: '1rem' }}><ChemicalText text={r.question} theme="dark" /></p>

                <div style={{ display: 'flex', gap: '2rem', fontSize: '0.9rem', alignItems: 'center' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Your Answer: </span>
                    <span style={{ color: statusColor }}>
                      {(() => {
                        const ans = r.userAnswer;
                        if (r.type === 'multiple_choice' && r.options && Array.isArray(r.options)) {
                          const letterIdx = ['A', 'B', 'C', 'D'].indexOf(String(ans).trim().toUpperCase());
                          if (letterIdx !== -1 && r.options[letterIdx]) {
                            const opt = r.options[letterIdx];
                            return isSmiles(opt) ? <SmilesRenderer smiles={opt} width={70} height={70} theme="dark" /> : <ChemicalText text={opt} theme="dark" defaultWidth={70} defaultHeight={70} />;
                          }
                        }
                        return isSmiles(ans) ? <SmilesRenderer smiles={ans} width={70} height={70} theme="dark" /> : <ChemicalText text={ans} theme="dark" defaultWidth={70} defaultHeight={70} />;
                      })()}
                    </span>
                  </div>
                  {!r.isCorrect && r.type !== 'free_response' && (
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Correct Answer: </span>
                      <span style={{ color: 'var(--success)' }}>
                        {(() => {
                          const ans = r.answer;
                          if (r.type === 'multiple_choice' && r.options && Array.isArray(r.options)) {
                            const letterIdx = ['A', 'B', 'C', 'D'].indexOf(String(ans).trim().toUpperCase());
                            if (letterIdx !== -1 && r.options[letterIdx]) {
                              const opt = r.options[letterIdx];
                              return isSmiles(opt) ? <SmilesRenderer smiles={opt} width={70} height={70} theme="dark" /> : <ChemicalText text={opt} theme="dark" defaultWidth={70} defaultHeight={70} />;
                            }
                          }
                          return isSmiles(ans) ? <SmilesRenderer smiles={ans} width={70} height={70} theme="dark" /> : <ChemicalText text={ans} theme="dark" defaultWidth={70} defaultHeight={70} />;
                        })()}
                      </span>
                    </div>
                  )}
                </div>

                {r.feedback && (
                  <div style={{
                    marginTop: '1rem',
                    padding: 'var(--card-padding-sm)',
                    background: 'rgba(255, 255, 255, 0.01)',
                    border: `1px dashed ${statusColor}`,
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.875rem'
                  }}>
                    <div style={{ fontWeight: '600', color: statusColor, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <BrainCircuit size={16} /> Grading & Partial Credit Feedback:
                    </div>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', whiteSpace: 'pre-line', lineHeight: '1.5' }}>
                      {r.feedback}
                    </p>
                  </div>
                )}

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
                      {activeExplanations[i].remarkedCorrect && (
                        <div style={{
                          background: 'rgba(52, 211, 153, 0.08)',
                          border: '1px solid var(--success)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '0.75rem 1rem',
                          color: 'var(--success)',
                          fontSize: '0.85rem',
                          fontWeight: '500',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}>
                          🎉 AI determined your answer was correct! This question has been remarked correct and analytics updated.
                        </div>
                      )}

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
                          <p style={{ margin: 0, whiteSpace: 'pre-line' }}>
                            <ChemicalText text={activeExplanations[i].text} theme="dark" defaultWidth={110} defaultHeight={110} />
                          </p>
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
                          style={{ flex: 1, padding: 'var(--input-padding)', fontSize: '0.85rem' }}
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
            );
          })}
        </div>
      </div>

      {/* Save Tags Bar */}
      {user && examId && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--card-padding-sm)',
          background: 'rgba(99, 102, 241, 0.05)',
          border: '1px solid rgba(99, 102, 241, 0.15)',
          borderRadius: 'var(--radius-md)',
          marginTop: '2rem',
          marginBottom: '1.5rem'
        }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Tag your problems</strong> — mark questions as <em>unsure</em>, <em>silly mistake</em>, or <em>concept problem</em> below (changes save automatically).
          </div>
          <div
            className={`btn btn-outline`}
            style={{
              padding: '0.4rem 1rem',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              whiteSpace: 'nowrap',
              cursor: 'default',
              opacity: 0.85,
              borderColor: tagsSaved ? 'var(--success)' : 'var(--accent-primary)',
              color: tagsSaved ? 'var(--success)' : 'var(--text-primary)',
              background: 'transparent'
            }}
          >
            {tagsSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {tagsSaving ? 'Saving...' : 'All Saved'}
          </div>
        </div>
      )}

      {/* Past Exam History */}
      {user && history.length > 0 && (
        <div style={{ marginTop: '3rem' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={18} color="var(--accent-primary)" /> History
          </h3>
          <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '0.5rem' }}>
            {history.map((h, i) => (
              <div
                key={i}
                className="history-row"
                onClick={() => loadingExamId === null && onReviewExam && onReviewExam(h)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: 'var(--bg-tertiary)', padding: 'var(--card-padding-sm)',
                  borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.05)',
                  fontSize: '0.85rem', cursor: onReviewExam ? 'pointer' : 'default',
                  transition: 'all 0.2s ease'
                }}
              >
                <div>
                  <strong style={{ color: 'var(--accent-primary)' }}>{h.subject}</strong>
                  <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{formatDate(h.created_at)}</span>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <span style={{ color: h.accuracy >= 0.70 ? 'var(--success)' : h.accuracy >= 0.40 ? 'var(--warning)' : 'var(--danger)' }}>
                    {Math.round(h.accuracy * 100)}% Acc
                  </span>
                  <strong style={{ color: h.rating_change >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {h.rating_change >= 0 ? `+${h.rating_change}` : h.rating_change} ({h.new_rating})
                  </strong>
                  {onReviewExam && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent-secondary)', textDecoration: 'underline', opacity: 0.8 }}>
                      {loadingExamId === h.exam_id ? 'Loading...' : 'Review'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: '3rem', textAlign: 'center' }}>
        <button className="btn btn-primary" onClick={onRestart}>
          Start New Session
        </button>
      </div>

    </div>
  );
}
