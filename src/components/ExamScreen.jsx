/* eslint-disable */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Clock, AlertTriangle, ArrowRight, Upload, Type, Image as ImageIcon, ArrowLeft, Pause, Play } from 'lucide-react';
import { ChemicalText, SmilesRenderer } from './ChemicalText';
import { isSmiles } from './chemicalHelpers.js';
import { Whiteboard } from './Whiteboard';

// Normalize an answer string for comparison:
// strips $...$ / $$...$$, \text{}, \mathrm{} etc., LaTeX ~, and collapses whitespace
export function normalizeAnswer(str) {
  if (!str) return '';
  return str
    .replace(/\$\$([\s\S]*?)\$\$/g, '$1')   // strip $$...$$
    .replace(/\$([\s\S]*?)\$/g, '$1')        // strip $...$
    .replace(/\\\[([\s\S]*?)\\\]/g, '$1')   // strip \[...\]
    .replace(/\\\(([\s\S]*?)\\\)/g, '$1')   // strip \(...\)
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
async function readSSEStream(response, onQuestion) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const questions = [];

  while (true) {
    const { done, value } = await reader.read();

    if (value) {
      buffer += decoder.decode(value, { stream: !done });

      // Split on double-newlines to isolate complete SSE frames
      const frames = buffer.split('\n\n');
      buffer = frames.pop(); // keep any trailing incomplete frame

      for (const frame of frames) {
        const trimmed = frame.trim();
        if (!trimmed.startsWith('data:')) continue;

        try {
          const colonIdx = trimmed.indexOf(':');
          const jsonPayload = trimmed.slice(colonIdx + 1).trim();
          const event = JSON.parse(jsonPayload);

          if (event.type === 'question' && event.data) {
            questions.push(event.data);
            if (onQuestion) onQuestion(event.data, questions.length - 1);
          }
        } catch {
        }
      }
    }

    if (done) {
      // Process any remaining buffer content
      if (buffer.trim()) {
        const frames = buffer.split('\n\n');
        for (const frame of frames) {
          const trimmed = frame.trim();
          if (!trimmed.startsWith('data:')) continue;
          try {
            const colonIdx = trimmed.indexOf(':');
            const jsonPayload = trimmed.slice(colonIdx + 1).trim();
            const event = JSON.parse(jsonPayload);
            if (event.type === 'question' && event.data) {
              questions.push(event.data);
              if (onQuestion) onQuestion(event.data, questions.length - 1);
            }
          } catch {}
        }
      }
      break;
    }
  }

  return questions;
}

