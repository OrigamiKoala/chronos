import { useState } from 'react';
import { Settings, Play, ShieldAlert, Timer } from 'lucide-react';

const getSubjectLevelName = (subject, rating) => {
  if (subject === 'Math') {
    if (rating >= 3000) return 'IMO Level';
    if (rating >= 2500) return 'USAMO Level';
    if (rating >= 1500) return 'AIME Level';
    if (rating >= 1000) return 'Intermediate AMC 10/12 Level';
    return 'Basic School Math Level';
  } else if (subject === 'Chemistry') {
    if (rating >= 3000) return 'IMChO Level';
    if (rating >= 2500) return 'IChO Level';
    if (rating >= 2000) return 'Camp Level';
    if (rating >= 1500) return 'USNCO Honors Level';
    if (rating >= 1000) return 'USNCO Level';
    if (rating >= 500) return 'AP Chem / ACS Local level';
    return 'Basic Honors/AP Chem Level';
  } else if (subject === 'Physics') {
    if (rating >= 3000) return 'IPhO Level';
    if (rating >= 2500) return 'Camp Level';
    if (rating >= 2000) return 'USAPhO Level';
    if (rating >= 1000) return 'F=ma Level';
    if (rating >= 500) return 'AP Physics Level';
    return 'Basic HS Physics Level';
  }
  return 'Novice';
};

export function SetupScreen({ onStart, ratings = { Math: 100, Physics: 100, Chemistry: 100 } }) {
  const [config, setConfig] = useState({
    subject: 'Math',
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
          <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
            <span>Subject</span>
            <span style={{ color: 'var(--accent-primary)', fontWeight: '600' }}>
              Rating: {ratings[config.subject] || 100} ({getSubjectLevelName(config.subject, ratings[config.subject] || 100)})
            </span>
          </label>
          <select name="subject" value={config.subject} onChange={handleChange} className="input-field">
            <option value="Math">Math</option>
            <option value="Physics">Physics</option>
            <option value="Chemistry">Chemistry</option>
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

        {config.subject === 'Math' && (
          <div style={{ padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255, 255, 255, 0.1)', fontSize: '0.85rem' }}>
            <span style={{ fontWeight: '600', color: 'var(--text-primary)', display: 'block', marginBottom: '0.5rem' }}>Math Difficulty Scale Reference:</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', color: 'var(--text-secondary)' }}>
              <div><strong>1:</strong> MATHCOUNTS school/chapter</div>
              <div><strong>5:</strong> AMC 12 question 20-ish</div>
              <div><strong>8:</strong> Average USAJMO problem</div>
              <div><strong>10:</strong> Hardest IMO problems</div>
            </div>
          </div>
        )}

        {config.subject === 'Physics' && (
          <div style={{ padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255, 255, 255, 0.1)', fontSize: '0.85rem' }}>
            <span style={{ fontWeight: '600', color: 'var(--text-primary)', display: 'block', marginBottom: '0.5rem' }}>Physics Difficulty Scale Reference:</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', color: 'var(--text-secondary)' }}>
              <div><strong>1:</strong> Introductory level</div>
              <div><strong>3:</strong> AP Physics C level</div>
              <div><strong>5:</strong> F=ma level</div>
              <div><strong>8:</strong> USAPhO level</div>
              <div><strong>10:</strong> Hardest problem on IPhO</div>
            </div>
          </div>
        )}

        {config.subject === 'Chemistry' && (
          <div style={{ padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255, 255, 255, 0.1)', fontSize: '0.85rem' }}>
            <span style={{ fontWeight: '600', color: 'var(--text-primary)', display: 'block', marginBottom: '0.5rem' }}>Chemistry Difficulty Scale Reference:</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', color: 'var(--text-secondary)' }}>
              <div><strong>1:</strong> Simple Honors/early AP chem</div>
              <div><strong>3:</strong> Harder problems on ACS Local Exam</div>
              <div><strong>5:</strong> Harder problems on USNCO Nationals</div>
              <div><strong>10:</strong> Hardest problem on IChO</div>
            </div>
          </div>
        )}

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
