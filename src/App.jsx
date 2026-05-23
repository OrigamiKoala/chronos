import { useState } from 'react';
import { SetupScreen } from './components/SetupScreen';
import { ExamScreen } from './components/ExamScreen';
import { AnalyticsScreen } from './components/AnalyticsScreen';
import { BrainCircuit } from 'lucide-react';

function App() {
  const [currentScreen, setCurrentScreen] = useState('setup');
  const [examConfig, setExamConfig] = useState(null);
  const [examResults, setExamResults] = useState(null);

  const startExam = (config) => {
    setExamConfig(config);
    setCurrentScreen('exam');
  };

  const finishExam = (results) => {
    setExamResults(results);
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
        {currentScreen === 'setup' && <SetupScreen onStart={startExam} />}
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
