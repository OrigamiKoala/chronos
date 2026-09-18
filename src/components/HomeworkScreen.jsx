import { useState, useEffect } from 'react';
import { 
  FileText, 
  ArrowLeft, 
  KeyRound, 
  UserCheck, 
  CheckCircle2, 
  Clock, 
  Play, 
  AlertCircle, 
  Loader2,
  Lock
} from 'lucide-react';
import { translations } from '../utils/i18n';

export function HomeworkScreen({ 
  studentSession, 
  onLoginStudent, 
  onLogoutStudent, 
  onNavigate, 
  onStartHomework, 
  lang = 'en' 
}) {
  const t = translations[lang]?.homework || translations.en.homework;
  const common = translations[lang]?.common || translations.en.common;

  const [studentIdInput, setStudentIdInput] = useState('');
  const [passcodeInput, setPasscodeInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [fetchingHw, setFetchingHw] = useState(false);

  const isAuthenticated = !!(studentSession?.studentId && studentSession?.passcode);

  // Fetch homework when student is authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setAssignments([]);
      return;
    }

    setFetchingHw(true);
    const org = studentSession.organization || 'Rancho MATHCOUNTS';
    const sid = studentSession.studentId;

    fetch(`/api/student-homework?organization=${encodeURIComponent(org)}&username=${encodeURIComponent(sid)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.assignments && data.assignments.length > 0) {
          setAssignments(data.assignments);
        } else {
          // Curated sample competition assignments if database has no active ones for this student
          setAssignments([
            {
              assignment_id: 'hw-set-1',
              title: 'Week 3: Combinatorics & Permutations Drill',
              lesson_title: 'Counting Principles & Pigeonhole',
              lesson_description: 'Key principles in casework enumeration and complementary counting.',
              subject: 'Math',
              num_questions: 10,
              difficulty: 4,
              due_date: new Date(Date.now() + 86400000 * 4).toISOString(),
              status: 'pending'
            },
            {
              assignment_id: 'hw-set-2',
              title: 'Week 2: Similar Triangles & Power of a Point',
              lesson_title: 'Advanced Geometry Lemmas',
              lesson_description: 'Circle geometry properties frequently tested on Target rounds.',
              subject: 'Math',
              num_questions: 8,
              difficulty: 5,
              due_date: new Date(Date.now() + 86400000 * 1).toISOString(),
              status: 'pending'
            }
          ]);
        }
      })
      .catch(() => {
        // Fallback assignments
        setAssignments([
          {
            assignment_id: 'hw-sample',
            title: 'Weekly Competition Problem Set',
            lesson_title: 'MATHCOUNTS Sprint Warmup',
            lesson_description: 'Focus on speed and accuracy under time pressure.',
            subject: 'Math',
            num_questions: 10,
            difficulty: 3,
            due_date: new Date(Date.now() + 86400000 * 3).toISOString(),
            status: 'pending'
          }
        ]);
      })
      .finally(() => {
        setFetchingHw(false);
      });
  }, [isAuthenticated, studentSession]);

  const handleLogin = async (e) => {
    e?.preventDefault();
    const sid = studentIdInput.trim();
    const code = passcodeInput.trim();

    if (!sid) {
      setAuthError('Please enter your Student ID.');
      return;
    }
    if (!/^\d{3}$/.test(code)) {
      setAuthError('Passcode must be exactly 3 digits (e.g. 789).');
      return;
    }

    setLoading(true);
    setAuthError('');

    try {
      if (onLoginStudent) {
        await onLoginStudent(sid, code);
      }
    } catch (err) {
      setAuthError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
      
      {/* Top action row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <button
          onClick={() => onNavigate('/')}
          className="btn btn-outline"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
        >
          <ArrowLeft size={16} /> {t.backToHome}
        </button>

        {isAuthenticated && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Logged in: <strong style={{ color: 'var(--text-primary)' }}>{studentSession.studentId}</strong>
            </span>
            <button
              onClick={onLogoutStudent}
              className="btn btn-outline"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
            >
              Sign Out
            </button>
          </div>
        )}
      </div>

      {!isAuthenticated ? (
        /* Login Card */
        <div className="double-bezel animate-fade-in" style={{ maxWidth: '520px', margin: '2rem auto', borderTop: '4px solid var(--accent-gold)' }}>
          <div className="double-bezel-inner" style={{ padding: '2.25rem 2rem' }}>
            
            <div style={{
              width: '44px',
              height: '44px',
              background: 'var(--accent-gold-subtle)',
              border: '1px solid var(--accent-gold-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-gold)',
              marginBottom: '1.25rem'
            }}>
              <Lock size={22} />
            </div>

            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
              {t.title}
            </h1>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1.75rem' }}>
              {t.loginPrompt}
            </p>

            {authError && (
              <div style={{
                background: 'rgba(220, 38, 38, 0.06)',
                border: '1px solid rgba(220, 38, 38, 0.25)',
                padding: '0.75rem 1rem',
                color: 'var(--danger)',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '1.25rem'
              }}>
                <AlertCircle size={16} /> {authError}
              </div>
            )}

            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                  {t.studentId}
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Enter Student ID"
                  value={studentIdInput}
                  onChange={(e) => setStudentIdInput(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                  {t.passcode} (3 digits)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={3}
                  className="input-field"
                  placeholder="e.g. 789"
                  value={passcodeInput}
                  onChange={(e) => setPasscodeInput(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  First time? Choose any 3-digit secret PIN. It pairs with your Student ID for Check-In and Homework.
                </p>
              </div>

              <button
                type="submit"
                className="btn btn-gold"
                disabled={loading}
                style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem' }}
              >
                {loading ? <><Loader2 size={16} className="animate-spin" /> Signing In…</> : t.loginBtn}
              </button>
            </form>
          </div>
        </div>
      ) : (
        /* Authenticated Homework List */
        <div className="animate-fade-in">
          
          <div className="double-bezel" style={{ marginBottom: '2rem', borderTop: '4px solid var(--accent-gold)' }}>
            <div className="double-bezel-inner" style={{ padding: '1.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', marginBottom: '0.25rem' }}>
                <UserCheck size={18} />
                <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  Student Dashboard
                </span>
              </div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                {t.title}
              </h1>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                {t.subtitle}
              </p>
            </div>
          </div>

          <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {t.pendingTitle} ({assignments.length})
            </h2>
            {fetchingHw && <Loader2 size={16} className="animate-spin" color="var(--text-muted)" />}
          </div>

          {assignments.length === 0 ? (
            <div className="double-bezel">
              <div className="double-bezel-inner" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
                <CheckCircle2 size={42} color="var(--success)" style={{ marginBottom: '0.75rem' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                  {t.noAssignments}
                </h3>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {assignments.map((hw) => {
                const due = hw.due_date ? new Date(hw.due_date.value || hw.due_date) : null;
                const dueStr = due && !isNaN(due.getTime()) 
                  ? due.toLocaleDateString() + ' ' + due.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : 'No due date';

                return (
                  <div key={hw.assignment_id} className="double-bezel">
                    <div className="double-bezel-inner" style={{ padding: '1.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                            <span style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              background: 'var(--accent-subtle)',
                              color: 'var(--accent-primary)',
                              padding: '0.15rem 0.5rem',
                              border: '1px solid var(--accent-border)',
                              textTransform: 'uppercase'
                            }}>
                              {hw.subject || 'Math'} • Diff {hw.difficulty || 3}
                            </span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              {hw.num_questions} {t.questions}
                            </span>
                          </div>
                          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                            {hw.title}
                          </h3>
                        </div>

                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          fontSize: '0.8rem',
                          color: 'var(--text-secondary)',
                          background: 'var(--bg-tertiary)',
                          padding: '0.3rem 0.65rem',
                          border: '1px solid var(--bg-glass-border)'
                        }}>
                          <Clock size={14} /> {t.due}: {dueStr}
                        </div>
                      </div>

                      {hw.lesson_title && (
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
                          <strong>Lesson:</strong> {hw.lesson_title} {hw.lesson_description && `— ${hw.lesson_description}`}
                        </p>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                        <button
                          onClick={() => {
                            if (onStartHomework) {
                              onStartHomework(hw);
                            }
                          }}
                          className="btn btn-primary"
                          style={{ padding: '0.55rem 1.25rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                        >
                          <Play size={15} /> {t.startAssignment}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}

    </div>
  );
}
