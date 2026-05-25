/* eslint-disable */
import { useState, useEffect, useRef } from 'react';
import { generateProblems } from '../services/gemini';
import { Loader2, Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import { ChemicalText, isSmiles, SmilesRenderer } from './ChemicalText';

// Normalize an answer string for comparison:
// strips $...$ / $$...$$, \text{}, \mathrm{} etc., LaTeX ~, and collapses whitespace
function normalizeAnswer(str) {
  if (!str) return '';
  return str
    .replace(/\$\$([\s\S]*?)\$\$/g, '$1')   // strip $$...$$
    .replace(/\$([\s\S]*?)\$/g, '$1')        // strip $...$
    .replace(/\\(?:text|mathrm|mathbf|mathit|rm|bf)\{([^}]*)\}/g, '$1') // \text{X} -> X
    .replace(/~/g, ' ')                      // LaTeX thin-space -> space
    .replace(/\s+/g, ' ')                    // collapse whitespace
    .trim()
    .toLowerCase();
}

export function ExamScreen({ config, onFinish }) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentDifficulty, setCurrentDifficulty] = useState(config.startingDifficulty);
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [questionTimesLeft, setQuestionTimesLeft] = useState(() => 
    Array(config.numQuestions).fill(config.timeLimitPerQuestion)
  );
  const [answers, setAnswers] = useState(() => 
    Array(config.numQuestions).fill('')
  );
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);

  const timerRef = useRef(null);

  const problem = problems[currentQuestionIndex];

  const fetchProblems = async () => {
    setLoading(true);
    setError(null);
    setProblems([]);
    setCurrentQuestionIndex(0);

    let firstReceived = false;

    try {
      const generated = await generateProblems(
        config.numQuestions,
        config.startingDifficulty,
        config.subject,
        config.username || 'default_user',
        (question, index) => {
          setProblems(prev => [...prev, question]);

          if (!firstReceived) {
            firstReceived = true;
            setCurrentDifficulty(question.difficulty || config.startingDifficulty);
            setLoading(false);
          }
        }
      );

      if (generated && generated.length > 0) {
        setProblems(generated);
      }
    } catch (err) {
      setError("Failed to fetch problems. Retrying...");
      setTimeout(() => fetchProblems(), 2000);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProblems();
  }, []);

  useEffect(() => {
    if (!loading && problem && window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise();
    }
  }, [loading, currentQuestionIndex, problem]);

  useEffect(() => {
    if (loading || !problem) return;

    const timeForThisQuestion = questionTimesLeft[currentQuestionIndex];
    if (timeForThisQuestion <= 0) return;

    timerRef.current = setInterval(() => {
      setQuestionTimesLeft((prev) => {
        const next = [...prev];
        const currentVal = next[currentQuestionIndex];
        if (currentVal <= 1) {
          clearInterval(timerRef.current);
          handleTimeUp();
          next[currentQuestionIndex] = 0;
        } else {
          next[currentQuestionIndex] = currentVal - 1;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [loading, currentQuestionIndex, problem]);

  const handleTimeUp = () => {
    if (config.stressMode === 'strict') {
      submitStrictAnswer(true);
    }
  };

  const submitStrictAnswer = (isTimeout = false) => {
    clearInterval(timerRef.current);
    const activeAnswer = answers[currentQuestionIndex] || '';
    const timeSpent = config.timeLimitPerQuestion - questionTimesLeft[currentQuestionIndex];
    const isCorrect = !isTimeout && normalizeAnswer(activeAnswer) === normalizeAnswer(problem.answer);

    let nextDifficulty = currentDifficulty;
    if (isCorrect) {
      if (timeSpent < config.timeLimitPerQuestion / 2 && currentDifficulty < 10) {
        nextDifficulty += 1;
      }
    } else {
      if (currentDifficulty > 1) {
        nextDifficulty -= 1;
      }
    }

    const questionResult = {
      ...problem,
      userAnswer: isTimeout ? '[Time Out]' : activeAnswer,
      isCorrect,
      timeSpent,
      timeOut: isTimeout,
      difficultyAtTime: problem.difficulty || currentDifficulty
    };

    const updatedResults = [...results, questionResult];
    setResults(updatedResults);

    if (currentQuestionIndex + 1 >= config.numQuestions) {
      onFinish(updatedResults);
    } else {
      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
      if (problems[nextIndex]) {
        setCurrentDifficulty(problems[nextIndex].difficulty || nextDifficulty);
      } else {
        setCurrentDifficulty(nextDifficulty);
      }
    }
  };

  const handleFinishExam = () => {
    clearInterval(timerRef.current);
    
    const finalResults = problems.map((prob, idx) => {
      const userAnswer = answers[idx] || '';
      const timeSpent = config.timeLimitPerQuestion - questionTimesLeft[idx];
      const isTimeout = questionTimesLeft[idx] <= 0;
      const isCorrect = !isTimeout && normalizeAnswer(userAnswer) === normalizeAnswer(prob.answer);
      
      return {
        ...prob,
        userAnswer: isTimeout && !userAnswer ? '[Time Out]' : userAnswer,
        isCorrect,
        timeSpent,
        timeOut: isTimeout,
        difficultyAtTime: prob.difficulty || config.startingDifficulty
      };
    });
    
    onFinish(finalResults);
  };

  const handleAnswerSelect = (opt) => {
    setAnswers(prev => {
      const next = [...prev];
      next[currentQuestionIndex] = opt;
      return next;
    });
  };

  if (loading) {
    return (
      <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
        <Loader2 className="animate-spin text-gradient" size={48} style={{ margin: '0 auto 1rem' }} />
        <h3>Generating Problems...</h3>
        <p style={{ color: 'var(--text-secondary)' }}>Preparing exam with {config.numQuestions} questions</p>
        {error && <p style={{ color: 'var(--danger)', marginTop: '1rem' }}>{error}</p>}
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
        <Loader2 className="animate-spin text-gradient" size={48} style={{ margin: '0 auto 1rem' }} />
        <h3>Loading next question...</h3>
        <p style={{ color: 'var(--text-secondary)' }}>Streaming question {currentQuestionIndex + 1} of {config.numQuestions}</p>
      </div>
    );
  }

  const activeTimeLeft = questionTimesLeft[currentQuestionIndex] ?? config.timeLimitPerQuestion;
  const isTimeOut = activeTimeLeft <= 0;
  const isLowTime = activeTimeLeft <= 10;
  const isHidden = config.stressMode === 'hidden' && !isLowTime;
  const isDynamicStress = config.stressMode === 'dynamic' && isLowTime;

  const totalTime = config.timeLimitPerQuestion;
  const percentage = Math.max(0, Math.min(100, (activeTimeLeft / totalTime) * 100));

  let progressColor = 'var(--success)';
  if (percentage <= 25) {
    progressColor = 'var(--danger)';
  } else if (percentage <= 55) {
    progressColor = 'var(--warning)';
  }

  const activeAnswer = answers[currentQuestionIndex] || '';

  return (
    <div className="glass-panel animate-fade-in" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Question {currentQuestionIndex + 1} of {config.numQuestions}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', background: 'var(--bg-tertiary)', borderRadius: '4px' }}>
              Level {currentDifficulty}
            </span>
          </div>
        </div>

        <div className={`
          ${isHidden ? 'hidden-timer' : ''} 
          ${isDynamicStress ? 'stress-pulse stress-glitch' : ''}
        `} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', fontWeight: '600', color: isLowTime ? 'var(--danger)' : 'var(--text-primary)' }}>
          {isHidden ? (
            <span style={{ color: 'var(--text-muted)' }}>Timer Hidden</span>
          ) : (
            <>
              {isLowTime ? <AlertTriangle size={24} /> : <Clock size={24} />}
              {isTimeOut ? 'Time Out' : `${Math.floor(activeTimeLeft / 60)}:${(activeTimeLeft % 60).toString().padStart(2, '0')}`}
            </>
          )}
        </div>
      </div>

      {/* Timer Progress Bar */}
      {!isHidden && (
        <div style={{ 
          height: '6px', 
          background: 'rgba(255, 255, 255, 0.05)', 
          borderRadius: '3px', 
          overflow: 'hidden', 
          marginBottom: '2rem',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)'
        }}>
          <div style={{ 
            height: '100%', 
            width: `${percentage}%`, 
            background: progressColor, 
            transition: 'width 1s linear, background-color 0.5s ease',
            boxShadow: `0 0 10px ${progressColor}`
          }} />
        </div>
      )}

      {isTimeOut && (
        <div style={{ 
          background: 'var(--danger-glass)', 
          border: '1px solid var(--danger)', 
          borderRadius: 'var(--radius-sm)', 
          padding: '0.75rem 1rem', 
          marginBottom: '1.5rem', 
          color: 'var(--danger)', 
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <AlertTriangle size={18} /> Time limit reached for this question. Edits are locked.
        </div>
      )}

      <div style={{ marginBottom: '2rem', fontSize: '1.2rem', lineHeight: '1.6' }}>
        <p><ChemicalText text={problem.question} theme="dark" /></p>
      </div>

      {problem.type === 'multiple_choice' && problem.options && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
          {problem.options.map((opt, i) => {
            const letter = ['A', 'B', 'C', 'D'][i];
            const isSelected = activeAnswer === letter || activeAnswer === opt;
            return (
              <button 
                key={i} 
                className={`btn btn-outline ${isSelected ? 'selected' : ''}`}
                style={{ 
                  justifyContent: 'flex-start', 
                  background: isSelected ? 'var(--bg-tertiary)' : 'transparent', 
                  borderColor: isSelected ? 'var(--accent-primary)' : '',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  minHeight: '48px',
                  padding: '0.5rem 1rem'
                }}
                onClick={() => handleAnswerSelect(letter)}
                disabled={isTimeOut}
              >
                <span style={{ fontWeight: '700', marginRight: '0.5rem', color: isSelected ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                  {letter}.
                </span>
                {isSmiles(opt) ? <SmilesRenderer smiles={opt} width={90} height={90} theme="dark" /> : <ChemicalText text={opt} theme="dark" />}
              </button>
            );
          })}
        </div>
      )}

      {problem.type === 'short_answer' && (
        <div style={{ marginBottom: '2rem' }}>
          <input 
            type="text" 
            placeholder="Type your answer here..." 
            className="input-field" 
            value={activeAnswer}
            onChange={(e) => handleAnswerSelect(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && activeAnswer.trim() && (config.stressMode === 'strict' ? submitStrictAnswer() : handleFinishExam())}
            disabled={isTimeOut}
          />
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {config.stressMode !== 'strict' && (
          <button 
            className="btn btn-outline" 
            disabled={currentQuestionIndex === 0}
            onClick={() => {
              clearInterval(timerRef.current);
              setCurrentQuestionIndex(prev => prev - 1);
            }}
          >
            Previous
          </button>
        )}
        
        <div style={{ flex: 1 }} />

        {config.stressMode !== 'strict' && currentQuestionIndex + 1 < config.numQuestions && (
          <button 
            className="btn btn-outline" 
            style={{ marginRight: '0.75rem' }}
            onClick={() => {
              clearInterval(timerRef.current);
              setCurrentQuestionIndex(prev => prev + 1);
            }}
          >
            Next
          </button>
        )}

        <button 
          className="btn btn-primary" 
          disabled={config.stressMode === 'strict' && !activeAnswer.trim()}
          onClick={() => {
            if (config.stressMode === 'strict') {
              submitStrictAnswer();
            } else {
              handleFinishExam();
            }
          }}
        >
          {config.stressMode === 'strict' 
            ? (currentQuestionIndex + 1 === config.numQuestions ? 'Finish Exam' : 'Next Question')
            : 'Finish Exam'
          } 
          <ArrowRight size={18} />
        </button>
      </div>
      
      {/* Progress Bar */}
      <div style={{ marginTop: '2rem', height: '4px', background: 'var(--bg-tertiary)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ 
          height: '100%', 
          background: 'var(--accent-primary)', 
          width: `${((currentQuestionIndex) / config.numQuestions) * 100}%`,
          transition: 'width 0.3s ease'
        }} />
      </div>
    </div>
  );
}
