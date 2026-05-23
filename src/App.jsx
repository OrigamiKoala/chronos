import { useState, useEffect } from 'react';
import { SetupScreen } from './components/SetupScreen';
import { ExamScreen } from './components/ExamScreen';
import { AnalyticsScreen } from './components/AnalyticsScreen';
import { BrainCircuit } from 'lucide-react';

function App() {
  const [currentScreen, setCurrentScreen] = useState('setup');
  const [examConfig, setExamConfig] = useState(null);
  const [examResults, setExamResults] = useState(null);
  const [ratings, setRatings] = useState(() => {
    const saved = localStorage.getItem('mock_exam_ratings');
    return saved ? JSON.parse(saved) : { Math: 100, Physics: 100, Chemistry: 100 };
  });

  useEffect(() => {
    localStorage.setItem('mock_exam_ratings', JSON.stringify(ratings));
  }, [ratings]);

  const startExam = (config) => {
    setExamConfig(config);
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

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo text-gradient">
          <BrainCircuit size={32} color="var(--accent-primary)" />
          Mock-Exam Stress Sandbox
        </div>
      </header>

      <main className="animate-fade-in">
        {currentScreen === 'setup' && <SetupScreen onStart={startExam} ratings={ratings} />}
        {currentScreen === 'exam' && examConfig && (
          <ExamScreen config={examConfig} onFinish={finishExam} />
        )}
        {currentScreen === 'analytics' && examResults && (
          <AnalyticsScreen results={examResults} onRestart={restart} />
        )}
      </main>
    </div>
  );
}

export default App;
