import { useState, useEffect } from 'react';
import { SetupScreen } from './components/SetupScreen';
import { ExamScreen } from './components/ExamScreen';
import { AnalyticsScreen } from './components/AnalyticsScreen';
import { BrainCircuit, Award, LogIn, LogOut, User, Loader2 } from 'lucide-react';

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
  const [strengths, setStrengths] = useState([]);
  const [weaknesses, setWeaknesses] = useState([]);
  const [detailedAnalysis, setDetailedAnalysis] = useState({});
  const [topicBreakdowns, setTopicBreakdowns] = useState({});
  const [selectedTopicDetail, setSelectedTopicDetail] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState('Math');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const formatDate = (dateVal) => {
    if (!dateVal) return '';
    const dateStr = typeof dateVal === 'object' && dateVal.value ? dateVal.value : dateVal;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? 'Recent' : d.toLocaleDateString();
  };

  useEffect(() => {
    localStorage.setItem('mock_exam_ratings', JSON.stringify(ratings));
  }, [ratings]);



  // Auto-login on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('chronos_logged_user');
    if (savedUser) {
      fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: savedUser })
      })
      .then(res => {
        if (res.ok) return res.json();
      })
      .then(data => {
        if (data) {
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
      })
      .catch(err => console.error("Auto login failed:", err));
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginUsername.trim()) return;
    setLoginLoading(true);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername.trim() })
      });
      if (response.ok) {
        const data = await response.json();
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
        setShowLoginModal(false);
      } else {
        alert("Failed to login/register. Please check backend connection.");
      }
    } catch (err) {
      console.error(err);
      alert("Login error. Check console.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setStrengths([]);
    setWeaknesses([]);
    setDetailedAnalysis({});
    setTopicBreakdowns({});
    setSelectedTopicDetail(null);
    setHistory([]);
    setRatings({ Math: 100, Physics: 100, Chemistry: 100 });
    localStorage.removeItem('chronos_logged_user');
  };

  const startExam = (config) => {
    setExamConfig({ ...config, username: user ? user.user_id : 'default_user' });
    setCurrentScreen('exam');
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

    const expectedScore = 1 / (1 + Math.pow(10, (avgQuestionRating - currentRating) / 400));
    const K = 32;
    const ratingChange = Math.round(K * (score - expectedScore));
    const newRating = Math.max(100, currentRating + ratingChange);

    setRatings(prev => ({ ...prev, [subject]: newRating }));

    // Send result to DB if logged in
    if (user) {
      fetch('/api/submit-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.user_id,
          subject,
          examId: `${Date.now()}`,
          accuracy: score,
          avgTime: avgQuestionRating,
          ratingChange,
          newRating,
          results: results.map(r => ({
            topic: r.topic || 'General',
            isCorrect: r.isCorrect
          }))
        })
      })
      .then(res => {
        if (res.ok) {
          // Re-fetch user data to update weaknesses and history
          fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user.user_id })
          })
          .then(res2 => res2.json())
          .then(data => {
            setUser(data.user);
            setStrengths(data.strengths);
            setWeaknesses(data.weaknesses);
            setDetailedAnalysis(data.detailedAnalysis || {});
            setTopicBreakdowns(data.topicBreakdowns || {});
            setHistory(data.history);
          });
        }
      })
      .catch(err => console.error("Error submitting exam:", err));
    }

    setExamResults({
      results,
      subject,
      oldRating: currentRating,
      newRating,
      ratingChange
    });
    setCurrentScreen('analytics');
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
      <header className="app-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 2rem' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Welcome, <strong style={{ color: 'var(--accent-primary)' }}>{user.user_id}</strong></span>
              <button className="btn btn-outline" style={{ padding: '0.4rem 1rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }} onClick={handleLogout}>
                <LogOut size={16} /> Logout
              </button>
            </div>
          ) : (
            <button className="btn btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }} onClick={() => setShowLoginModal(true)}>
              <LogIn size={16} /> Login
            </button>
          )}
        </div>
      </header>

      <main className="animate-fade-in" style={{ padding: '2rem 1rem' }}>
        {currentScreen === 'setup' && (
          <div style={{ display: 'grid', gridTemplateColumns: user ? '1fr 1fr' : '1fr', gap: '2rem', maxWidth: user ? '1200px' : '600px', margin: '0 auto', alignItems: 'stretch' }}>
            <SetupScreen onStart={startExam} ratings={ratings} onSubjectChange={setSelectedSubject} />
            {user && (
              <div className="glass-panel animate-fade-in" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
                <h3 className="text-gradient" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Award size={24} /> {user.user_id}'s {selectedSubject} Analytics Dashboard
                </h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ padding: '1rem', background: 'rgba(74, 222, 128, 0.05)', border: '1px solid rgba(74, 222, 128, 0.2)', borderRadius: 'var(--radius-sm)' }}>
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
                  <div style={{ padding: '1rem', background: 'rgba(248, 113, 113, 0.05)', border: '1px solid rgba(248, 113, 113, 0.2)', borderRadius: 'var(--radius-sm)' }}>
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
                    padding: '1.25rem', 
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

                {detailedAnalysis[selectedSubject] && (
                  <div style={{ 
                    marginBottom: '2rem', 
                    padding: '1.25rem', 
                    background: 'rgba(168, 85, 247, 0.05)', 
                    border: '1px solid rgba(168, 85, 247, 0.2)', 
                    borderRadius: 'var(--radius-md)',
                    boxShadow: '0 4px 20px -2px rgba(168, 85, 247, 0.1)'
                  }}>
                    <h4 style={{ color: 'var(--accent-secondary)', marginBottom: '0.75rem', fontSize: '1rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <BrainCircuit size={18} /> Detailed {selectedSubject} Diagnosis
                    </h4>
                    <p style={{ fontSize: '0.875rem', lineHeight: '1.6', color: 'var(--text-secondary)', margin: 0, whiteSpace: 'pre-line' }}>
                      {detailedAnalysis[selectedSubject]}
                    </p>
                  </div>
                )}

                <div>
                  <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem', color: 'var(--text-primary)' }}>Past Exam History (Last 25)</h4>
                  {history.length > 0 ? (
                    <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '0.5rem' }}>
                      {history.map((h, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-tertiary)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.85rem' }}>
                          <div>
                            <strong style={{ color: 'var(--accent-primary)' }}>{h.subject}</strong>
                            <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{formatDate(h.created_at)}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <span style={{ color: h.accuracy >= 0.70 ? 'var(--success)' : h.accuracy >= 0.40 ? 'var(--warning)' : 'var(--danger)' }}>{Math.round(h.accuracy * 100)}% Acc</span>
                            <strong style={{ color: h.rating_change >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                              {h.rating_change >= 0 ? `+${h.rating_change}` : h.rating_change} ({h.new_rating})
                            </strong>
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
          <AnalyticsScreen results={examResults} onRestart={restart} />
        )}
      </main>

      {/* Login Modal */}
      {showLoginModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-panel animate-fade-in" style={{ padding: '2.5rem', width: '90%', maxWidth: '400px', textAlign: 'center' }}>
            <h3 className="text-gradient" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              <User size={24} /> Login / Register
            </h3>
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowLoginModal(false)} disabled={loginLoading}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }} disabled={loginLoading}>
                  {loginLoading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Submit
                </button>
              </div>
            </form>
            <p style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Entering a new username automatically registers it!</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
