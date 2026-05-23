import { useState } from 'react';
import { Settings, Play, ShieldAlert, Timer } from 'lucide-react';

export function SetupScreen({ onStart }) {
  const [config, setConfig] = useState({
    subject: 'Math and Logic',
    startingDifficulty: 5,
    numQuestions: 5,
    stressMode: 'dynamic', // 'none', 'hidden', 'strict', 'dynamic'
    timeLimitPerQuestion: 60, // seconds
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setConfig((prev) => ({ ...prev, [name]: isNaN(value) ? value : Number(value) || value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onStart(config);
  };

  return (
    <div className="glass-panel" style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <Settings size={28} className="text-gradient" />
        <h2>Configure Exam Session</h2>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Subject</label>
          <select name="subject" value={config.subject} onChange={handleChange} className="input-field">
            <option value="Math and Logic">Math and Logic</option>
            <option value="Physics">Physics</option>
            <option value="Computer Science">Computer Science</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Questions</label>
            <input type="number" name="numQuestions" min="1" max="20" value={config.numQuestions} onChange={handleChange} className="input-field" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Start Difficulty (1-10)</label>
            <input type="number" name="startingDifficulty" min="1" max="10" value={config.startingDifficulty} onChange={handleChange} className="input-field" />
          </div>
        </div>

        <div style={{ padding: '1.5rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--danger-glass)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--danger)' }}>
            <ShieldAlert size={20} />
            <h3 style={{ margin: 0 }}>Stress Factors</h3>
          </div>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Stress Mode</label>
            <select name="stressMode" value={config.stressMode} onChange={handleChange} className="input-field">
              <option value="none">None (Standard Timer)</option>
              <option value="hidden">Hidden Clock (Reveals last 10s)</option>
              <option value="strict">Strict (Auto-skip on zero)</option>
              <option value="dynamic">Dynamic (Visually speeds up near end)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
              <Timer size={16} /> Time Per Question (Seconds)
            </label>
            <input type="number" name="timeLimitPerQuestion" min="10" max="300" value={config.timeLimitPerQuestion} onChange={handleChange} className="input-field" />
          </div>
        </div>

        <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem', width: '100%' }}>
          <Play size={20} /> Start Mock Exam
        </button>
      </form>
    </div>
  );
}
