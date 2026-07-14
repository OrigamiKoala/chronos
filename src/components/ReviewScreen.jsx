import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, AlertCircle, CheckCircle, HelpCircle, Loader2, Tag, Inbox, Play, BookOpenCheck } from 'lucide-react';
import { ChemicalText } from './ChemicalText';

export function ReviewScreen({ user, onBack }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [wrongQuestions, setWrongQuestions] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState('all');
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [selectedTag, setSelectedTag] = useState('all');

  // Reload trigger for updating data from event handlers
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // Test mode states
  const [testMode, setTestMode] = useState(false); // false, 'test', 'summary'
  const [testQuestions, setTestQuestions] = useState([]);
  const [currentTestIndex, setCurrentTestIndex] = useState(0);
  const [userSelectedAnswer, setUserSelectedAnswer] = useState('');
  const [submittedCurrent, setSubmittedCurrent] = useState(false);
  const [currentIsCorrect, setCurrentIsCorrect] = useState(false);
  const [testResults, setTestResults] = useState([]); // Array of boolean correctness
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [currentExplanation, setCurrentExplanation] = useState('');

  // Individual question explanation states (in the main list)
  const [loadingExpls, setLoadingExpls] = useState({});

  // Capture static "now" timestamp on mount to prevent impurity rendering warning
  const [now] = useState(() => Date.now());

  // Canonical React data fetching inside useEffect
  useEffect(() => {
    let active = true;

    const fetchQuestions = async () => {
      if (user) {
        try {
          const res = await fetch(`/api/review?username=${encodeURIComponent(user.user_id)}`);
          if (!res.ok) throw new Error('Failed to load review questions from database');
          const data = await res.json();
          if (active) {
            setWrongQuestions(data || []);
            setError('');
            setLoading(false);
          }
        } catch (err) {
          console.error(err);
          if (active) {
            setError('Could not retrieve wrong questions. Please try again.');
            setLoading(false);
          }
        }
      } else {
        // Guest mode: load from localStorage
        const guestWrong = JSON.parse(localStorage.getItem('chronos_guest_wrong_problems') || '[]');
        if (active) {
          setWrongQuestions(guestWrong);
          setError('');
          setLoading(false);
        }
      }
    };

    fetchQuestions();

    return () => {
      active = false;
    };
  }, [user, reloadTrigger]);

  // Helper to map repetitions to Leitner boxes (Box 1-5)
  const getBoxNumber = (reps) => {
    if (!reps) return 1;
    if (reps === 1) return 2;
    if (reps === 2) return 3;
    if (reps === 3) return 4;
    return 5;
  };

  // Helper to check if a question is currently due
  const isQuestionDue = useCallback((q) => {
    const nextReview = q.spaced_rep?.next_review_at || q.next_review_at;
    if (!nextReview) return true;
    return new Date(nextReview).getTime() <= now;
  }, [now]);

  // Get distinct topics based on wrong questions
  const topicsList = Array.from(new Set(wrongQuestions.map(q => q.topic).filter(Boolean)));
  const subjectsList = Array.from(new Set(wrongQuestions.map(q => q.subject).filter(Boolean)));
  const tagsList = Array.from(new Set(wrongQuestions.map(q => q.tag).filter(Boolean)));

  // Filter wrong questions
  const filteredWrong = wrongQuestions.filter(q => {
    const topicMatch = selectedTopic === 'all' || q.topic === selectedTopic;
    const subjectMatch = selectedSubject === 'all' || q.subject === selectedSubject;
    const tagMatch = selectedTag === 'all' || q.tag === selectedTag;
    return topicMatch && subjectMatch && tagMatch;
  });

  // Request explanation for a question in the main list
  const askExplanationForQuestion = async (q, index) => {
    setLoadingExpls(prev => ({ ...prev, [index]: true }));
    try {
      if (user) {
        const res = await fetch('/api/review?action=ask-explanation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: user.user_id,
            examId: q.exam_id,
            questionId: q.question_id,
            questionText: q.question_text,
            correctAnswer: q.correct_answer,
            userAnswer: q.user_answer,
            subject: q.subject,
            topic: q.topic
          })
        });
        if (!res.ok) throw new Error('Failed to fetch explanation from server');
        const data = await res.json();
        
        // Update local state
        setWrongQuestions(prev => prev.map((item, idx) => {
          if (idx === index) {
            return { ...item, ai_explanation: data.explanation };
          }
          return item;
        }));
      } else {
        // Guest mode - fetch from standard explain API
        const res = await fetch('/api/explain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: q.question_text,
            answer: q.correct_answer,
            userAnswer: q.user_answer,
            isCorrect: false,
            subject: q.subject,
            topic: q.topic
          })
        });
        if (!res.ok) throw new Error('Failed to fetch explanation from server');
        const data = await res.json();

        // Update local state and localStorage
        const updatedQuestions = wrongQuestions.map((item, idx) => {
          if (idx === index) {
            return { ...item, ai_explanation: data.explanation };
          }
          return item;
        });
        setWrongQuestions(updatedQuestions);
        localStorage.setItem('chronos_guest_wrong_problems', JSON.stringify(updatedQuestions));
      }
    } catch (err) {
      console.error(err);
      alert('Could not generate explanation. Please try again.');
    } finally {
      setLoadingExpls(prev => ({ ...prev, [index]: false }));
    }
  };

  // Start review test
  const startReviewTest = () => {
    // Select questions that are wrong and filter them by subject/topic/tag if selected
    let candidates = wrongQuestions.filter(q => {
      const topicMatch = selectedTopic === 'all' || q.topic === selectedTopic;
      const subjectMatch = selectedSubject === 'all' || q.subject === selectedSubject;
      const tagMatch = selectedTag === 'all' || q.tag === selectedTag;
      return topicMatch && subjectMatch && tagMatch;
    });

    if (candidates.length === 0) return;

    // Prioritize due questions first
    const dueQuestions = candidates.filter(isQuestionDue);
    const nonDueQuestions = candidates.filter(q => !isQuestionDue(q));

    // Sort non-due questions by next review time ascending (urgent first)
    nonDueQuestions.sort((a, b) => {
      const aTime = new Date(a.spaced_rep?.next_review_at || a.next_review_at || 0).getTime();
      const bTime = new Date(b.spaced_rep?.next_review_at || b.next_review_at || 0).getTime();
      return aTime - bTime;
    });

    // Select up to 10 questions
    const finalSelection = [...dueQuestions, ...nonDueQuestions].slice(0, 10);

    setTestQuestions(finalSelection);
    setCurrentTestIndex(0);
    setUserSelectedAnswer('');
    setSubmittedCurrent(false);
    setCurrentIsCorrect(false);
    setTestResults([]);
    setCurrentExplanation('');
    setTestMode('test');
  };

  // Submit answer during review test
  const handleTestSubmit = async () => {
    const q = testQuestions[currentTestIndex];
    const isCorrect = userSelectedAnswer.trim().toLowerCase() === q.correct_answer.trim().toLowerCase();
    
    setCurrentIsCorrect(isCorrect);
    setSubmittedCurrent(true);
    setTestResults(prev => [...prev, isCorrect]);

    // Fetch AI Explanation if not already available
    if (q.ai_explanation) {
      setCurrentExplanation(q.ai_explanation);
    } else {
      setExplanationLoading(true);
      try {
        if (user) {
          const res = await fetch('/api/review?action=ask-explanation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: user.user_id,
              examId: q.exam_id,
              questionId: q.question_id,
              questionText: q.question_text,
              correctAnswer: q.correct_answer,
              userAnswer: userSelectedAnswer,
              subject: q.subject,
              topic: q.topic
            })
          });
          if (!res.ok) throw new Error('Failed to get explanation');
          const data = await res.json();
          setCurrentExplanation(data.explanation);
          
          // Update test questions state to cache explanation
          setTestQuestions(prev => prev.map((item, idx) => {
            if (idx === currentTestIndex) {
              return { ...item, ai_explanation: data.explanation };
            }
            return item;
          }));
        } else {
          const res = await fetch('/api/explain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question: q.question_text,
              answer: q.correct_answer,
              userAnswer: userSelectedAnswer,
              isCorrect: false,
              subject: q.subject,
              topic: q.topic
            })
          });
          if (!res.ok) throw new Error('Failed to get explanation');
          const data = await res.json();
          setCurrentExplanation(data.explanation);
          
          setTestQuestions(prev => prev.map((item, idx) => {
            if (idx === currentTestIndex) {
              return { ...item, ai_explanation: data.explanation };
            }
            return item;
          }));

          // Update guest localStorage
          const guestWrong = JSON.parse(localStorage.getItem('chronos_guest_wrong_problems') || '[]');
          const updatedGuestWrong = guestWrong.map(item => {
            if (item.question_id === q.question_id || item.question_text === q.question_text) {
              return { ...item, ai_explanation: data.explanation };
            }
            return item;
          });
          localStorage.setItem('chronos_guest_wrong_problems', JSON.stringify(updatedGuestWrong));
        }
      } catch (err) {
        console.error(err);
        setCurrentExplanation('Failed to generate tutor explanation. Please review the correct answer.');
      } finally {
        setExplanationLoading(false);
      }
    }
  };

  // Next question / Finish test
  const handleTestNext = async () => {
    if (currentTestIndex < testQuestions.length - 1) {
      setCurrentTestIndex(prev => prev + 1);
      setUserSelectedAnswer('');
      setSubmittedCurrent(false);
      setCurrentExplanation('');
    } else {
      // End of test - save spaced repetition metrics
      const reviews = testQuestions.map((q, idx) => ({
        questionId: q.question_id,
        isCorrect: testResults[idx]
      }));

      if (user) {
        try {
          await fetch(`/api/review?action=submit-results`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: user.user_id,
              reviews
            })
          });
        } catch (err) {
          console.error("Failed to submit spaced rep updates to server:", err);
        }
      } else {
        // Guest mode SM-2 execution on client
        const guestWrong = JSON.parse(localStorage.getItem('chronos_guest_wrong_problems') || '[]');
        const nextWrong = guestWrong.map(w => {
          const matchIdx = testQuestions.findIndex(t => t.question_id === w.question_id || t.question_text === w.question_text);
          if (matchIdx !== -1) {
            const isCorrect = testResults[matchIdx];
            let repetitions = w.repetitions || 0;
            let interval_days = w.interval_days || 0;
            let ease_factor = w.ease_factor || 2.5;

            if (isCorrect) {
              repetitions += 1;
              if (repetitions === 1) {
                interval_days = 1;
              } else if (repetitions === 2) {
                interval_days = 6;
              } else {
                interval_days = Math.round(interval_days * ease_factor);
              }
              ease_factor = ease_factor + 0.1;
            } else {
              repetitions = 0;
              interval_days = 1;
              ease_factor = Math.max(1.3, ease_factor - 0.2);
            }
            ease_factor = Math.min(3.0, Math.max(1.3, ease_factor));

            const nextReview = new Date();
            nextReview.setDate(nextReview.getDate() + interval_days);

            return {
              ...w,
              repetitions,
              interval_days,
              ease_factor,
              next_review_at: nextReview.toISOString()
            };
          }
          return w;
        });
        localStorage.setItem('chronos_guest_wrong_problems', JSON.stringify(nextWrong));
      }

      setTestMode('summary');
    }
  };

  const getSpacedRepLabel = (q) => {
    const reps = q.spaced_rep?.repetitions || q.repetitions || 0;
    const box = getBoxNumber(reps);
    const due = isQuestionDue(q);

    if (due) {
      return (
        <span className="badge badge-due" style={{ background: 'var(--danger-glass)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          Box {box} • Due Now
        </span>
      );
    }

    const nextReview = q.spaced_rep?.next_review_at || q.next_review_at;
    const diffMs = new Date(nextReview).getTime() - now;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    
    return (
      <span className="badge badge-scheduled" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
        Box {box} • Scheduled in {diffDays} {diffDays === 1 ? 'day' : 'days'}
      </span>
    );
  };

  // Render review test session
  if (testMode === 'test') {
    const q = testQuestions[currentTestIndex];
    const isMCQ = q.question_type === 'multiple_choice';

    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px 10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h3>Review Practice Mode</h3>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Question {currentTestIndex + 1} of {testQuestions.length}
          </span>
        </div>

        <div className="glass-panel animate-fade-in" style={{ padding: '2rem', marginBottom: '1.5rem', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.15)', color: 'var(--accent-primary)' }}>
              {q.subject}
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Topic: {q.topic}
            </span>
          </div>

          <div style={{ fontSize: '1.1rem', marginBottom: '2rem', lineHeight: '1.6' }}>
            <ChemicalText text={q.question_text} />
          </div>

          {isMCQ && q.options && Array.isArray(q.options) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
              {q.options.map((opt, i) => {
                const label = ['A', 'B', 'C', 'D'][i] || String(i + 1);
                const isSelected = userSelectedAnswer === label;
                return (
                  <button
                    key={i}
                    disabled={submittedCurrent}
                    onClick={() => setUserSelectedAnswer(label)}
                    style={{
                      textAlign: 'left',
                      padding: '1rem 1.5rem',
                      borderRadius: 'var(--radius-md)',
                      border: isSelected ? '2px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.08)',
                      background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                      color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                      cursor: submittedCurrent ? 'default' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      fontSize: '1rem',
                      width: '100%',
                      transition: 'var(--transition-fast)'
                    }}
                  >
                    <span style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: isSelected ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)',
                      color: isSelected ? 'white' : 'var(--text-primary)',
                      fontWeight: 'bold',
                      fontSize: '0.9rem'
                    }}>
                      {label}
                    </span>
                    <span style={{ flex: 1 }}><ChemicalText text={opt} /></span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Your Answer:
              </label>
              <input
                type="text"
                disabled={submittedCurrent}
                value={userSelectedAnswer}
                onChange={(e) => setUserSelectedAnswer(e.target.value)}
                placeholder="Enter your final answer here"
                style={{
                  width: '100%',
                  padding: 'var(--input-padding)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255, 255, 255, 0.02)',
                  color: 'var(--text-primary)',
                  fontSize: '1.05rem',
                  outline: 'none'
                }}
              />
            </div>
          )}

          {!submittedCurrent ? (
            <button
              className="btn btn-primary"
              disabled={!userSelectedAnswer.trim()}
              onClick={handleTestSubmit}
              style={{ width: '100%', padding: '1rem', display: 'flex', justifySelf: 'center', justifyContent: 'center', gap: '8px' }}
            >
              Submit Answer
            </button>
          ) : (
            <div className="animate-fade-in" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '1.5rem', marginTop: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                {currentIsCorrect ? (
                  <>
                    <CheckCircle color="var(--success)" size={24} />
                    <span style={{ color: 'var(--success)', fontWeight: 'bold', fontSize: '1.1rem' }}>Correct!</span>
                  </>
                ) : (
                  <>
                    <AlertCircle color="var(--danger)" size={24} />
                    <span style={{ color: 'var(--danger)', fontWeight: 'bold', fontSize: '1.1rem' }}>Incorrect</span>
                  </>
                )}
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.02)', borderRadius: 'var(--radius-md)', padding: '1rem 1.5rem', marginBottom: '1.5rem', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Correct Answer:</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                  {q.correct_answer}
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Explanation:</div>
                {explanationLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1rem 0' }}>
                    <Loader2 className="animate-spin" size={16} />
                    <span style={{ color: 'var(--text-secondary)' }}>Generating AI explanation...</span>
                  </div>
                ) : (
                  <div style={{ background: 'rgba(99, 102, 241, 0.04)', borderRadius: 'var(--radius-md)', padding: '1.2rem', border: '1px solid rgba(99, 102, 241, 0.1)', lineHeight: '1.6', fontSize: '0.95rem' }}>
                    <ChemicalText text={currentExplanation} />
                  </div>
                )}
              </div>

              <button
                className="btn btn-outline"
                onClick={handleTestNext}
                style={{ width: '100%', padding: '1rem', display: 'flex', justifyContent: 'center' }}
              >
                {currentTestIndex < testQuestions.length - 1 ? 'Next Question' : 'Finish Session'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render review test summary
  if (testMode === 'summary') {
    const score = testResults.filter(Boolean).length;
    return (
      <div style={{ maxWidth: '600px', margin: '4rem auto', padding: '0 10px', textAlign: 'center' }}>
        <div className="glass-panel animate-fade-in" style={{ padding: '4rem 2rem' }}>
          <BookOpenCheck size={64} color="var(--accent-primary)" style={{ margin: '0 auto 1.5rem' }} />
          <h2 className="text-gradient" style={{ marginBottom: '1rem' }}>Review Session Completed!</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '1.1rem' }}>
            You reviewed {testQuestions.length} questions and got <strong>{score}</strong> correct.
          </p>

          <div style={{
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(255,255,255,0.08)',
            padding: '1.5rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '0.5rem',
            maxWidth: '400px',
            margin: '0 auto 2.5rem'
          }}>
            {testResults.map((r, i) => (
              <div
                key={i}
                style={{
                  height: '40px',
                  borderRadius: 'var(--radius-sm)',
                  background: r ? 'var(--success-glass)' : 'var(--danger-glass)',
                  border: r ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                  color: r ? 'var(--success)' : 'var(--danger)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold'
                }}
              >
                Q{i + 1}
              </div>
            ))}
          </div>

          <button
            className="btn btn-primary"
            onClick={() => {
              setTestMode(false);
              setLoading(true);
              setReloadTrigger(prev => prev + 1);
            }}
            style={{ padding: '0.8rem 2rem' }}
          >
            Back to Review Home
          </button>
        </div>
      </div>
    );
  }

  // Render wrong questions list view
  const dueCount = wrongQuestions.filter(isQuestionDue).length;

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px 10px' }}>
      <button
        onClick={onBack}
        className="btn btn-outline"
        style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}
      >
        <ArrowLeft size={16} /> Back to Setup
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
        <div>
          <h2 className="text-gradient">Spaced Repetition Review</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '0.25rem' }}>
            Review past mistakes and lock in key concepts using scheduled practice.
          </p>
        </div>

        {wrongQuestions.length > 0 && (
          <button
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.8rem 1.5rem', boxShadow: 'var(--shadow-glow)' }}
            onClick={startReviewTest}
          >
            <Play size={16} fill="white" />
            Start Session (10 Questions)
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6rem 0' }}>
          <Loader2 className="animate-spin text-gradient" size={48} />
          <h4 style={{ marginTop: '1.5rem', color: 'var(--text-secondary)' }}>Loading wrong questions...</h4>
        </div>
      ) : error ? (
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', border: '1px solid var(--danger-glass)' }}>
          <AlertCircle color="var(--danger)" size={48} style={{ margin: '0 auto 1rem' }} />
          <h3 style={{ color: 'var(--danger)', marginBottom: '0.5rem' }}>Oops!</h3>
          <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
          <button className="btn btn-outline" style={{ marginTop: '1.5rem' }} onClick={() => { setLoading(true); setReloadTrigger(prev => prev + 1); }}>
            Try Again
          </button>
        </div>
      ) : wrongQuestions.length === 0 ? (
        <div className="glass-panel" style={{ padding: '5rem 2rem', textAlign: 'center' }}>
          <Inbox size={64} color="var(--text-muted)" style={{ margin: '0 auto 1.5rem' }} />
          <h3>All Clear!</h3>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '0.5rem auto 0' }}>
            You haven't gotten any questions wrong yet. Complete standard exams and your incorrect answers will automatically appear here!
          </p>
        </div>
      ) : (
        <div>
          {/* Dashboard Stats */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem'
          }}>
            <div className="glass-panel" style={{ padding: '1.2rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total Mistakes</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{wrongQuestions.length}</div>
            </div>
            <div className="glass-panel" style={{ padding: '1.2rem', textAlign: 'center', border: dueCount > 0 ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Due for Review</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: dueCount > 0 ? 'var(--danger)' : 'var(--success)' }}>{dueCount}</div>
            </div>
            <div className="glass-panel" style={{ padding: '1.2rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Mastery Box 5</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--success)' }}>
                {wrongQuestions.filter(q => getBoxNumber(q.spaced_rep?.repetitions || q.repetitions) === 5).length}
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="glass-panel" style={{ padding: '1rem var(--card-padding)', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: '500' }}>Filter Results:</span>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Subject:</span>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.35rem 1.5rem 0.35rem 0.75rem',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="all">All Subjects</option>
                {subjectsList.map((s, i) => (
                  <option key={i} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Topic:</span>
              <select
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.35rem 1.5rem 0.35rem 0.75rem',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="all">All Topics</option>
                {topicsList.map((t, i) => (
                  <option key={i} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Tag:</span>
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.35rem 1.5rem 0.35rem 0.75rem',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="all">All Tags</option>
                {tagsList.map((t, i) => (
                  <option key={i} value={t}>{t === 'silly' ? 'Silly Mistake' : t === 'concept' ? 'Concept Problem' : t === 'time' ? 'Out of Time' : t}</option>
                ))}
              </select>
            </div>

            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
              Showing {filteredWrong.length} of {wrongQuestions.length}
            </span>
          </div>

          {/* List of wrong questions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {filteredWrong.map((q, idx) => {
              return (
                <div key={idx} className="glass-panel" style={{ padding: '1.5rem', transition: 'var(--transition-fast)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                      <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.15)', color: 'var(--accent-primary)' }}>
                        {q.subject}
                      </span>
                      <span className="badge" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)' }}>
                        Topic: {q.topic}
                      </span>
                      {q.tag && (
                        <span className="badge" style={{
                          background: q.tag === 'silly' ? 'rgba(245, 158, 11, 0.15)' : q.tag === 'concept' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.06)',
                          color: q.tag === 'silly' ? 'var(--warning)' : q.tag === 'concept' ? 'var(--danger)' : 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <Tag size={10} /> Tagged: {q.tag === 'silly' ? 'Silly Mistake' : q.tag === 'concept' ? 'Concept Problem' : q.tag === 'time' ? 'Out of Time' : q.tag}
                        </span>
                      )}
                    </div>
                    <div>
                      {getSpacedRepLabel(q)}
                    </div>
                  </div>

                  <div style={{ fontSize: '1rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
                    <ChemicalText text={q.question_text} />
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '1rem',
                    marginBottom: '1.5rem',
                    background: 'rgba(255, 255, 255, 0.02)',
                    padding: '1rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(255,255,255,0.04)'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Your Attempted Answer:</div>
                      <div style={{ fontSize: '1rem', fontWeight: '500', color: 'var(--danger)' }}>{q.user_answer || 'No answer'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Correct Answer:</div>
                      <div style={{ fontSize: '1rem', fontWeight: '500', color: 'var(--success)' }}>{q.correct_answer}</div>
                    </div>
                  </div>

                  {q.ai_explanation ? (
                    <details style={{ cursor: 'pointer' }}>
                      <summary style={{ fontSize: '0.9rem', color: 'var(--accent-primary)', outline: 'none', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '500' }}>
                        View Tutor Solution / Explanation
                      </summary>
                      <div style={{
                        marginTop: '1rem',
                        padding: '1.2rem',
                        borderRadius: 'var(--radius-md)',
                        background: 'rgba(99, 102, 241, 0.03)',
                        border: '1px solid rgba(99, 102, 241, 0.08)',
                        lineHeight: '1.6',
                        fontSize: '0.95rem',
                        cursor: 'default'
                      }}>
                        <ChemicalText text={q.ai_explanation} />
                      </div>
                    </details>
                  ) : (
                    <button
                      className="btn btn-outline"
                      disabled={loadingExpls[idx]}
                      onClick={() => askExplanationForQuestion(q, idx)}
                      style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      {loadingExpls[idx] ? (
                        <>
                          <Loader2 size={12} className="animate-spin" /> Fetching Explanation...
                        </>
                      ) : (
                        <>
                          <HelpCircle size={14} /> Ask AI Tutor for Explanation
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