export async function generateProblems(count, difficulty, subject = "Math", username = "default_user", onQuestion = null, freeResponseMode = false, examFormat = 'mix', lessonTitle = null, lessonDescription = null, topics = '', assignmentId = null) {
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        count,
        difficulty,
        subject,
        targetUserId: username,
        freeResponseMode,
        examFormat,
        lessonTitle,
        lessonDescription,
        topics,
        assignmentId
      }),
    });

    if (!response.ok) {
      console.warn(`Vercel API returned status ${response.status}.`);
      if (response.status === 504) {
        throw new Error("Timeout");
      }
      throw new Error(`API call failed with status ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream')) {
      // SSE streaming path
      const wrappedOnQuestion = onQuestion
        ? (q, idx) => {
          if (idx < count) {
            onQuestion(q, idx);
          }
        }
        : null;
      const resQuestions = await readSSEStream(response, wrappedOnQuestion);
      return resQuestions.slice(0, count);
    } else {
      // Legacy non-streaming JSON fallback
      const data = await response.json();
      const questions = (Array.isArray(data) ? data : [data]).slice(0, count);
      if (onQuestion) questions.forEach((q, i) => onQuestion(q, i));
      return questions;
    }
  } catch (error) {
    console.error("Failed to connect to API:", error);
    try {
      console.warn("Attempting to fetch fallback questions from BigQuery...");
      const fallbackResponse = await fetch('/api/fallback-questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          count,
          difficulty,
          subject,
          targetUserId: username,
          examFormat,
        }),
      });
      if (fallbackResponse.ok) {
        const data = await fallbackResponse.json();
        const questions = (Array.isArray(data) ? data : [data]).slice(0, count);
        if (onQuestion) questions.forEach((q, i) => onQuestion(q, i));
        return questions;
      } else {
        console.warn(`BigQuery fallback endpoint returned status ${fallbackResponse.status}.`);
      }
    } catch (fallbackError) {
      console.error("Failed to fetch fallback questions from BigQuery:", fallbackError);
    }

    // Fallback for missing API key or network error to allow UI testing
    console.warn("Using fallback mock data due to API/BigQuery failure.");
    const mockProblems = [];
    for (let i = 0; i < count; i++) {
      const offset = (i % 5) - 2; // yields -2, -1, 0, 1, 2
      const diff = Math.min(10, Math.max(0, difficulty + offset));
      const format = examFormat || (freeResponseMode ? 'free_response' : 'mix');

      if (format === 'free_response' || (format === 'mix' && i % 3 === 2)) {
        mockProblems.push({
          id: `${Date.now()}-${i}`,
          question: `Mock ${subject} FRQ Problem ${i + 1} (Difficulty: ${diff}): Explain and solve for $x$ in the equation ${diff}x + ${i + 1} = ${diff * 2 + i + 1}$.`,
          type: "free_response",
          answer: `Subtract ${i + 1} from both sides to get ${diff}x = ${diff * 2}$. Then divide by ${diff}$ to get $x = 2$.`,
          difficulty: diff
        });
      } else if (format === 'multiple_choice' || (format === 'mix' && i % 3 === 0)) {
        mockProblems.push({
          id: `${Date.now()}-${i}`,
          question: `Mock ${subject} MCQ Problem ${i + 1} (Difficulty: ${diff}): What is ${i + 1} + ${diff}?`,
          type: "multiple_choice",
          options: [`${i + 1 + diff}`, `${i + 2 + diff}`, `${i + 3 + diff}`, `${i + 4 + diff}`],
          answer: `${i + 1 + diff}`,
          difficulty: diff
        });
      } else {
        mockProblems.push({
          id: `${Date.now()}-${i}`,
          question: `Mock ${subject} Short Answer Problem ${i + 1} (Difficulty: ${diff}): What is ${i + 1} + ${diff}?`,
          type: "short_answer",
          answer: `${i + 1 + diff}`,
          difficulty: diff
        });
      }
    }
    if (onQuestion) mockProblems.forEach((q, i) => onQuestion(q, i));
    return mockProblems;
  }
}
export function ExamScreen({ config, onFinish, onCancel, resumeState }) {
  const isWholeTestMode = config.timeLimitStyle === 'whole_test';
  const isSetTimedMode = config.timeLimitStyle === 'per_set';
  const questionsPerSet = config.questionsPerSet || 2;
  const timeLimitPerSet = config.timeLimitPerSet || config.timeLimitValue || 10; // in minutes
  const totalSets = Math.ceil(config.numQuestions / questionsPerSet);

  const [activeSetIndex, setActiveSetIndex] = useState(() => {
    if (resumeState && resumeState.config && resumeState.config.activeSetIndex !== undefined) {
      return resumeState.config.activeSetIndex;
    }
    return 0;
  });

  const [setTimesLeft, setSetTimesLeft] = useState(() => {
    if (resumeState && resumeState.config && resumeState.config.setTimesLeft) {
      return resumeState.config.setTimesLeft;
    }
    return Array(totalSets).fill(timeLimitPerSet * 60);
  });

  const [setsTimedOut, setSetsTimedOut] = useState(() => {
    if (resumeState && resumeState.config && resumeState.config.setsTimedOut) {
      return resumeState.config.setsTimedOut;
    }
    return Array(totalSets).fill(false);
  });

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
    resumeState ? (resumeState.problems[resumeState.currentQuestionIndex]?.difficulty !== undefined ? resumeState.problems[resumeState.currentQuestionIndex].difficulty : config.difficulty) : config.difficulty
  );
  const [isPaused, setIsPaused] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isRated, setIsRated] = useState(() => {
    if (resumeState && resumeState.config) {
      return resumeState.config.isRated !== false;
    }
    return config.isRated !== false;
  });
  const [saving, setSaving] = useState(false);
  const [totalTimeLeft, setTotalTimeLeft] = useState(() => config.timeLimitWholeTest * 60);
  const [questionTimesLeft, setQuestionTimesLeft] = useState(() =>
    Array(config.numQuestions).fill(isWholeTestMode ? null : config.timeLimitPerQuestion)
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
  const submittedRef = useRef(false);
  const globalTimeUpHandledRef = useRef(false);
  const setTimeUpHandledRef = useRef({});
  const questionTimeUpHandledRef = useRef({});

  const triggerFinish = (finalResults) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    onFinish(finalResults);
  };

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
    const saved = frqSubmissions[currentQuestionIndex];
    setWorkSubmitted(false); // Always start in editing mode so they can resume work
    if (saved) {
      setSubmitType(saved.type || 'whiteboard');
      if (saved.type === 'whiteboard') {
        setWhiteboardPreview(saved.value || '');
      } else if (saved.type === 'image') {
        setUploadedImage(saved.value || null);
        setUploadedFileName('Saved Image');
      } else if (saved.type === 'text') {
        setTypedWork(saved.value || '');
      }
    } else {
      setSubmitType('whiteboard');
      setTypedWork('');
      setUploadedImage(null);
      setUploadedFileName('');
      setWhiteboardPreview('');
    }
  }, [currentQuestionIndex]);

  const problem = problems[currentQuestionIndex];

  const fetchProblems = async () => {
    setLoading(true);
    setError(null);

    const MAX_RETRIES = 3;
    let retryCount = 0;

    const sharedQuestions = config.sharedQuestions || [];
    const totalCount = config.numQuestions;
    const aiCount = totalCount - sharedQuestions.length;

    setProblems(sharedQuestions);
    setCurrentQuestionIndex(0);
    elapsedSecondsRef.current = 0;
    currentQuestionEntryTimeRef.current = 0;
    questionIntervalsRef.current = Array.from({ length: totalCount }, () => []);

    if (sharedQuestions.length > 0) {
      setCurrentDifficulty(sharedQuestions[0].difficulty !== undefined ? sharedQuestions[0].difficulty : config.difficulty);
      setLoading(false);
    }

    if (aiCount <= 0) {
      return;
    }

    let firstReceived = false;
    let allGenerated = [];
    let streamedQuestions = [];

    while (allGenerated.length < aiCount && retryCount < MAX_RETRIES) {
      const needed = aiCount - allGenerated.length;
      try {
        streamedQuestions = [];
        const generated = await generateProblems(
          needed,
          config.difficulty,
          config.subject,
          config.username || 'default_user',
          (question, index) => {
            // Append as they arrive in real-time
            setProblems(prev => {
              if (prev.length >= totalCount) return prev;
              if (prev.some(p => p.id === question.id || p.question === question.question)) return prev;
              return [...prev, question];
            });

            if (!streamedQuestions.some(p => p.id === question.id || p.question === question.question)) {
              streamedQuestions.push(question);
            }

            if (!firstReceived) {
              firstReceived = true;
              if (sharedQuestions.length === 0) {
                setCurrentDifficulty(question.difficulty !== undefined ? question.difficulty : config.difficulty);
                setLoading(false);
              }
            }
          },
          config.examFormat === 'free_response',
          config.examFormat || 'mix',
          config.lessonTitle,
          config.lessonDescription,
          config.topics,
          config.assignmentId
        );

        if (generated && generated.length > 0) {
          const newGenerated = generated.filter(q => !allGenerated.some(a => a.id === q.id || a.question === q.question));
          allGenerated = [...allGenerated, ...newGenerated];
        } else {
          // If no questions returned, merge whatever was streamed and retry
          if (streamedQuestions.length > 0) {
            const newStreamed = streamedQuestions.filter(q => !allGenerated.some(a => a.id === q.id || a.question === q.question));
            allGenerated = [...allGenerated, ...newStreamed];
          }
          retryCount++;
        }
      } catch (err) {
        if (streamedQuestions.length > 0) {
          const newStreamed = streamedQuestions.filter(q => !allGenerated.some(a => a.id === q.id || a.question === q.question));
          allGenerated = [...allGenerated, ...newStreamed];
        }
        retryCount++;
        const isTimeout = err.message === 'Timeout' || err.message?.toLowerCase().includes('timeout') || err.message?.includes('504');
        if (retryCount >= MAX_RETRIES || isTimeout) {
          if (sharedQuestions.length === 0 && allGenerated.length === 0) {
            if (isTimeout) {
              setError('Whoops, you asked for too many questions! Please try again.');
            } else {
              setError('Failed to generate problems after multiple attempts. Please go back and try again.');
            }
          } else {
            console.error("Failed to generate remainder of problems:", err);
          }
          break;
        }
        // Small delay before retrying
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Set the final consolidated list
    setProblems(prev => {
      const shared = prev.slice(0, sharedQuestions.length);
      const uniqueAllGenerated = [];
      for (const q of allGenerated) {
        const isDuplicate = shared.some(s => s.id === q.id || s.question === q.question) ||
          uniqueAllGenerated.some(u => u.id === q.id || u.question === q.question);
        if (!isDuplicate) {
          uniqueAllGenerated.push(q);
        }
      }
      return [...shared, ...uniqueAllGenerated].slice(0, totalCount);
    });
    setLoading(false);
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
    if (config.timeLimitStyle === 'none' || loading || !problem || workSubmitted || isPaused || !hasStarted) return;

    if (isWholeTestMode && totalTimeLeft <= 0) {
      handleGlobalTimeUp();
      return;
    }

    if (isSetTimedMode && setTimesLeft[activeSetIndex] <= 0) {
      handleSetTimeUp();
      return;
    }

    const timeForThisQuestion = questionTimesLeft[currentQuestionIndex];
    if (!isWholeTestMode && !isSetTimedMode && timeForThisQuestion <= 0) return;

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

      if (isSetTimedMode) {
        setSetTimesLeft((prevTimes) => {
          const next = [...prevTimes];
          const currentVal = next[activeSetIndex];
          if (currentVal <= 1) {
            clearInterval(timerRef.current);
            handleSetTimeUp();
            next[activeSetIndex] = 0;
          } else {
            next[activeSetIndex] = currentVal - 1;
          }
          return next;
        });
      } else {
        setQuestionTimesLeft((prevTimes) => {
          const next = [...prevTimes];
          let currentVal = next[currentQuestionIndex];
          if (isWholeTestMode) {
            if (currentVal === null || currentVal === undefined) {
              const unansweredCount = answers.filter((a, idx) => {
                if (problems[idx]?.type === 'free_response') return !frqSubmissions[idx];
                return !a || a.toString().trim() === '';
              }).length;
              currentVal = Math.floor(totalTimeLeft / (unansweredCount || 1));
            }
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
      }
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [loading, currentQuestionIndex, problem, workSubmitted, totalTimeLeft, isPaused, activeSetIndex, setTimesLeft[activeSetIndex], hasStarted]);

  const saveActiveExam = async (showLoader = false, updatedConfig = config) => {
    if (!config.username || config.username === 'default_user') return;
    if (showLoader) setSaving(true);
    const finalConfig = {
      ...updatedConfig,
      activeSetIndex,
      setTimesLeft,
      setsTimedOut
    };
    try {
      await fetch('/api/exams?route=save-active-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: config.username,
          examId: config.examId,
          subject: config.subject,
          config: finalConfig,
          problems,
          answers,
          frqSubmissions,
          currentQuestionIndex
        })
      });
    } catch (err) {
      console.error("Error saving active exam:", err);
    } finally {
      if (showLoader) setSaving(false);
    }
  };

  useEffect(() => {
    const isUnrated = !isRated || config.timeLimitStyle === 'none';
    if (isUnrated && problems.length > 0 && !loading) {
      const delayDebounce = setTimeout(() => {
        saveActiveExam(false, { ...config, isRated });
      }, 3000);
      return () => clearTimeout(delayDebounce);
    }
  }, [answers, frqSubmissions, currentQuestionIndex, problems, loading, config, isRated, activeSetIndex, setTimesLeft, setsTimedOut]);

  const saveCurrentFRQState = useCallback(() => {
    if (!problem || problem.type !== 'free_response') {
      return { answers, frqSubmissions };
    }

    let finalValue = '';
    let imagePayload = null;

    if (submitType === 'whiteboard') {
      if (whiteboardRef.current) {
        imagePayload = whiteboardRef.current.getFullWorkspaceDataURL() || whiteboardPreview;
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

    const hasContent =
      (submitType === 'whiteboard' && imagePayload) ||
      (submitType === 'image' && imagePayload) ||
      (submitType === 'text' && typedWork.trim());

    if (hasContent) {
      const updatedSubmissions = [...frqSubmissions];
      updatedSubmissions[currentQuestionIndex] = {
        type: submitType,
        value: imagePayload || finalValue
      };
      setFrqSubmissions(updatedSubmissions);

      const updatedAnswers = [...answers];
      updatedAnswers[currentQuestionIndex] = finalValue;
      setAnswers(updatedAnswers);

      return { answers: updatedAnswers, frqSubmissions: updatedSubmissions };
    }

    return { answers, frqSubmissions };
  }, [problem, submitType, whiteboardPreview, uploadedImage, typedWork, frqSubmissions, currentQuestionIndex, answers]);

  const handleTimeUp = () => {
    if (questionTimeUpHandledRef.current[currentQuestionIndex]) return;
    questionTimeUpHandledRef.current[currentQuestionIndex] = true;

    if (problem && problem.type === 'free_response') {
      handleAutoTimeoutSubmit();
    } else if (config.stressMode === 'strict') {
      submitStrictAnswer(true);
    }
  };

  const handleGlobalTimeUp = async () => {
    if (globalTimeUpHandledRef.current) return;
    globalTimeUpHandledRef.current = true;

    recordActiveInterval(currentQuestionIndex);
    clearInterval(timerRef.current);
    alert("Test time limit reached! Auto-submitting your exam.");

    let activeQuestionFinalVal = answers[currentQuestionIndex] || '';
    let imagePayload = null;
    if (problems[currentQuestionIndex]?.type === 'free_response') {
      if (whiteboardRef.current) {
        imagePayload = whiteboardRef.current.getFullWorkspaceDataURL();
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
      const sub = idx === currentQuestionIndex ? updatedSubmissions[currentQuestionIndex] : frqSubmissions[idx];
      let userAnswer = finalAnswers[idx] || '';
      let isTimeout = idx === currentQuestionIndex || !userAnswer;

      if (prob.type === 'free_response' && sub && sub.value && sub.value.startsWith('data:image/')) {
        userAnswer = '[Drawing Submission]';
        isTimeout = false;
      }

      const intervals = questionIntervalsRef.current[idx] || [];
      const timeSpent = intervals.reduce((acc, inv) => acc + (inv.end - inv.start), 0);
      const isCorrect = prob.type === 'free_response' ? null : (!isTimeout && isAnswerCorrect(prob, userAnswer));

      return {
        ...prob,
        userAnswer: userAnswer || '[Time Out]',
        isCorrect,
        timeSpent: Math.max(0, timeSpent),
        intervals,
        timeOut: isTimeout,
        difficultyAtTime: prob.difficulty !== undefined ? prob.difficulty : config.difficulty,
        frqSubmission: sub
      };
    });

    triggerFinish(finalResults);
  };

  const handleSetTimeUp = () => {
    if (setTimeUpHandledRef.current[activeSetIndex]) return;
    setTimeUpHandledRef.current[activeSetIndex] = true;

    recordActiveInterval(currentQuestionIndex);
    clearInterval(timerRef.current);

    if (problem && problem.type === 'free_response') {
      saveCurrentFRQState();
    }

    // Lock the current set
    setSetTimesLeft(prev => {
      const next = [...prev];
      next[activeSetIndex] = 0;
      return next;
    });

    setSetsTimedOut(prev => {
      const next = [...prev];
      next[activeSetIndex] = true;
      return next;
    });

    const isLastSet = activeSetIndex + 1 >= totalSets;
    if (isLastSet) {
      alert("Time is up for the final set! Submitting your exam.");
      const updatedTimedOut = [...setsTimedOut];
      updatedTimedOut[activeSetIndex] = true;
      handleFinishExam(null, null, null, updatedTimedOut);
    } else {
      alert("Time is up for this set! Moving to the next set.");
      const nextSet = activeSetIndex + 1;
      setActiveSetIndex(nextSet);
      setCurrentQuestionIndex(nextSet * questionsPerSet);
    }
  };

  const handleNextSet = () => {
    recordActiveInterval(currentQuestionIndex);
    clearInterval(timerRef.current);

    if (problem && problem.type === 'free_response') {
      saveCurrentFRQState();
    }

    // Set time left for current set to 0, which locks it
    setSetTimesLeft(prev => {
      const next = [...prev];
      next[activeSetIndex] = 0;
      return next;
    });

    const nextSet = activeSetIndex + 1;
    setActiveSetIndex(nextSet);
    setCurrentQuestionIndex(nextSet * questionsPerSet);
  };

  const handleAutoTimeoutSubmit = () => {
    recordActiveInterval(currentQuestionIndex);
    let finalValue = '[Time Out]';
    let imagePayload = null;
    if (whiteboardRef.current) {
      imagePayload = whiteboardRef.current.getFullWorkspaceDataURL();
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
        imagePayload = whiteboardRef.current.getFullWorkspaceDataURL() || whiteboardPreview;
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
      const intervals = questionIntervalsRef.current[currentQuestionIndex] || [];
      const timeSpent = intervals.reduce((acc, inv) => acc + (inv.end - inv.start), 0);

      const questionResult = {
        ...problem,
        userAnswer: finalValue,
        isCorrect: false, // graded at the end
        timeSpent,
        timeOut: false,
        difficultyAtTime: problem.difficulty !== undefined ? problem.difficulty : currentDifficulty,
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

  const handleFinishExam = (strictResults = null, overrideAnswers = null, overrideSubmissions = null, overrideSetsTimedOut = null) => {
    const activeAnswers = overrideAnswers || answers;
    const activeSubmissions = overrideSubmissions || frqSubmissions;

    const hasTimeLeft = isWholeTestMode
      ? totalTimeLeft > 0
      : (isSetTimedMode
        ? (setTimesLeft[activeSetIndex] > 0)
        : true);

    if (hasTimeLeft && !strictResults && overrideSetsTimedOut === null) {
      const unansweredIndexes = [];
      problems.forEach((prob, idx) => {
        const ans = activeAnswers[idx];
        const hasFRQSub = prob.type === 'free_response' && activeSubmissions[idx] && activeSubmissions[idx].value && activeSubmissions[idx].value !== '[Time Out]';
        const hasAns = ans && ans.trim() !== '' && ans !== '[Time Out]';
        if (!hasAns && !hasFRQSub) {
          unansweredIndexes.push(idx + 1);
        }
      });

      if (unansweredIndexes.length > 0) {
        const confirmSubmit = window.confirm(
          `You still have unanswered questions (Question(s): ${unansweredIndexes.join(', ')}). Are you sure you want to submit?`
        );
        if (!confirmSubmit) {
          return;
        }
      }
    }

    recordActiveInterval(currentQuestionIndex);
    clearInterval(timerRef.current);

    let finalResults;
    if (strictResults) {
      finalResults = strictResults;
    } else {
      const activeAnswers = overrideAnswers || answers;
      const activeSubmissions = overrideSubmissions || frqSubmissions;
      const activeSetsTimedOut = overrideSetsTimedOut || setsTimedOut;
      finalResults = problems.map((prob, idx) => {
        const sub = activeSubmissions[idx] || null;
        let userAnswer = activeAnswers[idx] || '';
        const intervals = questionIntervalsRef.current[idx] || [];
        const timeSpent = intervals.reduce((acc, inv) => acc + (inv.end - inv.start), 0);
        const setIdx = Math.floor(idx / questionsPerSet);
        let isTimeout = isSetTimedMode
          ? (activeSetsTimedOut[setIdx] && !userAnswer)
          : (isWholeTestMode
            ? (totalTimeLeft <= 0)
            : (questionTimesLeft[idx] <= 0));

        if (prob.type === 'free_response' && sub && sub.value && sub.value.startsWith('data:image/')) {
          userAnswer = '[Drawing Submission]';
          isTimeout = false;
        }

        const isCorrect = prob.type === 'free_response'
          ? null
          : (!isTimeout && isAnswerCorrect(prob, userAnswer));

        return {
          ...prob,
          userAnswer: isTimeout && !userAnswer ? '[Time Out]' : userAnswer,
          isCorrect,
          timeSpent,
          intervals,
          timeOut: isTimeout,
          difficultyAtTime: prob.difficulty !== undefined ? prob.difficulty : config.difficulty,
          frqSubmission: sub
        };
      });
    }

    triggerFinish(finalResults);
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
      if (currentDifficulty > 0) {
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
      difficultyAtTime: problem.difficulty !== undefined ? problem.difficulty : currentDifficulty
    };

    const updatedResults = [...results, questionResult];
    setResults(updatedResults);

    if (currentQuestionIndex + 1 >= config.numQuestions) {
      triggerFinish(updatedResults);
    } else {
      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
      if (problems[nextIndex]) {
        setCurrentDifficulty(problems[nextIndex].difficulty !== undefined ? problems[nextIndex].difficulty : nextDifficulty);
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

  const handlePause = async () => {
    const isTimed = config.timeLimitStyle !== 'none';
    let updatedConfig = config;
    if (isTimed && isRated) {
      const confirmPause = confirm("Are you sure? If you pause, this will not count toward your ELO");
      if (!confirmPause) return;

      setIsRated(false);
      config.isRated = false;
      updatedConfig = { ...config, isRated: false };
    }

    setIsPaused(true);
    await saveActiveExam(true, updatedConfig);
  };

  if (saving) {
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
        <Loader2 className="animate-spin text-gradient" size={48} />
        <h3>Saving exam progress...</h3>
        <p style={{ color: 'var(--text-secondary)' }}>Please wait while we save your questions and answers to BigQuery.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="glass-panel" style={{ padding: 'var(--panel-padding-lg)', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
        <Loader2 className="animate-spin text-gradient" size={48} style={{ margin: '0 auto 1rem' }} />
        <h3>Generating Problems...</h3>
        <p style={{ color: 'var(--text-secondary)' }}>Preparing exam with {config.numQuestions} questions. This usually takes 1-2 min</p>
        {error && <p style={{ color: 'var(--danger)', marginTop: '1rem' }}>{error}</p>}
      </div>
    );
  }

  if (!hasStarted) {
    return (
      <div className="glass-panel animate-fade-in" style={{
        padding: 'var(--panel-padding-lg)',
        textAlign: 'center',
        maxWidth: '650px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '350px',
        gap: '2rem'
      }}>
        <div style={{
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(236, 72, 153, 0.1))',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.2)',
          color: 'var(--accent-primary)'
        }}>
          <Clock size={36} style={{ color: 'var(--accent-primary)' }} />
        </div>
        <div>
          <h2 className="text-gradient" style={{ marginBottom: '0.75rem', fontSize: '2.2rem', fontWeight: '700' }}>
            {resumeState ? 'Ready to Resume' : 'Exam Ready'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '480px', margin: '0 auto 1.5rem', fontSize: '1.1rem', lineHeight: '1.6' }}>
            {resumeState
              ? 'Your past exam progress has been loaded.'
              : 'All questions have been generated.'}
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '1rem',
            width: '100%',
            maxWidth: '440px',
            margin: '0 auto 0.5rem',
            textAlign: 'left'
          }}>
            <div className="glass-panel" style={{ padding: '0.75rem 1rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block' }}>Subject</span>
              <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>{config.subject}</strong>
            </div>
            <div className="glass-panel" style={{ padding: '0.75rem 1rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block' }}>Questions</span>
              <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>{config.numQuestions} Qs</strong>
            </div>
            <div className="glass-panel" style={{ padding: '0.75rem 1rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)', gridColumn: 'span 2' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block' }}>Format & Mode</span>
              <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>
                {config.examFormat === 'free_response' ? 'Free Response' : config.examFormat === 'multiple_choice' ? 'Multiple Choice' : 'Mixed Format'}
                {config.stressMode === 'strict' ? ' • Strict Stress Mode' : ''}
              </strong>
            </div>
          </div>
        </div>

        <button
          className="btn btn-primary animate-pulse-subtle"
          onClick={() => setHasStarted(true)}
          style={{
            padding: '1rem 3rem',
            fontSize: '1.25rem',
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 0 20px rgba(99, 102, 241, 0.3)'
          }}
        >
          <Play size={20} fill="currentColor" /> {resumeState ? 'Resume Exam' : 'Start Exam'}
        </button>
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

  if (error && problems.length === 0) {
    return (
      <div className="glass-panel animate-fade-in" style={{ padding: 'var(--panel-padding-lg)', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
        <AlertTriangle className="text-gradient" size={48} style={{ margin: '0 auto 1rem', color: 'var(--danger)' }} />
        <h3 className="text-gradient">Generation Failed</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '1.05rem', lineHeight: '1.6' }}>{error}</p>
        {onCancel && (
          <button className="btn btn-primary" onClick={onCancel} style={{ margin: '0 auto' }}>
            Go Back
          </button>
        )}
      </div>
    );
  }

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
  }

  let activeTimeLeft = questionTimesLeft[currentQuestionIndex];
  if (isSetTimedMode) {
    activeTimeLeft = setTimesLeft[activeSetIndex];
  } else if (activeTimeLeft === null || activeTimeLeft === undefined) {
    if (isWholeTestMode) {
      const unansweredCount = answers.filter((a, idx) => {
        if (problems[idx]?.type === 'free_response') return !frqSubmissions[idx];
        return !a || a.toString().trim() === '';
      }).length;
      activeTimeLeft = Math.floor(totalTimeLeft / (unansweredCount || 1));
    } else {
      activeTimeLeft = config.timeLimitPerQuestion;
    }
  }
  const isTimeOut = activeTimeLeft <= 0;
  const isLowTime = activeTimeLeft <= 10;
  const isHidden = config.stressMode === 'hidden' && !isLowTime;
  const isDynamicStress = config.stressMode === 'dynamic' && isLowTime;
  const allLoaded = problems.length === config.numQuestions;
  const generationComplete = !loading;
  const noMoreQuestions = generationComplete && currentQuestionIndex + 1 >= problems.length;

  const intervalsForCurrent = questionIntervalsRef.current[currentQuestionIndex] || [];
  const timeSpentOnCurrent = intervalsForCurrent.reduce((acc, inv) => acc + (inv.end - inv.start), 0) + (elapsedSecondsRef.current - currentQuestionEntryTimeRef.current);
  const totalTime = isSetTimedMode
    ? (timeLimitPerSet * 60)
    : (isWholeTestMode ? (activeTimeLeft + timeSpentOnCurrent) : config.timeLimitPerQuestion);
  const percentage = Math.max(0, Math.min(100, (activeTimeLeft / totalTime) * 100));

  let progressColor = 'var(--success)';
  if (percentage <= 25) {
    progressColor = 'var(--danger)';
  } else if (percentage <= 55) {
    progressColor = 'var(--warning)';
  }

  const activeAnswer = answers[currentQuestionIndex] || '';
  const isEditingLocked = isSetTimedMode
    ? (Math.floor(currentQuestionIndex / questionsPerSet) !== activeSetIndex || setTimesLeft[activeSetIndex] <= 0)
    : (isWholeTestMode ? (totalTimeLeft <= 0) : isTimeOut);

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
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>ELO:</span>
            <strong style={{ color: isRated ? 'var(--success)' : 'var(--text-muted)' }}>
              {isRated ? 'Rated' : 'Unrated'}
            </strong>
          </div>

          <button
              onClick={handlePause}
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
            ) : isSetTimedMode ? (
              <>
                {isEditingLocked ? <AlertTriangle size={14} color="var(--danger)" /> : <Clock size={14} color="var(--accent-primary)" />}
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Set {activeSetIndex + 1}:</span>
                <strong style={{ color: isEditingLocked ? 'var(--danger)' : 'var(--text-primary)' }}>
                  {isTimeOut ? 'Time Out' : formatTime(activeTimeLeft)}
                </strong>
              </>
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
          <AlertTriangle size={18} /> {
            isSetTimedMode
              ? (Math.floor(currentQuestionIndex / questionsPerSet) !== activeSetIndex
                ? "This set is locked because you have submitted it."
                : "This set is locked because the time limit has expired.")
              : "Time limit reached. Edits are locked."
          }
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

      {problem.type === 'free_response' && (
        <div style={{ display: workSubmitted ? 'block' : 'none' }}>
          <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
            <h3 className="text-gradient" style={{ marginBottom: '0.5rem' }}>Select Submission Method</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Confirm how you would like to submit your solution for Question {currentQuestionIndex + 1}.</p>
          </div>

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
                        const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
                        if (file.size > MAX_FILE_SIZE) {
                          alert('File is too large. Maximum size is 5MB.');
                          e.target.value = '';
                          return;
                        }
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
      )}

      {problem.type === 'free_response' && (
        <div style={{ display: workSubmitted ? 'none' : 'block' }}>
          <div>
            <div style={{ marginBottom: '2rem', fontSize: '1.2rem', lineHeight: '1.6' }}>
              <p><ChemicalText text={problem.question} theme="dark" /></p>
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <span style={{ display: 'block', marginBottom: '0.75rem', fontWeight: '500', color: 'var(--text-secondary)' }}>Show Your Process / Explanation:</span>
              <Whiteboard
                key={currentQuestionIndex}
                ref={whiteboardRef}
                initialImage={frqSubmissions[currentQuestionIndex]?.type === 'whiteboard' ? frqSubmissions[currentQuestionIndex].value : null}
                onChange={saveCurrentFRQState}
              />
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', marginBottom: '1.5rem' }}
              onClick={handleReadyToSubmit}
              disabled={isEditingLocked}
            >
              Ready to submit
            </button>

            {/* Navigation Buttons for Free Response */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {config.stressMode !== 'strict' && (
                <button
                  className="btn btn-outline"
                  disabled={currentQuestionIndex === 0 || (isSetTimedMode && currentQuestionIndex === activeSetIndex * questionsPerSet)}
                  onClick={() => {
                    saveCurrentFRQState();
                    recordActiveInterval(currentQuestionIndex);
                    clearInterval(timerRef.current);
                    setCurrentQuestionIndex(prev => prev - 1);
                  }}
                >
                  <ArrowLeft size={18} /> Previous
                </button>
              )}

              <div style={{ flex: 1 }} />

              {isSetTimedMode && currentQuestionIndex === Math.min(problems.length, (activeSetIndex + 1) * questionsPerSet) - 1 ? (
                activeSetIndex + 1 < totalSets && (
                  <button
                    className="btn btn-primary"
                    style={{ marginRight: '0.75rem' }}
                    onClick={handleNextSet}
                  >
                    Submit Set & Next Set <ArrowRight size={18} />
                  </button>
                )
              ) : (
                config.stressMode !== 'strict' && currentQuestionIndex + 1 < config.numQuestions && (
                  <button
                    className="btn btn-outline"
                    style={{ marginRight: '0.75rem' }}
                    disabled={currentQuestionIndex + 1 >= problems.length && !noMoreQuestions}
                    onClick={() => {
                      saveCurrentFRQState();
                      recordActiveInterval(currentQuestionIndex);
                      clearInterval(timerRef.current);
                      setCurrentQuestionIndex(prev => prev + 1);
                    }}
                  >
                    {noMoreQuestions ? 'Awaiting question...' : (currentQuestionIndex + 1 >= problems.length ? 'Streaming...' : 'Next')}
                  </button>
                )
              )}

              {(config.stressMode !== 'strict' && (allLoaded || noMoreQuestions) && (currentQuestionIndex + 1 === config.numQuestions)) && (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const { answers: finalAnswers, frqSubmissions: finalSubmissions } = saveCurrentFRQState();
                    handleFinishExam(null, finalAnswers, finalSubmissions);
                  }}
                >
                  Finish Exam <ArrowRight size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {problem.type !== 'free_response' && (
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && activeAnswer.trim()) {
                    if (config.stressMode === 'strict') {
                      submitStrictAnswer();
                    } else if (currentQuestionIndex + 1 >= config.numQuestions) {
                      handleFinishExam();
                    } else if (currentQuestionIndex + 1 < problems.length) {
                      recordActiveInterval(currentQuestionIndex);
                      clearInterval(timerRef.current);
                      setCurrentQuestionIndex(prev => prev + 1);
                    }
                  }
                }}
                disabled={isEditingLocked}
              />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {config.stressMode !== 'strict' && (
              <button
                className="btn btn-outline"
                disabled={currentQuestionIndex === 0 || (isSetTimedMode && currentQuestionIndex === activeSetIndex * questionsPerSet)}
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

            {isSetTimedMode && currentQuestionIndex === Math.min(problems.length, (activeSetIndex + 1) * questionsPerSet) - 1 ? (
              activeSetIndex + 1 < totalSets && (
                <button
                  className="btn btn-primary"
                  style={{ marginRight: '0.75rem' }}
                  onClick={handleNextSet}
                >
                  Submit Set & Next Set <ArrowRight size={18} />
                </button>
              )
            ) : (
              config.stressMode !== 'strict' && currentQuestionIndex + 1 < config.numQuestions && (
                <button
                  className="btn btn-outline"
                  style={{ marginRight: '0.75rem' }}
                  disabled={currentQuestionIndex + 1 >= problems.length && !noMoreQuestions}
                  onClick={() => {
                    recordActiveInterval(currentQuestionIndex);
                    clearInterval(timerRef.current);
                    setCurrentQuestionIndex(prev => prev + 1);
                  }}
                >
                  {noMoreQuestions ? 'Awaiting question...' : (currentQuestionIndex + 1 >= problems.length ? 'Streaming...' : 'Next')}
                </button>
              )
            )}

            {config.stressMode === 'strict' ? (
              currentQuestionIndex + 1 === config.numQuestions ? (
                (allLoaded || noMoreQuestions) && (
                  <button
                    className="btn btn-primary"
                    disabled={!activeAnswer.trim()}
                    onClick={() => submitStrictAnswer()}
                  >
                    Finish Exam <ArrowRight size={18} />
                  </button>
                )
              ) : (
                <button
                  className="btn btn-primary"
                  disabled={!activeAnswer.trim() || (currentQuestionIndex + 1 >= problems.length && !noMoreQuestions)}
                  onClick={() => submitStrictAnswer()}
                >
                  Next Question <ArrowRight size={18} />
                </button>
              )
            ) : (
              (allLoaded || noMoreQuestions) && (currentQuestionIndex + 1 === config.numQuestions) && (
                <button
                  className="btn btn-primary"
                  onClick={() => handleFinishExam()}
                >
                  Finish Exam <ArrowRight size={18} />
                </button>
              )
            )}
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
