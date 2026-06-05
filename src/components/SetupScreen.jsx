import { useState, useEffect } from 'react';
import { Settings, Play, ShieldAlert, Timer, ClipboardList } from 'lucide-react';

const getSubjectLevelName = (subject, rating) => {
  if (subject === 'Math') {
    if (rating >= 3000) return 'IMO Level';
    if (rating >= 2500) return 'USAMO Level';
    if (rating >= 1500) return 'AIME Level';
    if (rating >= 1000) return 'Intermediate AMC 10/12 Level';
    return 'School Math Level';
  } else if (subject === 'Chemistry') {
    if (rating >= 3000) return 'IMChO Level';
    if (rating >= 2500) return 'IChO Level';
    if (rating >= 2000) return 'Camp Level';
    if (rating >= 1500) return 'USNCO Honors Level';
    if (rating >= 1000) return 'USNCO Level';
    if (rating >= 500) return 'AP Chem / ACS Local level';
    return 'Honors/AP Chem Level';
  } else if (subject === 'Physics') {
    if (rating >= 3000) return 'IPhO Level';
    if (rating >= 2500) return 'Camp Level';
    if (rating >= 2000) return 'USAPhO Level';
    if (rating >= 1000) return 'F=ma Level';
    if (rating >= 500) return 'AP Physics Level';
    return 'HS Physics Level';
  }
  return 'Novice';
};

