import { useState, useEffect } from 'react';
import { SetupScreen } from './components/SetupScreen';
import { ExamScreen } from './components/ExamScreen';
import { AnalyticsScreen } from './components/AnalyticsScreen';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { BrainCircuit, Award, LogIn, LogOut, User, Loader2, BarChart3 } from 'lucide-react';

function App() {
  const [currentScreen, setCurrentScreen] = useState('setup');
  const [examConfig, setExamConfig] = useState(null);
  const [examResults, setExamResults] = useState(null);
  const [ratings, setRatings] = useState(() => {
    const saved = localStorage.getItem('mock_exam_ratings');
    return saved ? JSON.parse(saved) : { Math: 100, Physics: 100, Chemistry: 100 };
  });

  // New Database & Login States
  const [user, setUser] = useState(null);
  const [strengths, setStrengths] = useState(() => {
    const saved = localStorage.getItem('chronos_guest_strengths');
    return saved ? JSON.parse(saved) : [];
  });
  const [weaknesses, setWeaknesses] = useState(() => {
    const saved = localStorage.getItem('chronos_guest_weaknesses');
    return saved ? JSON.parse(saved) : [];
  });
  const [detailedAnalysis, setDetailedAnalysis] = useState(() => {
    const saved = localStorage.getItem('chronos_guest_detailed_analysis');
    return saved ? JSON.parse(saved) : {};
  });
  const [topicBreakdowns, setTopicBreakdowns] = useState(() => {
    const saved = localStorage.getItem('chronos_guest_topic_breakdowns');
    return saved ? JSON.parse(saved) : {};
  });
  const [selectedTopicDetail, setSelectedTopicDetail] = useState(null);
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('chronos_guest_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedSubject, setSelectedSubject] = useState('Math');
  const [showConversionPrompt, setShowConversionPrompt] = useState(false);
  const [pendingConfig, setPendingConfig] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginModalMode, setLoginModalMode] = useState('login'); // 'login', 'setup_recovery', 'forgot_username', 'forgot_verify'

  // Setup Recovery State
  const [recoveryQuestion, setRecoveryQuestion] = useState('');
  const [recoveryAnswer, setRecoveryAnswer] = useState('');
  const [recoverySetupUserId, setRecoverySetupUserId] = useState('');
  const [recoverySetupIsNew, setRecoverySetupIsNew] = useState(false);

  // Forgot Password State
  const [resetQuestion, setResetQuestion] = useState('');
  const [resetAnswer, setResetAnswer] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');

  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [autoLoginLoading, setAutoLoginLoading] = useState(() => {
    const savedUser = typeof window !== 'undefined' ? localStorage.getItem('chronos_logged_user') : null;
    const savedPass = typeof window !== 'undefined' ? localStorage.getItem('chronos_logged_password') : null;
    return !!(savedUser && savedPass);
  });
  const [loadingExamId, setLoadingExamId] = useState(null);
  const [currentExamId, setCurrentExamId] = useState(null);
  const [gradingLoading, setGradingLoading] = useState(false);

  const formatDate = (dateVal) => {
    if (!dateVal) return '';
    const dateStr = typeof dateVal === 'object' && dateVal.value ? dateVal.value : dateVal;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? 'Recent' : d.toLocaleDateString();
  };

  useEffect(() => {
    if (!user) {
      localStorage.setItem('mock_exam_ratings', JSON.stringify(ratings));
    }
  }, [ratings, user]);

  // Auto-login on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('chronos_logged_user');
    const savedPass = localStorage.getItem('chronos_logged_password');
    if (savedUser && savedPass) {
      fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: savedUser, password: savedPass })
      })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Auto login failed response');
      })
      .then(data => {
        if (data && !data.status) {
          setUser(data.user);
          setStrengths(data.strengths);
          setWeaknesses(data.weaknesses);
          setDetailedAnalysis(data.detailedAnalysis || {});
          setTopicBreakdowns(data.topicBreakdowns || {});
          setHistory(data.history);
          setRatings({
            Math: data.user.math_rating || 100,
            Physics: data.user.physics_rating || 100,
            Chemistry: data.user.chemistry_rating || 100
          });
        }
        setAutoLoginLoading(false);
      })
      .catch(err => {
        console.error("Auto login failed:", err);
        setAutoLoginLoading(false);
      });
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');

    const targetUser = loginModalMode === 'setup_recovery' ? recoverySetupUserId : loginUsername.trim();
    if (!targetUser || !loginPassword) {
      setLoginError('Username and password are required');
      return;
    }

    setLoginLoading(true);
    try {
      const payload = {
        username: targetUser,
        password: loginPassword
      };

      if (loginModalMode === 'setup_recovery') {
        if (!recoveryQuestion.trim() || !recoveryAnswer.trim()) {
          setLoginError('Recovery question and answer are required');
          setLoginLoading(false);
          return;
        }
        payload.recoveryQuestion = recoveryQuestion.trim();
        payload.recoveryAnswer = recoveryAnswer.trim();
        payload.isSettingRecovery = true;
      }

      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        if (data.status === 'recovery_setup_required') {
          setRecoverySetupUserId(data.user_id);
          setRecoverySetupIsNew(!!data.isNew);
          setLoginModalMode('setup_recovery');
        } else {
          setUser(data.user);
          setStrengths(data.strengths);
          setWeaknesses(data.weaknesses);
          setDetailedAnalysis(data.detailedAnalysis || {});
          setTopicBreakdowns(data.topicBreakdowns || {});
          setHistory(data.history);
          setRatings({
            Math: data.user.math_rating || 100,
            Physics: data.user.physics_rating || 100,
            Chemistry: data.user.chemistry_rating || 100
          });
          localStorage.setItem('chronos_logged_user', data.user.user_id);
          localStorage.setItem('chronos_logged_password', loginPassword);
          localStorage.removeItem('chronos_guest_history');
          localStorage.removeItem('chronos_guest_strengths');
          localStorage.removeItem('chronos_guest_weaknesses');
          localStorage.removeItem('chronos_guest_detailed_analysis');
          localStorage.removeItem('chronos_guest_topic_breakdowns');
          localStorage.removeItem('mock_exam_ratings');
          setShowLoginModal(false);
          // Clear modal fields
          setLoginPassword('');
          setRecoveryQuestion('');
          setRecoveryAnswer('');
        }
      } else {
        setLoginError(data.error || 'Failed to login. Please try again.');
      }
    } catch (err) {
      console.error(err);
      setLoginError('Login error. Check console/connection.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleForgotPasswordUsernameSubmit = async (e) => {
    e.preventDefault();
    setLoginError('');
    if (!loginUsername.trim()) {
      setLoginError('Please enter your username');
      return;
    }
    setLoginLoading(true);
    try {
      const response = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername.trim(), step: 1 })
      });
      const data = await response.json();
      if (response.ok) {
        setResetQuestion(data.recoveryQuestion);
        setLoginModalMode('forgot_verify');
      } else {
        setLoginError(data.error || 'User not found or recovery not set.');
      }
    } catch (err) {
      console.error(err);
      setLoginError('Error verifying username.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    setLoginError('');
    if (!resetAnswer.trim() || !resetNewPassword) {
      setLoginError('Answer and new password are required');
      return;
    }
    setLoginLoading(true);
    try {
      const response = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginUsername.trim(),
          step: 2,
          answer: resetAnswer.trim(),
          newPassword: resetNewPassword
        })
      });
      const data = await response.json();
      if (response.ok) {
        alert('Password successfully reset! You can now log in.');
        setLoginPassword(resetNewPassword);
        setResetAnswer('');
        setResetNewPassword('');
        setLoginModalMode('login');
      } else {
        setLoginError(data.error || 'Incorrect answer to recovery question.');
      }
    } catch (err) {
      console.error(err);
      setLoginError('Error resetting password.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    const guestHistory = localStorage.getItem('chronos_guest_history');
    setHistory(guestHistory ? JSON.parse(guestHistory) : []);
    const guestRatings = localStorage.getItem('mock_exam_ratings');
    setRatings(guestRatings ? JSON.parse(guestRatings) : { Math: 100, Physics: 100, Chemistry: 100 });
    const guestStrengths = localStorage.getItem('chronos_guest_strengths');
    setStrengths(guestStrengths ? JSON.parse(guestStrengths) : []);
    const guestWeaknesses = localStorage.getItem('chronos_guest_weaknesses');
    setWeaknesses(guestWeaknesses ? JSON.parse(guestWeaknesses) : []);
    const guestDetailedAnalysis = localStorage.getItem('chronos_guest_detailed_analysis');
    setDetailedAnalysis(guestDetailedAnalysis ? JSON.parse(guestDetailedAnalysis) : {});
    const guestTopicBreakdowns = localStorage.getItem('chronos_guest_topic_breakdowns');
    setTopicBreakdowns(guestTopicBreakdowns ? JSON.parse(guestTopicBreakdowns) : {});
    setSelectedTopicDetail(null);
    localStorage.removeItem('chronos_logged_user');
    localStorage.removeItem('chronos_logged_password');
  };

  const refreshUserData = () => {
    if (!user) return;
    const password = localStorage.getItem('chronos_logged_password') || '';
    fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user.user_id, password })
    })
    .then(res => res.json())
    .then(loginData => {
      if (loginData.success) {
        setUser(loginData.user);
        setStrengths(loginData.strengths || []);
        setWeaknesses(loginData.weaknesses || []);
        setDetailedAnalysis(loginData.detailedAnalysis || {});
        setTopicBreakdowns(loginData.topicBreakdowns || {});
        setHistory(loginData.history || []);
        setRatings({
          Math: loginData.user.math_rating,
          Physics: loginData.user.physics_rating,
          Chemistry: loginData.user.chemistry_rating
        });
      }
    }).catch(err => console.error("Failed to refresh user data:", err));
  };

  const startExam = (config) => {
    if (!user) {
      setPendingConfig(config);
      setShowConversionPrompt(true);
    } else {
      setExamConfig({ ...config, username: user.user_id });
      setCurrentScreen('exam');
    }
  };

  const finishExam = (results) => {
    const subject = examConfig.subject;
    const currentRating = ratings[subject] || 100;

    const getQuestionRating = (sub, diff) => {
      const d = Math.max(1, Math.min(10, diff));
      if (sub === 'Math') {
        const mathMap = { 1: 500, 2: 600, 3: 800, 4: 900, 5: 1000, 6: 1250, 7: 1500, 8: 2000, 9: 2500, 10: 3000 };
        return mathMap[Math.round(d)] || 1000;
      } else if (sub === 'Chemistry') {
        const chemMap = { 1: 100, 2: 300, 3: 500, 4: 750, 5: 1000, 6: 1250, 7: 1500, 8: 2000, 9: 2500, 10: 3000 };
        return chemMap[Math.round(d)] || 1000;
      } else if (sub === 'Physics') {
        const physMap = { 1: 100, 2: 300, 3: 500, 4: 750, 5: 1000, 6: 1300, 7: 1600, 8: 2000, 9: 2500, 10: 3000 };
        return physMap[Math.round(d)] || 1000;
      }
      return 100;
    };

    const totalQuestions = results.length;
    const correctAnswers = results.filter(r => r.isCorrect).length;
    const score = correctAnswers / totalQuestions;

    const sumQuestionRatings = results.reduce((acc, r) => acc + getQuestionRating(subject, r.difficulty || 5), 0);
    const avgQuestionRating = sumQuestionRatings / totalQuestions;

    let expectedScore = 1 / (1 + Math.pow(10, (avgQuestionRating - currentRating) / 400));
    if (avgQuestionRating < currentRating) {
      expectedScore = Math.max(expectedScore, 0.75);
    }
    const subHistory = [...history].filter(h => h.subject === subject).reverse();
    let isChallenged = false;
    let consecutiveFailCount = 0;
    for (const h of subHistory) {
      if (h.accuracy < 0.75) {
        consecutiveFailCount++;
      } else {
        consecutiveFailCount = 0;
      }
      if (consecutiveFailCount >= 2) {
        isChallenged = true;
      }
    }
    if (score < 0.75) {
      consecutiveFailCount++;
    } else {
      consecutiveFailCount = 0;
    }
    const hasBeenChallenged = isChallenged || consecutiveFailCount >= 2;
    const K = hasBeenChallenged ? 32 : 250;
    const ratingChange = Math.round(K * (score - expectedScore));
    const newRating = Math.max(100, currentRating + ratingChange);

    setRatings(prev => ({ ...prev, [subject]: newRating }));

    // Send result to DB
    const examIdStr = `${Date.now()}`;
    setCurrentExamId(examIdStr);
    setGradingLoading(true);

    fetch('/api/submit-exam', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: user?.user_id || 'default_user',
        subject,
        examId: examIdStr,
        accuracy: score,
        avgTime: avgQuestionRating,
        ratingChange,
        newRating,
        results: results.map(r => ({
          id: r.id,
          topic: r.topic || 'General',
          question: r.question,
          type: r.type,
          options: r.options,
          answer: r.answer,
          difficulty: r.difficulty,
          userAnswer: r.userAnswer,
          isCorrect: r.isCorrect,
          timeSpent: r.timeSpent,
          timeOut: r.timeOut,
          difficultyAtTime: r.difficultyAtTime
        }))
      })
    })
    .then(res => res.json())
    .then(submitData => {
      // Overwrite results, rating, and change with AI-graded values if present
      if (submitData.results) {
        setExamResults({
          results: submitData.results,
          subject,
          oldRating: currentRating,
          newRating: submitData.newRating ?? newRating,
          ratingChange: submitData.ratingChange ?? ratingChange,
          mistakePatterns: submitData.mistakePatterns
        });
        if (submitData.newRating !== undefined) {
          setRatings(prev => ({ ...prev, [subject]: submitData.newRating }));
        }
      } else {
        setExamResults({
          results,
          subject,
          oldRating: currentRating,
          newRating,
          ratingChange
        });
      }

      // Inject fresh diagnosis + mistake patterns into analytics immediately
      if (submitData.detailedAnalysis || submitData.mistakePatterns) {
        setDetailedAnalysis(prev => ({
          ...prev,
          [subject]: submitData.detailedAnalysis || prev[subject]
        }));
        
        if (!submitData.results) {
          setExamResults(prev => prev ? {
            ...prev,
            mistakePatterns: submitData.mistakePatterns || prev.mistakePatterns
          } : prev);
        }
      }
      
      // Then re-login to refresh all state (history, strengths, weaknesses, etc.) if logged in
      if (user) {
        const password = localStorage.getItem('chronos_logged_password') || '';
        fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: user.user_id, password })
        })
        .then(res2 => res2.json())
        .then(data => {
          setUser(data.user);
          setStrengths(data.strengths);
          setWeaknesses(data.weaknesses);
          setDetailedAnalysis(data.detailedAnalysis || {});
          setTopicBreakdowns(data.topicBreakdowns || {});
          setHistory(data.history);
          setRatings({
            Math: data.user.math_rating || 100,
            Physics: data.user.physics_rating || 100,
            Chemistry: data.user.chemistry_rating || 100
          });
          setCurrentScreen('analytics');
          setGradingLoading(false);
        })
        .catch(() => {
          setCurrentScreen('analytics');
          setGradingLoading(false);
        });
      } else {
        const guestHistoryItem = {
          subject,
          created_at: new Date().toISOString(),
          accuracy: submitData.accuracy ?? score,
          rating_change: submitData.ratingChange ?? ratingChange,
          new_rating: submitData.newRating ?? newRating,
          exam_id: examIdStr
        };
        const guestHistory = JSON.parse(localStorage.getItem('chronos_guest_history') || '[]');
        const updatedHistory = [guestHistoryItem, ...guestHistory];
        setHistory(updatedHistory);
        localStorage.setItem('chronos_guest_history', JSON.stringify(updatedHistory));

        if (submitData.results) {
          const topicStats = {};
          const localStrengths = [];
          const localWeaknesses = [];
          
          for (const r of submitData.results) {
            const topic = r.topic || 'General';
            if (!topicStats[topic]) topicStats[topic] = { correct: 0, total: 0 };
            topicStats[topic].total += 1;
            if (r.isCorrect) topicStats[topic].correct += 1;
          }
          
          for (const [topic, stats] of Object.entries(topicStats)) {
            const acc = stats.correct / stats.total;
            if (acc >= 0.7) {
              localStrengths.push(topic);
            } else if (acc < 0.6) {
              localWeaknesses.push(topic);
            }
          }
          
          const guestStrengths = Array.from(new Set([...strengths.map(s => typeof s === 'object' ? s.topic : s), ...localStrengths])).map(topic => ({ subject, topic }));
          const guestWeaknesses = Array.from(new Set([...weaknesses.map(w => typeof w === 'object' ? w.topic : w), ...localWeaknesses])).map(topic => ({ subject, topic }));
          
          setStrengths(guestStrengths);
          setWeaknesses(guestWeaknesses);
          
          localStorage.setItem('chronos_guest_strengths', JSON.stringify(guestStrengths));
          localStorage.setItem('chronos_guest_weaknesses', JSON.stringify(guestWeaknesses));
        }

        setCurrentScreen('analytics');
        setGradingLoading(false);
      }
    })
    .catch(err => {
      console.error("Error submitting exam:", err);
      setExamResults({
        results,
        subject,
        oldRating: currentRating,
        newRating,
        ratingChange
      });
      setCurrentScreen('analytics');
      setGradingLoading(false);
    });
  };

  const reviewPastExam = async (h) => {
    setLoadingExamId(h.exam_id);
    try {
      const res = await fetch(`/api/get-exam?examId=${h.exam_id}`);
      if (!res.ok) {
        throw new Error('Failed to fetch exam results');
      }
      const data = await res.json();
      setExamConfig({ subject: h.subject });
      setCurrentExamId(h.exam_id);
      setExamResults({
        results: data.results,
        subject: h.subject,
        oldRating: h.new_rating - h.rating_change,
        newRating: h.new_rating,
        ratingChange: h.rating_change,
        mistakePatterns: data.mistakePatterns,
        savedTags: data.savedTags || []
      });
      setCurrentScreen('analytics');
    } catch (err) {
      console.error(err);
      alert('Could not retrieve full exam details. Past history might not have question data stored.');
    } finally {
      setLoadingExamId(null);
    }
  };

  const restart = () => {
    setExamConfig(null);
    setExamResults(null);
    setCurrentScreen('setup');
  };

  const filteredStrengths = strengths
    .filter(s => s.subject === selectedSubject)
    .map(s => s.topic);

  const filteredWeaknesses = weaknesses
    .filter(w => w.subject === selectedSubject)
    .map(w => w.topic);

  return (
    <div className="app-container">
      <header className="app-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--header-padding)' }}>
        <div 
          className="logo text-gradient" 
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
          onClick={restart}
        >
          <BrainCircuit size={32} color="var(--accent-primary)" />
          Chronos Bot
        </div>
        <div>
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button 
                className={`btn ${currentScreen === 'dashboard' ? 'btn-primary' : 'btn-outline'}`} 
                style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }} 
                onClick={() => setCurrentScreen(currentScreen === 'dashboard' ? 'setup' : 'dashboard')}
              >
                <BarChart3 size={16} /> Analytics
              </button>
              <div style={{ position: 'relative' }}>
                <button 
                  className="btn btn-outline"
                  style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                >
                  <User size={14} /> {user.user_id}
                </button>
                {showUserDropdown && (
                  <div style={{
                    position: 'absolute',
                    right: 0,
                    top: '100%',
                    marginTop: '0.5rem',
                    background: 'var(--bg-secondary)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.25rem',
                    zIndex: 100,
                    minWidth: '120px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                  }}>
                    <button 
                      className="btn btn-outline" 
                      style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none', color: 'var(--danger)', padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '0.85rem' }}
                      onClick={() => {
                        handleLogout();
                        setShowUserDropdown(false);
                      }}
                    >
                      <LogOut size={14} /> Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <button 
              className="btn btn-primary" 
              style={{ padding: '0.4rem 1rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }} 
              onClick={() => !autoLoginLoading && setShowLoginModal(true)}
              disabled={autoLoginLoading}
            >
              {autoLoginLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Logging in
                </>
              ) : (
                <>
                  <LogIn size={16} /> Login
                </>
              )}
            </button>
          )}
        </div>
      </header>

      <main className="animate-fade-in" style={{ padding: 'var(--main-padding)' }}>
        {gradingLoading ? (
          <div className="glass-panel animate-fade-in" style={{ padding: 'var(--panel-padding-lg)', textAlign: 'center', maxWidth: '600px', margin: '4rem auto' }}>
            <Loader2 className="animate-spin text-gradient" size={48} style={{ margin: '0 auto 1rem' }} />
            <h3>AI Grading Your Exam...</h3>
            <p style={{ color: 'var(--text-secondary)' }}>Critically deriving correct solutions, analyzing your step-by-step logic, and calculating partial credit.</p>
          </div>
        ) : (
          <>
            {currentScreen === 'setup' && (
          <div style={{ display: 'grid', gridTemplateColumns: user ? '1fr 1fr' : '1fr', gap: '2rem', maxWidth: user ? '1200px' : '600px', margin: '0 auto', alignItems: 'stretch' }}>
            <SetupScreen onStart={startExam} ratings={ratings} onSubjectChange={setSelectedSubject} />
            {user && (
              <div className="glass-panel animate-fade-in" style={{ padding: 'var(--panel-padding)', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
                <h3 className="text-gradient" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Award size={24} /> {user.user_id}'s {selectedSubject} Analytics Dashboard
                </h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ padding: 'var(--card-padding-sm)', background: 'rgba(74, 222, 128, 0.05)', border: '1px solid rgba(74, 222, 128, 0.2)', borderRadius: 'var(--radius-sm)' }}>
                    <h4 style={{ color: 'var(--success)', marginBottom: '0.5rem', fontSize: '0.95rem' }}>{selectedSubject} Strengths</h4>
                    {filteredStrengths.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {filteredStrengths.map((s, i) => (
                          <span 
                            key={i} 
                            style={{ 
                              background: 'rgba(74, 222, 128, 0.1)', 
                              color: 'var(--success)', 
                              padding: '0.25rem 0.6rem', 
                              borderRadius: '4px', 
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              border: selectedTopicDetail?.topic === s && selectedTopicDetail?.type === 'strength' ? '1px solid var(--success)' : '1px solid transparent',
                              transition: 'all 0.2s ease',
                              userSelect: 'none'
                            }}
                            onClick={() => setSelectedTopicDetail(prev => prev?.topic === s && prev?.type === 'strength' ? null : { topic: s, type: 'strength' })}
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Keep practicing to reveal strengths!</span>
                    )}
                  </div>
                  <div style={{ padding: 'var(--card-padding-sm)', background: 'rgba(248, 113, 113, 0.05)', border: '1px solid rgba(248, 113, 113, 0.2)', borderRadius: 'var(--radius-sm)' }}>
                    <h4 style={{ color: 'var(--danger)', marginBottom: '0.5rem', fontSize: '0.95rem' }}>{selectedSubject} Weaknesses</h4>
                    {filteredWeaknesses.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {filteredWeaknesses.map((w, i) => (
                          <span 
                            key={i} 
                            style={{ 
                              background: 'rgba(248, 113, 113, 0.1)', 
                              color: 'var(--danger)', 
                              padding: '0.25rem 0.6rem', 
                              borderRadius: '4px', 
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              border: selectedTopicDetail?.topic === w && selectedTopicDetail?.type === 'weakness' ? '1px solid var(--danger)' : '1px solid transparent',
                              transition: 'all 0.2s ease',
                              userSelect: 'none'
                            }}
                            onClick={() => setSelectedTopicDetail(prev => prev?.topic === w && prev?.type === 'weakness' ? null : { topic: w, type: 'weakness' })}
                          >
                            {w}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Keep practicing to reveal weaknesses!</span>
                    )}
                  </div>
                </div>

                {selectedTopicDetail && (
                  <div style={{ 
                    marginBottom: '1.5rem', 
                    padding: 'var(--card-padding-sm)', 
                    background: selectedTopicDetail.type === 'strength' ? 'rgba(74, 222, 128, 0.03)' : 'rgba(248, 113, 113, 0.03)', 
                    border: `1px solid ${selectedTopicDetail.type === 'strength' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(248, 113, 113, 0.2)'}`, 
                    borderRadius: 'var(--radius-md)',
                    animation: 'fade-in 0.3s ease'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: '600' }}>
                        Topic Detail: <strong style={{ color: selectedTopicDetail.type === 'strength' ? 'var(--success)' : 'var(--danger)' }}>{selectedTopicDetail.topic}</strong>
                      </h4>
                      <button 
                        className="btn btn-outline" 
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', height: 'auto', minHeight: 'auto' }} 
                        onClick={() => setSelectedTopicDetail(null)}
                      >
                        Close
                      </button>
                    </div>
                    {topicBreakdowns[selectedTopicDetail.topic] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem', lineHeight: '1.6' }}>
                        <div>
                          <span style={{ color: 'var(--success)', fontWeight: '600', display: 'block', marginBottom: '0.2rem' }}>✓ What you are good at:</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{topicBreakdowns[selectedTopicDetail.topic].good_at}</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--danger)', fontWeight: '600', display: 'block', marginBottom: '0.2rem' }}>✗ What you are not good at:</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{topicBreakdowns[selectedTopicDetail.topic].not_good_at}</span>
                        </div>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        No specific AI-breakdown stored yet for this topic. Complete more sessions to analyze details!
                      </span>
                    )}
                  </div>
                )}



                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                  <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem', color: 'var(--text-primary)', flexShrink: 0 }}>Past Exam History (Last 25)</h4>
                  {history.length > 0 ? (
                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '0.5rem' }}>
                      {history.map((h, i) => (
                        <div 
                          key={i} 
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            background: 'var(--bg-tertiary)', 
                            padding: '0.75rem', 
                            borderRadius: 'var(--radius-sm)', 
                            border: '1px solid rgba(255,255,255,0.05)', 
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                          }}
                          className="history-row"
                          onClick={() => loadingExamId === null && reviewPastExam(h)}
                        >
                          <div>
                            <strong style={{ color: 'var(--accent-primary)' }}>{h.subject}</strong>
                            <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{formatDate(h.created_at)}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <span style={{ color: h.accuracy >= 0.70 ? 'var(--success)' : h.accuracy >= 0.40 ? 'var(--warning)' : 'var(--danger)' }}>{Math.round(h.accuracy * 100)}% Acc</span>
                            <strong style={{ color: h.rating_change >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                              {h.rating_change >= 0 ? `+${h.rating_change}` : h.rating_change} ({h.new_rating})
                            </strong>
                            <span style={{ 
                              fontSize: '0.75rem', 
                              color: 'var(--accent-secondary)', 
                              textDecoration: 'underline',
                              marginLeft: '0.5rem',
                              opacity: 0.8
                            }}>
                              {loadingExamId === h.exam_id ? 'Loading...' : 'Review'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No tests taken yet. Start a session to build your history!</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {currentScreen === 'exam' && examConfig && (
          <ExamScreen config={examConfig} onFinish={finishExam} />
        )}
        {currentScreen === 'analytics' && examResults && (
          <AnalyticsScreen
            results={examResults}
            onRestart={restart}
            user={user}
            examId={currentExamId}
            strengths={strengths}
            weaknesses={weaknesses}
            detailedAnalysis={detailedAnalysis}
            topicBreakdowns={topicBreakdowns}
            history={history}
            loadingExamId={loadingExamId}
            onReviewExam={reviewPastExam}
            formatDate={formatDate}
            onRefreshData={refreshUserData}
          />
        )}
        {currentScreen === 'dashboard' && user && (
          <AnalyticsDashboard
            user={user}
            onBack={restart}
            strengths={strengths}
            weaknesses={weaknesses}
            topicBreakdowns={topicBreakdowns}
            detailedAnalysis={detailedAnalysis}
            history={history}
            loadingExamId={loadingExamId}
            onReviewExam={reviewPastExam}
            formatDate={formatDate}
          />
        )}
          </>
        )}
      </main>

      {/* Sign-In Conversion Warning Modal */}
      {showConversionPrompt && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-panel animate-fade-in" style={{ padding: 'var(--card-padding)', width: '90%', maxWidth: '440px', textAlign: 'center', background: 'var(--bg-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <BrainCircuit size={40} color="var(--accent-primary)" style={{ margin: '0 auto 1rem' }} />
            <h3 className="text-gradient" style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>Save Your Progress?</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '2rem' }}>
              You are currently playing as a <strong>Guest</strong>. Sign in or register an account to save your exam history, ELO rankings, and get access to detailed AI weakness diagnostics across sessions!
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button 
                type="button" 
                className="btn btn-primary" 
                style={{ width: '100%', padding: '0.75rem' }} 
                onClick={() => {
                  setShowConversionPrompt(false);
                  setShowLoginModal(true);
                }}
              >
                Sign In / Create Account
              </button>
              <button 
                type="button" 
                className="btn btn-outline" 
                style={{ width: '100%', padding: '0.75rem' }} 
                onClick={() => {
                  setShowConversionPrompt(false);
                  if (pendingConfig) {
                    setExamConfig({ ...pendingConfig, username: 'default_user' });
                    setCurrentScreen('exam');
                  }
                }}
              >
                Continue as Guest
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Login Modal */}
      {showLoginModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-panel animate-fade-in" style={{ padding: 'var(--card-padding)', width: '90%', maxWidth: '420px', textAlign: 'center', background: 'var(--bg-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}>
            
            {loginModalMode === 'login' && (
              <>
                <h3 className="text-gradient" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <User size={24} /> Login / Register
                </h3>
                {loginError && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>{loginError}</p>}
                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <input
                    type="text"
                    placeholder="Enter Username"
                    className="input-field"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    disabled={loginLoading}
                    required
                    style={{ textAlign: 'center' }}
                  />
                  <input
                    type="password"
                    placeholder="Enter Password"
                    className="input-field"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    disabled={loginLoading}
                    required
                    style={{ textAlign: 'center' }}
                  />
                  <button 
                    type="button" 
                    className="btn btn-link" 
                    style={{ fontSize: '0.8rem', color: 'var(--accent-secondary)', alignSelf: 'flex-end', padding: 0, border: 'none', background: 'none', cursor: 'pointer', opacity: 0.8 }}
                    onClick={() => {
                      setLoginError('');
                      setLoginModalMode('forgot_username');
                    }}
                  >
                    Forgot Password?
                  </button>
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '0.5rem' }}>
                    <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setShowLoginModal(false); setLoginError(''); setLoginPassword(''); }} disabled={loginLoading}>Cancel</button>
                    <button type="submit" className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }} disabled={loginLoading}>
                      {loginLoading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Submit
                    </button>
                  </div>
                </form>
                <p style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  New user? Choose a username/password, then complete the security setup on next step!
                </p>
              </>
            )}

            {loginModalMode === 'setup_recovery' && (
              <>
                <h3 className="text-gradient" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <User size={24} /> {recoverySetupIsNew ? 'New User Security' : 'Security Update'}
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: '1.4' }}>
                  Please set a personal recovery question only you know the answer to. This is required to recover your account if you forget your password.
                </p>
                {loginError && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>{loginError}</p>}
                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <input
                    type="text"
                    placeholder="Enter recovery question (e.g. My childhood pet's name)"
                    className="input-field"
                    value={recoveryQuestion}
                    onChange={(e) => setRecoveryQuestion(e.target.value)}
                    disabled={loginLoading}
                    required
                  />
                  <input
                    type="text"
                    placeholder="Enter answer"
                    className="input-field"
                    value={recoveryAnswer}
                    onChange={(e) => setRecoveryAnswer(e.target.value)}
                    disabled={loginLoading}
                    required
                  />
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '0.5rem' }}>
                    <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setLoginModalMode('login'); setLoginError(''); }} disabled={loginLoading}>Back</button>
                    <button type="submit" className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }} disabled={loginLoading}>
                      {loginLoading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Save & Login
                    </button>
                  </div>
                </form>
              </>
            )}

            {loginModalMode === 'forgot_username' && (
              <>
                <h3 className="text-gradient" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <User size={24} /> Recovery Verification
                </h3>
                {loginError && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>{loginError}</p>}
                <form onSubmit={handleForgotPasswordUsernameSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <input
                    type="text"
                    placeholder="Enter your Username"
                    className="input-field"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    disabled={loginLoading}
                    required
                    style={{ textAlign: 'center' }}
                  />
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                    <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setLoginModalMode('login'); setLoginError(''); }} disabled={loginLoading}>Cancel</button>
                    <button type="submit" className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }} disabled={loginLoading}>
                      Verify User
                    </button>
                  </div>
                </form>
              </>
            )}

            {loginModalMode === 'forgot_verify' && (
              <>
                <h3 className="text-gradient" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <User size={24} /> Reset Password
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem', background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
                  Question: <strong>{resetQuestion}</strong>
                </p>
                {loginError && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>{loginError}</p>}
                <form onSubmit={handleResetPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <input
                    type="text"
                    placeholder="Enter your Answer"
                    className="input-field"
                    value={resetAnswer}
                    onChange={(e) => setResetAnswer(e.target.value)}
                    disabled={loginLoading}
                    required
                  />
                  <input
                    type="password"
                    placeholder="Enter New Password"
                    className="input-field"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    disabled={loginLoading}
                    required
                  />
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '0.5rem' }}>
                    <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setLoginModalMode('login'); setLoginError(''); }} disabled={loginLoading}>Back</button>
                    <button type="submit" className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }} disabled={loginLoading}>
                      Reset Password
                    </button>
                  </div>
                </form>
              </>
            )}

          </div>
        </div>
      )}
    </div>
  );
}

export default App;
