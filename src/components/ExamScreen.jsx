import { useState, useEffect, useRef } from 'react';
import { generateProblem } from '../services/gemini';
import { Loader2, Clock, AlertTriangle, ArrowRight } from 'lucide-react';

export function ExamScreen({ config, onFinish }) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentDifficulty, setCurrentDifficulty] = useState(config.startingDifficulty);
  const [problem, setProblem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(config.timeLimitPerQuestion);
  const [answer, setAnswer] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);

  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  const fetchNextProblem = async (difficulty) => {
    setLoading(true);
    setError(null);
    try {
      const newProblem = await generateProblem(difficulty, config.subject);
      setProblem(newProblem);
      setTimeLeft(config.timeLimitPerQuestion);
      setAnswer('');
      startTimeRef.current = Date.now();
    } catch (err) {
      setError("Failed to fetch problem. Retrying...");
      setTimeout(() => fetchNextProblem(difficulty), 2000);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNextProblem(currentDifficulty);
  }, []); // Initial load

  useEffect(() => {
    if (loading || !problem) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [loading, problem]);

  const handleTimeUp = () => {
    if (config.stressMode === 'strict') {
      submitAnswer(true); // Auto submit on timeout
    }
  };

  const submitAnswer = (isTimeout = false) => {
    clearInterval(timerRef.current);
    const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);
    const isCorrect = !isTimeout && answer.trim().toLowerCase() === problem.answer.trim().toLowerCase();

    // Scaling Logic
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
      userAnswer: isTimeout ? '[Time Out]' : answer,
      isCorrect,
      timeSpent,
      timeOut: isTimeout,
      difficultyAtTime: currentDifficulty
    };

    const updatedResults = [...results, questionResult];
    setResults(updatedResults);

    if (currentQuestionIndex + 1 >= config.numQuestions) {
      onFinish(updatedResults);
    } else {
      setCurrentQuestionIndex(prev => prev + 1);
      setCurrentDifficulty(nextDifficulty);
      fetchNextProblem(nextDifficulty);
    }
  };

  if (loading) {
    return (
      <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
        <Loader2 className="animate-spin text-gradient" size={48} style={{ margin: '0 auto 1rem' }} />
        <h3>Generating Problem...</h3>
        <p style={{ color: 'var(--text-secondary)' }}>Difficulty Level: {currentDifficulty}/10</p>
        {error && <p style={{ color: 'var(--danger)', marginTop: '1rem' }}>{error}</p>}
      </div>
    );
  }

  const isLowTime = timeLeft <= 10;
  const isHidden = config.stressMode === 'hidden' && !isLowTime;
  const isDynamicStress = config.stressMode === 'dynamic' && isLowTime;

  return (
    <div className="glass-panel animate-fade-in" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
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
              {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
            </>
          )}
        </div>
      </div>

      <div style={{ marginBottom: '2rem', fontSize: '1.2rem', lineHeight: '1.6' }}>
        <p>{problem.question}</p>
      </div>

      {problem.type === 'multiple_choice' && problem.options && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
          {problem.options.map((opt, i) => (
            <button 
              key={i} 
              className={`btn btn-outline ${answer === opt ? 'selected' : ''}`}
              style={{ justifyContent: 'flex-start', background: answer === opt ? 'var(--bg-tertiary)' : 'transparent', borderColor: answer === opt ? 'var(--accent-primary)' : '' }}
              onClick={() => setAnswer(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {problem.type === 'short_answer' && (
        <div style={{ marginBottom: '2rem' }}>
          <input 
            type="text" 
            placeholder="Type your answer here..." 
            className="input-field" 
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && answer.trim() && submitAnswer()}
          />
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button 
          className="btn btn-primary" 
          disabled={!answer.trim()}
          onClick={() => submitAnswer()}
        >
          {currentQuestionIndex + 1 === config.numQuestions ? 'Finish Exam' : 'Next Question'} <ArrowRight size={18} />
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