export function SetupScreen({ onStart, ratings = { Math: 100, Physics: 100, Chemistry: 100 }, onSubjectChange, user }) {
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('chronos_exam_config');
    const parsed = saved ? JSON.parse(saved) : null;
    let formatVal = parsed?.examFormat || ['multiple_choice', 'short_answer', 'free_response'];
    if (typeof formatVal === 'string') {
      if (formatVal === 'multiple_choice') formatVal = ['multiple_choice'];
      else if (formatVal === 'short_answer') formatVal = ['short_answer'];
      else if (formatVal === 'free_response') formatVal = ['free_response'];
      else formatVal = ['multiple_choice', 'short_answer', 'free_response'];
    }
    return {
      subject: parsed?.subject || 'Math',
      startingDifficulty: parsed?.startingDifficulty || 5,
      numQuestions: parsed?.numQuestions || 5,
      stressMode: parsed?.stressMode || 'dynamic',
      timeLimitPerQuestion: parsed?.timeLimitPerQuestion || 60,
      timeLimitWholeTest: parsed?.timeLimitWholeTest || 30,
      timeLimitStyle: parsed?.timeLimitStyle || 'per_question',
      examFormat: formatVal,
    };
  });

  const [homeworks, setHomeworks] = useState([]);

  useEffect(() => {
    localStorage.setItem('chronos_exam_config', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    if (onSubjectChange) {
      onSubjectChange(config.subject);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user?.user_role === 'student' && user?.user_organization && user?.user_id) {
      fetch(`/api/student-homework?organization=${encodeURIComponent(user.user_organization)}&username=${encodeURIComponent(user.user_id)}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.assignments) {
            setHomeworks(data.assignments);
          }
        })
        .catch(err => {
          console.error("Error loading student homework:", err);
        });
    } else {
      setTimeout(() => setHomeworks([]), 0);
    }
  }, [user]);

  const [selectedPreset, setSelectedPreset] = useState('custom');

  const handleApplyPreset = (preset) => {
    setSelectedPreset(preset);
    if (preset === 'math_chapter') {
      setConfig((prev) => {
        const next = {
          ...prev,
          numQuestions: 40,
          startingDifficulty: 1,
          examFormat: ['short_answer'],
          timeLimitStyle: 'whole_test',
          timeLimitWholeTest: 30,
        };
        delete next.assignmentId;
        delete next.lessonTitle;
        delete next.lessonDescription;
        return next;
      });
    } else if (preset === 'math_state') {
      setConfig((prev) => {
        const next = {
          ...prev,
          numQuestions: 40,
          startingDifficulty: 3,
          examFormat: ['short_answer'],
          timeLimitStyle: 'whole_test',
          timeLimitWholeTest: 30,
        };
        delete next.assignmentId;
        delete next.lessonTitle;
        delete next.lessonDescription;
        return next;
      });
    } else if (preset === 'chem_part_1') {
      setConfig((prev) => {
        const next = {
          ...prev,
          numQuestions: 60,
          startingDifficulty: 3,
          examFormat: ['multiple_choice'],
          timeLimitStyle: 'whole_test',
          timeLimitWholeTest: 90,
        };
        delete next.assignmentId;
        delete next.lessonTitle;
        delete next.lessonDescription;
        return next;
      });
    }
  };

  const handleSelectHomework = (hw) => {
    let formatVal = ['multiple_choice', 'short_answer', 'free_response'];
    if (hw.exam_format) {
      formatVal = hw.exam_format.split(',').map(f => f.trim()).filter(f => f);
    }
    const isContentBased = hw.content_based !== false && hw.content_based !== 0;
    setConfig({
      subject: hw.subject || 'Math',
      startingDifficulty: Number(hw.starting_difficulty) || 5,
      numQuestions: Number(hw.num_questions) || 5,
      stressMode: hw.stress_mode || 'none',
      timeLimitPerQuestion: hw.time_limit_style === 'per_question' ? (Number(hw.time_limit_value) || 60) : 60,
      timeLimitWholeTest: hw.time_limit_style === 'whole_test' ? (Number(hw.time_limit_value) || 30) : 30,
      timeLimitStyle: hw.time_limit_style || 'per_question',
      examFormat: formatVal,
      assignmentId: hw.assignment_id,
      ...(isContentBased ? { lessonTitle: hw.lesson_title, lessonDescription: hw.lesson_description } : {}),
    });
    setSelectedPreset('custom');
    if (onSubjectChange) {
      onSubjectChange(hw.subject);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setConfig((prev) => {
      const next = { ...prev, [name]: isNaN(value) ? value : Number(value) || value };
      if (name === 'timeLimitStyle' && value === 'none') {
        next.stressMode = 'none';
      }
      delete next.assignmentId;
      delete next.lessonTitle;
      delete next.lessonDescription;
      if (name === 'subject' && onSubjectChange) {
        onSubjectChange(value);
      }
      return next;
    });
    setSelectedPreset('custom');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (config.examFormat.length === 0) return;
    onStart(config);
  };

  return (
    <div className="glass-panel" style={{ padding: 'var(--panel-padding)', maxWidth: '600px', margin: '0 auto', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <Settings size={28} className="text-gradient" />
        <h2>Configure Exam Session</h2>
      </div>

      {homeworks.length > 0 && (
        <div style={{
          background: 'rgba(99, 102, 241, 0.05)',
          border: '1px solid rgba(99, 102, 241, 0.2)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem',
          marginBottom: '1.5rem',
          boxSizing: 'border-box'
        }}>
          <h3 style={{
            fontSize: '0.95rem',
            fontWeight: '600',
            color: 'var(--accent-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            margin: '0 0 0.75rem 0'
          }}>
            <ClipboardList size={16} /> Pending Homework Assignments
          </h3>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            maxHeight: '150px',
            overflowY: 'auto',
            paddingRight: '0.25rem'
          }}>
            {homeworks.map(hw => {
              const isSelected = config.assignmentId === hw.assignment_id;
              const due = hw.due_date ? new Date(hw.due_date.value || hw.due_date) : null;
              const dueStr = due && !isNaN(due.getTime()) ? due.toLocaleDateString() + ' ' + due.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'No due date';
              
              return (
                <div
                  key={hw.assignment_id}
                  style={{
                    background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-tertiary)',
                    border: isSelected ? '1px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.03)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.5rem 0.75rem',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={() => handleSelectHomework(hw)}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                    <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{hw.title}</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Lesson: {hw.lesson_title} | {hw.subject} • {hw.num_questions} Qs • Diff {hw.starting_difficulty}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Due: {dueStr}</span>
                    {isSelected && (
                      <span style={{
                        fontSize: '0.65rem',
                        background: 'rgba(99, 102, 241, 0.2)',
                        color: 'var(--accent-primary)',
                        padding: '0.1rem 0.35rem',
                        borderRadius: '4px',
                        fontWeight: 'bold'
                      }}>
                        PREFILLED
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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

        {(config.subject === 'Math' || config.subject === 'Chemistry') && (
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
              Quick Presets
            </label>
            <select
              value={selectedPreset}
              onChange={(e) => handleApplyPreset(e.target.value)}
              className="input-field"
              style={{ borderColor: selectedPreset !== 'custom' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)' }}
            >
              <option value="custom">Custom (Manual Configuration)</option>
              {config.subject === 'Math' && (
                <>
                  <option value="math_chapter">MATHCOUNTS Chapter Sprint (40 SAQ, 30 min, Diff 1)</option>
                  <option value="math_state">MATHCOUNTS State Sprint (40 SAQ, 30 min, Diff 3)</option>
                </>
              )}
              {config.subject === 'Chemistry' && (
                <option value="chem_part_1">Part I (60 MCQ, 90 min, Diff 3)</option>
              )}
            </select>
          </div>
        )}

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

        <div>
          <label style={{ display: 'block', marginBottom: '0.75rem', color: 'var(--text-secondary)', fontWeight: '500' }}>Exam Format (Select one or more)</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: 'var(--card-padding-sm)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', userSelect: 'none' }}>
              <input 
                type="checkbox" 
                checked={config.examFormat.includes('multiple_choice')} 
                onChange={(e) => {
                  const checked = e.target.checked;
                  setConfig(prev => {
                    const formats = checked 
                      ? [...prev.examFormat, 'multiple_choice'] 
                      : prev.examFormat.filter(f => f !== 'multiple_choice');
                    const next = { ...prev, examFormat: formats };
                    delete next.assignmentId;
                    delete next.lessonTitle;
                    delete next.lessonDescription;
                    return next;
                  });
                  setSelectedPreset('custom');
                }}
                style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>Multiple Choice</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', userSelect: 'none' }}>
              <input 
                type="checkbox" 
                checked={config.examFormat.includes('short_answer')} 
                onChange={(e) => {
                  const checked = e.target.checked;
                  setConfig(prev => {
                    const formats = checked 
                      ? [...prev.examFormat, 'short_answer'] 
                      : prev.examFormat.filter(f => f !== 'short_answer');
                    const next = { ...prev, examFormat: formats };
                    delete next.assignmentId;
                    delete next.lessonTitle;
                    delete next.lessonDescription;
                    return next;
                  });
                  setSelectedPreset('custom');
                }}
                style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>Short Answer</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', userSelect: 'none' }}>
              <input 
                type="checkbox" 
                checked={config.examFormat.includes('free_response')} 
                onChange={(e) => {
                  const checked = e.target.checked;
                  setConfig(prev => {
                    const formats = checked 
                      ? [...prev.examFormat, 'free_response'] 
                      : prev.examFormat.filter(f => f !== 'free_response');
                    const next = { ...prev, examFormat: formats };
                    delete next.assignmentId;
                    delete next.lessonTitle;
                    delete next.lessonDescription;
                    return next;
                  });
                  setSelectedPreset('custom');
                }}
                style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>Free Response</span>
            </label>
          </div>
          {config.examFormat.length === 0 && (
            <span style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '0.35rem', display: 'block' }}>
              ⚠️ You must select at least one format.
            </span>
          )}
        </div>

        {config.subject === 'Math' && (
          <div style={{ padding: 'var(--card-padding-sm)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255, 255, 255, 0.1)', fontSize: '0.85rem' }}>
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
          <div style={{ padding: 'var(--card-padding-sm)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255, 255, 255, 0.1)', fontSize: '0.85rem' }}>
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
          <div style={{ padding: 'var(--card-padding-sm)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255, 255, 255, 0.1)', fontSize: '0.85rem' }}>
            <span style={{ fontWeight: '600', color: 'var(--text-primary)', display: 'block', marginBottom: '0.5rem' }}>Chemistry Difficulty Scale Reference:</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', color: 'var(--text-secondary)' }}>
              <div><strong>1:</strong> Honors and early AP Chem</div>
              <div><strong>3:</strong> Harder problems on ACS LSE</div>
              <div><strong>5:</strong> Harder problems on USNCO</div>
              <div><strong>10:</strong> Hardest problem on IChO</div>
            </div>
          </div>
        )}

        <div style={{ padding: 'var(--card-padding)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--danger-glass)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--danger)' }}>
            <ShieldAlert size={20} />
            <h3 style={{ margin: 0 }}>Stress Factors</h3>
          </div>

          {config.timeLimitStyle !== 'none' && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Stress Mode</label>
              <select name="stressMode" value={config.stressMode} onChange={handleChange} className="input-field">
                <option value="none">None (Standard Timer)</option>
                <option value="hidden">Hidden Clock (Reveals last 10s)</option>
                <option value="strict">Strict (Auto-skip on zero)</option>
                <option value="dynamic">Dynamic (Visually speeds up near end)</option>
              </select>
            </div>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Time Limit Style</label>
            <select name="timeLimitStyle" value={config.timeLimitStyle} onChange={handleChange} className="input-field">
              <option value="per_question">Time Limit Per Question</option>
              <option value="whole_test">Time Limit For Whole Test</option>
              <option value="none">No Timer (Untimed)</option>
            </select>
          </div>

          {config.timeLimitStyle !== 'none' && (
            config.timeLimitStyle === 'whole_test' ? (
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                  <Timer size={16} /> Total Test Time (Minutes)
                </label>
                <input type="number" name="timeLimitWholeTest" min="1" max="180" value={config.timeLimitWholeTest} onChange={handleChange} className="input-field" />
              </div>
            ) : (
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                  <Timer size={16} /> Time Per Question (Seconds)
                </label>
                <input type="number" name="timeLimitPerQuestion" min="10" max="300" value={config.timeLimitPerQuestion} onChange={handleChange} className="input-field" />
              </div>
            )
          )}
        </div>

        <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem', width: '100%' }}>
          <Play size={20} /> Start Mock Exam
        </button>
      </form>
    </div>
  );
}
