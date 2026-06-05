/* eslint-disable */
import { useState, useEffect, useRef } from 'react';
import { generateProblems } from '../services/gemini';
import { Loader2, Clock, AlertTriangle, ArrowRight, Upload, Type, Image as ImageIcon, ArrowLeft, Pause, Play } from 'lucide-react';
import { ChemicalText, isSmiles, SmilesRenderer } from './ChemicalText';
import { Whiteboard } from './Whiteboard';

// Normalize an answer string for comparison:
// strips $...$ / $$...$$, \text{}, \mathrm{} etc., LaTeX ~, and collapses whitespace
export function normalizeAnswer(str) {
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

export function evaluateKeywordExpression(expression, userAnswer) {
  if (!expression) return false;
  const normalizedAnswer = normalizeAnswer(userAnswer);
  
  // Support single quotes/double quotes and words, retaining parenthesis and logical operators
  const tokens = expression.match(/'[^']+'|"[^"]+"|\(|\)|AND|OR|NOT|[a-zA-Z0-9_.-]+/gi) || [];
  
  const processedTokens = tokens.map(token => {
    const upper = token.toUpperCase();
    if (upper === 'AND') return '&&';
    if (upper === 'OR') return '||';
    if (upper === 'NOT') return '!';
    if (token === '(' || token === ')') return token;
    
    const cleanTerm = token.replace(/^['"]|['"]$/g, '');
    const normTerm = normalizeAnswer(cleanTerm);
    const present = normalizedAnswer.includes(normTerm);
    return present ? 'true' : 'false';
  });
  
  const jsExpression = processedTokens.join(' ');
  try {
    const safeRegex = /^(?:true|false|&&|\|\||!|\(|\)|\s)+$/;
    if (!safeRegex.test(jsExpression)) {
      return false;
    }
    return !!(new Function(`return (${jsExpression})`)());
  } catch (e) {
    console.error("Failed to evaluate keyword expression:", jsExpression, e);
    return false;
  }
}

function isAnswerCorrect(prob, ans) {
  if (!ans) return false;
  if (prob.type === 'multiple_choice' && prob.options && Array.isArray(prob.options)) {
    const getOptionIndex = (val, opts) => {
      const letterIdx = ['A', 'B', 'C', 'D'].indexOf(String(val).trim().toUpperCase());
      if (letterIdx !== -1) return letterIdx;
      return opts.findIndex(o => normalizeAnswer(o) === normalizeAnswer(val));
    };
    const correctIdx = getOptionIndex(prob.answer, prob.options);
    const userIdx = getOptionIndex(ans, prob.options);
    return correctIdx !== -1 && correctIdx === userIdx;
  }
  if (prob.type === 'short_answer' && prob.keywordExpression) {
    return evaluateKeywordExpression(prob.keywordExpression, ans);
  }
  return normalizeAnswer(ans) === normalizeAnswer(prob.answer);
}

export function ExamScreen({ config, onFinish, resumeState }) {
  const isWholeTestMode = config.timeLimitStyle === 'whole_test';
  const recommendedQuestionTime = isWholeTestMode 
    ? Math.floor((config.timeLimitWholeTest * 60) / config.numQuestions) 
    : config.timeLimitPerQuestion;

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(() => 
    resumeState ? resumeState.currentQuestionIndex : 0
  );
  const [problems, setProblems] = useState(() => 
    resumeState ? resumeState.problems : []
  );
  const [loading, setLoading] = useState(() => 
    resumeState ? false : true
  );
  const [currentDifficulty, setCurrentDifficulty] = useState(() => 
    resumeState ? (resumeState.problems[resumeState.currentQuestionIndex]?.difficulty || config.startingDifficulty) : config.startingDifficulty
  );
  const [isPaused, setIsPaused] = useState(false);
  const [totalTimeLeft, setTotalTimeLeft] = useState(() => config.timeLimitWholeTest * 60);
  const [questionTimesLeft, setQuestionTimesLeft] = useState(() => 
    Array(config.numQuestions).fill(isWholeTestMode ? recommendedQuestionTime : config.timeLimitPerQuestion)
  );
  const [answers, setAnswers] = useState(() => 
    resumeState ? resumeState.answers : Array(config.numQuestions).fill('')
  );
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);

  // New Free Response States
  const [workSubmitted, setWorkSubmitted] = useState(false);
  const [submitType, setSubmitType] = useState('whiteboard'); // 'whiteboard', 'image', 'text'
  const [typedWork, setTypedWork] = useState('');
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [whiteboardPreview, setWhiteboardPreview] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [frqSubmissions, setFrqSubmissions] = useState(() => 
    resumeState ? resumeState.frqSubmissions : Array(config.numQuestions).fill(null)
  );

  const timerRef = useRef(null);
  const whiteboardRef = useRef(null);
  const elapsedSecondsRef = useRef(0);
  const currentQuestionEntryTimeRef = useRef(0);
  const questionIntervalsRef = useRef([]);

  const recordActiveInterval = (qIdx) => {
    const start = currentQuestionEntryTimeRef.current;
    const end = elapsedSecondsRef.current;
    if (end > start) {
      if (!questionIntervalsRef.current[qIdx]) {
        questionIntervalsRef.current[qIdx] = [];
      }
      questionIntervalsRef.current[qIdx].push({ start, end });
    }
    currentQuestionEntryTimeRef.current = end;
  };

  useEffect(() => {
    // Reset question-specific submission states on navigation
    setWorkSubmitted(false);
    setSubmitType('whiteboard');
    setTypedWork('');
    setUploadedImage(null);
    setUploadedFileName('');
    setWhiteboardPreview('');
  }, [currentQuestionIndex]);

  const problem = problems[currentQuestionIndex];

  const fetchProblems = async () => {
    setLoading(true);
    setError(null);

    const sharedQuestions = config.sharedQuestions || [];
    const totalCount = config.numQuestions;
    const aiCount = totalCount - sharedQuestions.length;

    setProblems(sharedQuestions);
    setCurrentQuestionIndex(0);
    elapsedSecondsRef.current = 0;
    currentQuestionEntryTimeRef.current = 0;
    questionIntervalsRef.current = Array.from({ length: totalCount }, () => []);

    if (sharedQuestions.length > 0) {
      setCurrentDifficulty(sharedQuestions[0].difficulty || config.startingDifficulty);
      setLoading(false);
    }

    if (aiCount <= 0) {
      return;
    }

    let firstReceived = false;

    try {
      const generated = await generateProblems(
        aiCount,
        config.startingDifficulty,
        config.subject,
        config.username || 'default_user',
        (question, index) => {
          if (index < aiCount) {
            setProblems(prev => {
              if (prev.length >= totalCount) return prev;
              return [...prev, question];
            });
          }

          if (!firstReceived) {
            firstReceived = true;
            if (sharedQuestions.length === 0) {
              setCurrentDifficulty(question.difficulty || config.startingDifficulty);
              setLoading(false);
            }
          }
        },
        config.examFormat === 'free_response',
        config.examFormat || 'mix',
        config.lessonTitle,
        config.lessonDescription
      );

      if (generated && generated.length > 0) {
        setProblems(prev => {
          const shared = prev.slice(0, sharedQuestions.length);
          return [...shared, ...generated].slice(0, totalCount);
        });
      }
    } catch (err) {
      if (sharedQuestions.length === 0) {
        setError("Failed to fetch problems. Retrying...");
        setTimeout(() => fetchProblems(), 2000);
      } else {
        console.error("Failed to generate remainder of problems:", err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!resumeState) {
      fetchProblems();
    }
  }, []);

  useEffect(() => {
    if (!loading && problem && window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise();
    }
  }, [loading, currentQuestionIndex, problem]);

  useEffect(() => {
    if (config.timeLimitStyle === 'none' || loading || !problem || workSubmitted || isPaused) return;

    if (isWholeTestMode && totalTimeLeft <= 0) {
      handleGlobalTimeUp();
      return;
    }

    const timeForThisQuestion = questionTimesLeft[currentQuestionIndex];
    if (!isWholeTestMode && timeForThisQuestion <= 0) return;

    timerRef.current = setInterval(() => {
      elapsedSecondsRef.current += 1;
      if (isWholeTestMode) {
        setTotalTimeLeft((prevTotal) => {
          if (prevTotal <= 1) {
            clearInterval(timerRef.current);
            handleGlobalTimeUp();
            return 0;
          }
          return prevTotal - 1;
        });
      }

      setQuestionTimesLeft((prevTimes) => {
        const next = [...prevTimes];
        const currentVal = next[currentQuestionIndex];
        if (isWholeTestMode) {
          next[currentQuestionIndex] = currentVal - 1;
        } else {
          if (currentVal <= 1) {
            clearInterval(timerRef.current);
            handleTimeUp();
            next[currentQuestionIndex] = 0;
          } else {
            next[currentQuestionIndex] = currentVal - 1;
          }
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [loading, currentQuestionIndex, problem, workSubmitted, totalTimeLeft, isPaused]);

  useEffect(() => {
    if (config.timeLimitStyle === 'none' && problems.length > 0 && !loading && config.username && config.username !== 'default_user') {
      fetch('/api/exams?route=save-active-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: config.username,
          examId: config.examId,
          subject: config.subject,
          config,
          problems,
          answers,
          frqSubmissions,
          currentQuestionIndex
        })
      }).catch(err => console.error("Error auto-saving active exam to BigQuery:", err));
    }
  }, [answers, frqSubmissions, currentQuestionIndex, problems, loading, config]);

  const handleTimeUp = () => {
    if (problem && problem.type === 'free_response') {
      handleAutoTimeoutSubmit();
    } else if (config.stressMode === 'strict') {
      submitStrictAnswer(true);
    }
  };

  const handleGlobalTimeUp = async () => {
    recordActiveInterval(currentQuestionIndex);
    clearInterval(timerRef.current);
    alert("Test time limit reached! Auto-submitting your exam.");

    let activeQuestionFinalVal = answers[currentQuestionIndex] || '';
    let imagePayload = null;
    if (problems[currentQuestionIndex]?.type === 'free_response') {
      if (whiteboardRef.current) {
        imagePayload = whiteboardRef.current.getDataURL();
      }
      if (imagePayload) {
        activeQuestionFinalVal = '[Drawing Submission]';
      } else if (!activeQuestionFinalVal) {
        activeQuestionFinalVal = '[Time Out]';
      }
    }

    const updatedSubmissions = [...frqSubmissions];
    if (problems[currentQuestionIndex]?.type === 'free_response') {
      updatedSubmissions[currentQuestionIndex] = {
        type: 'whiteboard',
        value: imagePayload || activeQuestionFinalVal
      };
    }

    const finalAnswers = [...answers];
    finalAnswers[currentQuestionIndex] = activeQuestionFinalVal || '[Time Out]';

    const finalResults = problems.map((prob, idx) => {
      const userAnswer = finalAnswers[idx] || '';
      const intervals = questionIntervalsRef.current[idx] || [];
      const timeSpent = intervals.length > 0
        ? intervals.reduce((acc, inv) => acc + (inv.end - inv.start), 0)
        : (isWholeTestMode 
            ? recommendedQuestionTime - (questionTimesLeft[idx] || 0)
            : config.timeLimitPerQuestion - questionTimesLeft[idx]);
      const isTimeout = idx === currentQuestionIndex || !userAnswer;
      const isCorrect = prob.type !== 'free_response' && !isTimeout && isAnswerCorrect(prob, userAnswer);
      
      return {
        ...prob,
        userAnswer: userAnswer || '[Time Out]',
        isCorrect,
        timeSpent: Math.max(0, timeSpent),
        intervals,
        timeOut: isTimeout,
        difficultyAtTime: prob.difficulty || config.startingDifficulty,
        frqSubmission: idx === currentQuestionIndex ? updatedSubmissions[currentQuestionIndex] : frqSubmissions[idx]
      };
    });

    onFinish(finalResults);
  };

  const handleAutoTimeoutSubmit = () => {
    recordActiveInterval(currentQuestionIndex);
    let finalValue = '[Time Out]';
    let imagePayload = null;
    if (whiteboardRef.current) {
      imagePayload = whiteboardRef.current.getDataURL();
    }

    if (imagePayload) {
      finalValue = '[Drawing Submission]';
    }

    const updatedSubmissions = [...frqSubmissions];
    updatedSubmissions[currentQuestionIndex] = {
      type: 'whiteboard',
      value: imagePayload || '[Time Out]'
    };
    setFrqSubmissions(updatedSubmissions);

    const updatedAnswers = [...answers];
    updatedAnswers[currentQuestionIndex] = finalValue;
    setAnswers(updatedAnswers);

    const isLast = currentQuestionIndex + 1 >= config.numQuestions;
    if (isLast) {
      handleFinishExam(null, updatedAnswers, updatedSubmissions);
    } else {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handleConfirmFRQSubmit = () => {
    recordActiveInterval(currentQuestionIndex);
    let finalValue = '';
    let imagePayload = null;

    if (submitType === 'whiteboard') {
      if (whiteboardRef.current) {
        imagePayload = whiteboardRef.current.getDataURL() || whiteboardPreview;
      } else {
        imagePayload = whiteboardPreview;
      }
      finalValue = '[Drawing Submission]';
    } else if (submitType === 'image') {
      imagePayload = uploadedImage;
      finalValue = '[Image Submission]';
    } else {
      finalValue = typedWork;
    }

    // Save metadata
    const updatedSubmissions = [...frqSubmissions];
    updatedSubmissions[currentQuestionIndex] = {
      type: submitType,
      value: imagePayload || finalValue
    };
    setFrqSubmissions(updatedSubmissions);

    const updatedAnswers = [...answers];
    updatedAnswers[currentQuestionIndex] = finalValue;
    setAnswers(updatedAnswers);

    const isLast = currentQuestionIndex + 1 >= config.numQuestions;
    
    if (config.stressMode === 'strict') {
      clearInterval(timerRef.current);
      const timeSpent = config.timeLimitPerQuestion - questionTimesLeft[currentQuestionIndex];
      
      const questionResult = {
        ...problem,
        userAnswer: finalValue,
        isCorrect: false, // graded at the end
        timeSpent,
        timeOut: false,
        difficultyAtTime: problem.difficulty || currentDifficulty,
        frqSubmission: {
          type: submitType,
          value: imagePayload || finalValue
        }
      };

      const updatedResults = [...results, questionResult];
      setResults(updatedResults);

      if (isLast) {
        handleFinishExam(updatedResults, updatedAnswers, updatedSubmissions);
      } else {
        const nextIndex = currentQuestionIndex + 1;
        setCurrentQuestionIndex(nextIndex);
      }
    } else {
      if (isLast) {
        handleFinishExam(null, updatedAnswers, updatedSubmissions);
      } else {
        const nextIndex = currentQuestionIndex + 1;
        setCurrentQuestionIndex(nextIndex);
      }
    }
  };

  const handleFinishExam = (strictResults = null, overrideAnswers = null, overrideSubmissions = null) => {
    recordActiveInterval(currentQuestionIndex);
    clearInterval(timerRef.current);
    
    let finalResults;
    if (strictResults) {
      finalResults = strictResults;
    } else {
      const activeAnswers = overrideAnswers || answers;
      const activeSubmissions = overrideSubmissions || frqSubmissions;
      finalResults = problems.map((prob, idx) => {
        const userAnswer = activeAnswers[idx] || '';
        const intervals = questionIntervalsRef.current[idx] || [];
        const timeSpent = intervals.reduce((acc, inv) => acc + (inv.end - inv.start), 0);
        const isTimeout = isWholeTestMode 
          ? (totalTimeLeft <= 0)
          : (questionTimesLeft[idx] <= 0);
        const isCorrect = prob.type === 'free_response' 
          ? false 
          : (!isTimeout && isAnswerCorrect(prob, userAnswer));
        
        return {
          ...prob,
          userAnswer: isTimeout && !userAnswer ? '[Time Out]' : userAnswer,
          isCorrect,
          timeSpent,
          intervals,
          timeOut: isTimeout,
          difficultyAtTime: prob.difficulty || config.startingDifficulty,
          frqSubmission: activeSubmissions[idx] || null
        };
      });
    }
    
    onFinish(finalResults);
  };

  const handleReadyToSubmit = () => {
    if (whiteboardRef.current) {
      setWhiteboardPreview(whiteboardRef.current.getDataURL());
    }
    setWorkSubmitted(true);
  };

  const submitStrictAnswer = (isTimeout = false) => {
    recordActiveInterval(currentQuestionIndex);
    clearInterval(timerRef.current);
    const activeAnswer = answers[currentQuestionIndex] || '';
    const intervals = questionIntervalsRef.current[currentQuestionIndex] || [];
    const timeSpent = intervals.reduce((acc, inv) => acc + (inv.end - inv.start), 0);
    const isCorrect = !isTimeout && isAnswerCorrect(problem, activeAnswer);

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
      intervals,
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

  const handleAnswerSelect = (opt) => {
    setAnswers(prev => {
      const next = [...prev];
      next[currentQuestionIndex] = opt;
      return next;
    });
  };

  if (loading) {
    return (
      <div className="glass-panel" style={{ padding: 'var(--panel-padding-lg)', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
        <Loader2 className="animate-spin text-gradient" size={48} style={{ margin: '0 auto 1rem' }} />
        <h3>Generating Problems...</h3>
        <p style={{ color: 'var(--text-secondary)' }}>Preparing exam with {config.numQuestions} questions</p>
        {error && <p style={{ color: 'var(--danger)', marginTop: '1rem' }}>{error}</p>}
      </div>
    );
  }

  if (transcribing) {
    return (
      <div className="glass-panel animate-fade-in" style={{ padding: 'var(--panel-padding-lg)', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
        <Loader2 className="animate-spin text-gradient" size={48} style={{ margin: '0 auto 1rem' }} />
        <h3>AI Transcribing Your Work...</h3>
        <p style={{ color: 'var(--text-secondary)' }}>Translating your drawings/uploaded work into textual explanations.</p>
      </div>
    );
  }

  if (isPaused) {
    return (
      <div className="glass-panel animate-fade-in" style={{ 
        padding: 'var(--panel-padding-lg)', 
        textAlign: 'center', 
        maxWidth: '600px', 
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '300px',
        gap: '1.5rem'
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)'
        }}>
          <Pause size={32} style={{ color: 'var(--accent-primary)' }} />
        </div>
        <div>
          <h2 className="text-gradient" style={{ marginBottom: '0.5rem', fontSize: '1.8rem' }}>Test Paused</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto' }}>
            The exam timers have been suspended and the test content is hidden. Click below to resume your test.
          </p>
        </div>
        <button 
          className="btn btn-primary" 
          onClick={() => setIsPaused(false)}
          style={{ padding: '0.75rem 2rem', fontSize: '1.1rem', marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 auto' }}
        >
          <Play size={18} /> Resume Test
        </button>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="glass-panel" style={{ padding: 'var(--panel-padding-lg)', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
        <Loader2 className="animate-spin text-gradient" size={48} style={{ margin: '0 auto 1rem' }} />
        <h3>Loading next question...</h3>
        <p style={{ color: 'var(--text-secondary)' }}>Streaming question {currentQuestionIndex + 1} of {config.numQuestions}</p>
      </div>
    );
  }

  const activeTimeLeft = questionTimesLeft[currentQuestionIndex] ?? (isWholeTestMode ? recommendedQuestionTime : config.timeLimitPerQuestion);
  const isTimeOut = activeTimeLeft <= 0;
  const isLowTime = activeTimeLeft <= 10;
  const isHidden = config.stressMode === 'hidden' && !isLowTime;
  const isDynamicStress = config.stressMode === 'dynamic' && isLowTime;

  const totalTime = isWholeTestMode ? recommendedQuestionTime : config.timeLimitPerQuestion;
  const percentage = Math.max(0, Math.min(100, (activeTimeLeft / totalTime) * 100));

  let progressColor = 'var(--success)';
  if (percentage <= 25) {
    progressColor = 'var(--danger)';
  } else if (percentage <= 55) {
    progressColor = 'var(--warning)';
  }

  const activeAnswer = answers[currentQuestionIndex] || '';
  const isEditingLocked = isWholeTestMode ? (totalTimeLeft <= 0) : isTimeOut;

  const formatTime = (seconds) => {
    if (seconds <= 0) return '0:00';
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
  };

  return (
    <div className="glass-panel animate-fade-in" style={{ padding: 'var(--panel-padding)', maxWidth: '800px', margin: '0 auto' }}>
      
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={() => setIsPaused(true)}
            className="btn btn-outline"
            style={{
              padding: '0.4rem 0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.9rem',
              borderColor: 'rgba(255, 255, 255, 0.15)',
              background: 'rgba(255, 255, 255, 0.02)'
            }}
          >
            <Pause size={14} /> Pause
          </button>

          {isWholeTestMode && (
            <div className="glass-panel" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.4rem 0.8rem',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.9rem'
            }}>
              <Clock size={14} color="var(--accent-secondary)" />
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Exam:</span>
              <strong style={{ color: totalTimeLeft <= 60 ? 'var(--danger)' : 'var(--text-primary)' }}>
                {formatTime(totalTimeLeft)}
              </strong>
            </div>
          )}
          
          <div className="glass-panel" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.4rem 0.8rem',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.9rem'
          }}>
            {config.timeLimitStyle === 'none' ? (
              <>
                <Clock size={14} color="var(--accent-secondary)" />
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Mode:</span>
                <strong style={{ color: 'var(--text-primary)' }}>Untimed</strong>
              </>
            ) : isHidden ? (
              <span style={{ color: 'var(--text-muted)' }}>Timer Hidden</span>
            ) : (
              <>
                {isEditingLocked ? <AlertTriangle size={14} color="var(--danger)" /> : <Clock size={14} color="var(--accent-primary)" />}
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Question:</span>
                <strong style={{ color: isEditingLocked ? 'var(--danger)' : 'var(--text-primary)' }}>
                  {isWholeTestMode 
                    ? `${formatTime(activeTimeLeft)} ${isTimeOut ? '(Overrun)' : ''}`
                    : (isTimeOut ? 'Time Out' : formatTime(activeTimeLeft))
                  }
                </strong>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Timer Progress Bar */}
      {config.timeLimitStyle !== 'none' && !isHidden && (
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

      {isEditingLocked && (
        <div style={{ 
          background: 'var(--danger-glass)', 
          border: '1px solid var(--danger)', 
          borderRadius: 'var(--radius-sm)', 
          padding: 'var(--input-padding)', 
          marginBottom: '1.5rem', 
          color: 'var(--danger)', 
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <AlertTriangle size={18} /> Time limit reached. Edits are locked.
        </div>
      )}

      {!isEditingLocked && isTimeOut && isWholeTestMode && (
        <div style={{ 
          background: 'rgba(245, 158, 11, 0.1)', 
          border: '1px solid var(--warning)', 
          borderRadius: 'var(--radius-sm)', 
          padding: 'var(--input-padding)', 
          marginBottom: '1.5rem', 
          color: 'var(--warning)', 
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <AlertTriangle size={18} /> Recommended question time limit exceeded. You can still modify and submit your work.
        </div>
      )}

      {problem.type === 'free_response' ? (
        workSubmitted ? (
          <div>
            <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
              <h3 className="text-gradient" style={{ marginBottom: '0.5rem' }}>Select Submission Method</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Confirm how you would like to submit your solution for Question {currentQuestionIndex + 1}.</p>
            </div>

            {/* Tabs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '2rem' }}>
              <button
                className={`btn ${submitType === 'whiteboard' ? 'btn-primary' : 'btn-outline'}`}
                style={{ flexDirection: 'column', padding: '1rem 0.5rem', height: 'auto', gap: '0.5rem' }}
                onClick={() => setSubmitType('whiteboard')}
              >
                <ImageIcon size={24} />
                <span style={{ fontSize: '0.9rem' }}>Submit Whiteboard</span>
              </button>
              <button
                className={`btn ${submitType === 'image' ? 'btn-primary' : 'btn-outline'}`}
                style={{ flexDirection: 'column', padding: '1rem 0.5rem', height: 'auto', gap: '0.5rem' }}
                onClick={() => setSubmitType('image')}
              >
                <Upload size={24} />
                <span style={{ fontSize: '0.9rem' }}>Upload Image</span>
              </button>
              <button
                className={`btn ${submitType === 'text' ? 'btn-primary' : 'btn-outline'}`}
                style={{ flexDirection: 'column', padding: '1rem 0.5rem', height: 'auto', gap: '0.5rem' }}
                onClick={() => setSubmitType('text')}
              >
                <Type size={24} />
                <span style={{ fontSize: '0.9rem' }}>Type It Out</span>
              </button>
            </div>

            {/* Tab Content */}
            <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--bg-glass-border)', borderRadius: 'var(--radius-md)', padding: 'var(--card-padding)', marginBottom: '2rem' }}>
              {submitType === 'whiteboard' && (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>Your whiteboard drawing preview:</p>
                  {whiteboardPreview ? (
                    <img 
                      src={whiteboardPreview} 
                      alt="Whiteboard Preview" 
                      style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--bg-glass-border)' }} 
                    />
                  ) : (
                    <p style={{ color: 'var(--text-muted)' }}>No drawing detected.</p>
                  )}
                </div>
              )}

              {submitType === 'image' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ border: '2px dashed var(--bg-glass-border)', borderRadius: 'var(--radius-md)', padding: 'var(--panel-padding)', textAlign: 'center', cursor: 'pointer', position: 'relative' }}>
                    <input 
                      type="file" 
                      accept="image/*" 
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          setUploadedFileName(file.name);
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            setUploadedImage(event.target.result);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    <Upload size={32} style={{ color: 'var(--accent-primary)', marginBottom: '0.5rem', margin: '0 auto' }} />
                    <p style={{ fontSize: '0.9rem' }}>{uploadedFileName || "Click or drag file to upload work image"}</p>
                  </div>
                  {uploadedImage && (
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Image Preview:</p>
                      <img 
                        src={uploadedImage} 
                        alt="Uploaded Preview" 
                        style={{ maxWidth: '100%', maxHeight: '180px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--bg-glass-border)' }} 
                      />
                    </div>
                  )}
                </div>
              )}

              {submitType === 'text' && (
                <div>
                  <textarea
                    placeholder="Type your equations, solution process, explanation, and final answer here..."
                    className="input-field"
                    style={{ width: '100%', height: '150px', resize: 'vertical' }}
                    value={typedWork}
                    onChange={(e) => setTypedWork(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button 
                className="btn btn-outline" 
                onClick={() => setWorkSubmitted(false)}
              >
                <ArrowLeft size={18} /> Edit Drawing
              </button>
              
              <button 
                className="btn btn-primary" 
                onClick={handleConfirmFRQSubmit}
                disabled={
                  isEditingLocked ||
                  (submitType === 'image' && !uploadedImage) ||
                  (submitType === 'text' && !typedWork.trim())
                }
              >
                Confirm & Submit <ArrowRight size={18} />
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: '2rem', fontSize: '1.2rem', lineHeight: '1.6' }}>
              <p><ChemicalText text={problem.question} theme="dark" /></p>
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <span style={{ display: 'block', marginBottom: '0.75rem', fontWeight: '500', color: 'var(--text-secondary)' }}>Show Your Process / Explanation:</span>
              <Whiteboard ref={whiteboardRef} />
            </div>

            <button 
              className="btn btn-primary" 
              style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }} 
              onClick={handleReadyToSubmit}
              disabled={isEditingLocked}
            >
              Ready to submit
            </button>
          </div>
        )
      ) : (
        <>
          <div style={{ marginBottom: '2rem', fontSize: '1.2rem', lineHeight: '1.6' }}>
            <p><ChemicalText text={problem.question} theme="dark" /></p>
          </div>

          {problem.type === 'multiple_choice' && problem.options && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
              {problem.options.map((opt, i) => {
                const letter = ['A', 'B', 'C', 'D'][i];
                const isSelected = activeAnswer === opt;
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
                    onClick={() => handleAnswerSelect(opt)}
                    disabled={isEditingLocked}
                  >
                    <span style={{ fontWeight: '700', marginRight: '0.5rem', color: isSelected ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                      {letter}.
                    </span>
                    {isSmiles(opt) ? <SmilesRenderer smiles={opt} width={90} height={90} theme="dark" /> : <ChemicalText text={opt} theme="dark" defaultWidth={90} defaultHeight={90} />}
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
                disabled={isEditingLocked}
              />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {config.stressMode !== 'strict' && (
              <button 
                className="btn btn-outline" 
                disabled={currentQuestionIndex === 0}
                onClick={() => {
                  recordActiveInterval(currentQuestionIndex);
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
                  recordActiveInterval(currentQuestionIndex);
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
        </>
      )}
      
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
