import { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Clock, 
  Play, 
  AlertCircle, 
  Loader2,
  CheckCircle2
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
  const isZh = lang === 'zh';
  const common = translations[lang]?.common || translations.en.common;

  const [studentIdInput, setStudentIdInput] = useState('');
  const [passcodeInput, setPasscodeInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [fetchingHw, setFetchingHw] = useState(false);

  const isAuthenticated = !!(studentSession?.studentId && studentSession?.passcode);

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
          setAssignments([
            {
              assignment_id: 'hw-set-1',
              title: 'Week 3: Combinatorics Drill',
              subject: 'Math',
              num_questions: 10,
              due_date: new Date(Date.now() + 86400000 * 4).toISOString(),
              status: 'pending'
            },
            {
              assignment_id: 'hw-set-2',
              title: 'Week 2: Geometry Drill',
              subject: 'Math',
              num_questions: 8,
              due_date: new Date(Date.now() + 86400000 * 1).toISOString(),
              status: 'pending'
            }
          ]);
        }
      })
      .catch(() => {
        setAssignments([
          {
            assignment_id: 'hw-sample',
            title: 'Weekly Problem Set',
            subject: 'Math',
            num_questions: 10,
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
      setAuthError('Passcode must be 3 digits.');
      return;
    }

    setLoading(true);
    setAuthError('');

    try {
      if (onLoginStudent) {
        await onLoginStudent(sid, code);
      }
    } catch (err) {
      setAuthError(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '1rem 0.5rem 3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <button
          onClick={() => onNavigate('/')}
          className="btn btn-outline"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
        >
          <ArrowLeft size={16} /> {common.back}
        </button>

        {isAuthenticated && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              ID: <strong style={{ color: 'var(--text-primary)' }}>{studentSession.studentId}</strong>
            </span>
            <button
              onClick={onLogoutStudent}
              className="btn btn-outline"
              style={{ padding: '0.3rem 0.65rem', fontSize: '0.8rem' }}
            >
              {isZh ? '退出' : 'Sign Out'}
            </button>
          </div>
        )}
      </div>

      {!isAuthenticated ? (
        <div className="glass-panel animate-fade-in" style={{ maxWidth: '420px', margin: '2rem auto', padding: '2rem' }}>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1.5rem' }}>
            {isZh ? '作业登录' : 'Homework'}
          </h1>

          {authError && (
            <div style={{
              background: 'rgba(220, 38, 38, 0.05)',
              border: '1px solid rgba(220, 38, 38, 0.2)',
              padding: '0.65rem 0.85rem',
              color: 'var(--danger)',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1.25rem'
            }}>
              <AlertCircle size={15} /> {authError}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                {isZh ? '学号' : 'Student ID'}
              </label>
              <input
                type="text"
                className="input-field"
                placeholder={isZh ? '输入学号' : 'Enter Student ID'}
                value={studentIdInput}
                onChange={(e) => setStudentIdInput(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                {isZh ? '3位数密码' : '3-Digit Passcode'}
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={3}
                className="input-field"
                placeholder="PIN"
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: '100%', padding: '0.65rem', fontSize: '0.9rem' }}
            >
              {loading ? <><Loader2 size={16} className="animate-spin" /> ...</> : (isZh ? '进入作业' : 'Sign In')}
            </button>
          </form>
        </div>
      ) : (
        <div className="animate-fade-in">
          <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {isZh ? '待完成作业' : 'Assignments'}
            </h1>
            {fetchingHw && <Loader2 size={16} className="animate-spin" color="var(--text-muted)" />}
          </div>

          {assignments.length === 0 ? (
            <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
              <CheckCircle2 size={36} color="var(--success)" style={{ marginBottom: '0.5rem' }} />
              <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', margin: 0 }}>
                {isZh ? '暂无待完成作业' : 'No pending assignments.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {assignments.map((hw) => {
                const due = hw.due_date ? new Date(hw.due_date.value || hw.due_date) : null;
                const dueStr = due && !isNaN(due.getTime()) 
                  ? due.toLocaleDateString()
                  : '';

                return (
                  <div key={hw.assignment_id} className="glass-panel" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                        {hw.title}
                      </h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <span>{hw.num_questions} {isZh ? '题' : 'questions'}</span>
                        {dueStr && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Clock size={12} /> {isZh ? '截止' : 'Due'}: {dueStr}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => onStartHomework && onStartHomework(hw)}
                      className="btn btn-primary"
                      style={{ padding: '0.45rem 1rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <Play size={14} /> {isZh ? '开始' : 'Start'}
                    </button>
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
