import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, UserCheck } from 'lucide-react';
import { runGoogleScript } from '../apiShim.js';

const GUEST_USER = 'default_user';

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

export function CheckInScreen({ onBack, user }) {
  const isGuest = !user || user.user_id === GUEST_USER;

  // Student ID is the login password, stored in chronos_student_id cookie on login.
  const [idInfo, setIdInfo] = useState(() => {
    const cookieId = getCookie('chronos_student_id');
    if (cookieId) {
      return { loading: false, studentId: cookieId, error: '' };
    }
    if (isGuest) {
      return { loading: false, studentId: null, error: '' };
    }
    if (!getCookie('chronos_logged_token')) {
      return { loading: false, studentId: null, error: 'Log in to check in — your student ID comes from your account.' };
    }
    return { loading: true, studentId: null, error: '' };
  });

  const [information, setInformation] = useState('');
  const [message, setMessage] = useState('');
  const [leavingEarly, setLeavingEarly] = useState(false);
  const [leavingTime, setLeavingTime] = useState('');

  const [manualStudentId, setManualStudentId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState('Fill in the form to check-in and get your schedule for the day.');
  const [result, setResult] = useState(null);

  // Sync idInfo when user state changes (login/logout while on this screen)
  useEffect(() => {
    const cookieId = getCookie('chronos_student_id');
    if (cookieId) {
      setIdInfo({ loading: false, studentId: cookieId, error: '' });
    } else if (isGuest) {
      setIdInfo({ loading: false, studentId: null, error: '' });
    } else if (!getCookie('chronos_logged_token')) {
      setIdInfo({ loading: false, studentId: null, error: 'Log in to check in — your student ID comes from your account.' });
    } else {
      setIdInfo({ loading: true, studentId: null, error: '' });
    }
  }, [user?.user_id]);

  useEffect(() => {
    if (!idInfo.loading) return;
    if (getCookie('chronos_student_id')) return;
  useEffect(() => {
    if (!idInfo.loading) return;

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/student-id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: getCookie('chronos_logged_token'), studentIdLookup: true })
        });
        const data = await response.json();
        if (cancelled) return;

        if (response.ok && data.studentId) {
          setIdInfo({ loading: false, studentId: data.studentId, error: '' });
        } else {
          setIdInfo({ loading: false, studentId: null, error: data.error || 'Could not read the student ID on your account.' });
        }
      } catch {
        if (!cancelled) {
          setIdInfo({ loading: false, studentId: null, error: 'Could not reach the server to read your student ID.' });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [idInfo.loading]);

  // The Updates blurb is optional — it only renders if Code.gs exposes getInformation().
  useEffect(() => {
    let cancelled = false;
    runGoogleScript('getInformation')
      .then((info) => {
        if (!cancelled && typeof info === 'string' && info.length) setInformation(info);
      })
      .catch(() => { /* not deployed with an Updates source; leave the block hidden */ });
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = useCallback(async () => {
    const sid = idInfo.studentId || manualStudentId.trim();
    if (!sid || submitting) return;
    if (!idInfo.studentId || submitting) return;

    setSubmitting(true);
    setStatus('Loading...');

    try {
      const response = await runGoogleScript(
        'query',
        sid,
        idInfo.studentId,
        message,
        leavingEarly ? leavingTime : ''
      );

      if (response && response.name) {
        setResult(response);
        setStatus('Thanks for checking in.');
      } else {
        setStatus('Something went wrong — your account\'s student ID was not found on the roster. Please see a coach.');
        setStatus('Something went wrong — your account’s student ID was not found on the roster. Please see a coach.');
      }
    } catch {
      setStatus('Check-in is unavailable right now. It only works on the Apps Script deployment.');
    } finally {
      setSubmitting(false);
    }
  }, [idInfo.studentId, manualStudentId, message, leavingEarly, leavingTime, submitting]);

  const canSubmit = (!!idInfo.studentId || manualStudentId.trim().length > 0) && !submitting;
  }, [idInfo.studentId, message, leavingEarly, leavingTime, submitting]);

  const canSubmit = !!idInfo.studentId && !submitting;

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '1rem 0.5rem' }}>
      {onBack && (
        <button
          onClick={onBack}
          className="btn btn-outline"
          style={{ marginBottom: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <ArrowLeft size={16} /> Back to Main App
        </button>
      )}

      <div
        className="glass-panel animate-fade-in"
        style={{ padding: 0, overflow: 'hidden' }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
            padding: '1.75rem 1.5rem',
            textAlign: 'center'
          }}
        >
          <h1 style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'clamp(1.4rem, 1.1rem + 1.5vw, 1.9rem)',
            fontWeight: 700,
            color: '#fff',
            letterSpacing: '-0.02em',
            margin: 0
          }}>
            Rancho MATHCOUNTS 2025–26
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.85)', margin: '0.35rem 0 0', fontSize: '0.95rem' }}>
            Rancho San Joaquin Middle School
          </p>
        </div>

        <div style={{ padding: 'var(--card-padding)' }}>
          {information && (
            <div
              className="animate-fade-in"
              style={{
                background: 'rgba(99, 102, 241, 0.1)',
                borderLeft: '3px solid var(--accent-primary)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.85rem 1rem',
                marginBottom: '1.25rem'
              }}
            >
              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>Updates</p>
              <p
                style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}
                dangerouslySetInnerHTML={{ __html: information }}
              />
            </div>
          )}

          {result ? (
            <div className="animate-fade-in" style={{ textAlign: 'center', padding: '1rem 0' }}>
              <CheckCircle2 size={40} color="var(--success)" style={{ marginBottom: '0.75rem' }} />
              <h2 className="text-gradient" style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 'clamp(1.5rem, 1.2rem + 1vw, 2rem)',
                fontWeight: 700,
                marginBottom: '0.5rem'
              }}>
                Welcome, {result.name}!
              </h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: result.message ? '1.25rem' : 0 }}>
                {status}
              </p>
              {result.message && (
                <div
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--bg-glass-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1rem',
                    textAlign: 'left',
                    color: 'var(--text-primary)',
                    fontSize: '0.95rem',
                    lineHeight: 1.6
                  }}
                  dangerouslySetInnerHTML={{ __html: result.message }}
                />
              )}
            </div>
          ) : (
            <>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--bg-glass-border)',
                borderRadius: 'var(--radius-md)',
                padding: '0.7rem 0.9rem',
                marginBottom: '1.25rem',
                fontSize: '0.9rem'
              }}>
                {idInfo.loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" color="var(--text-muted)" />
                    <span style={{ color: 'var(--text-secondary)' }}>Looking up your student ID…</span>
                  </>
                ) : idInfo.studentId ? (
                  <>
                    <UserCheck size={16} color="var(--success)" />
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Checking in as <strong style={{ color: 'var(--text-primary)' }}>{user.user_id}</strong>
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={16} color="var(--warning)" />
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {idInfo.error || 'Log in to check in — your student ID comes from your account.'}
                    </span>
                  </>
                )}
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label
                  htmlFor="checkin-message"
                  style={{
                    display: 'block',
                    marginBottom: '0.4rem',
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem'
                  }}
                >
                  Message
                </label>
                <textarea
                  id="checkin-message"
                  className="input-field"
                  autoComplete="off"
                  placeholder="Send a message to our coaches ‣ Leaving early? ‣ Want resources? ‣ Submitting a link to homework? ‣ Feedback for the program?"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  style={{ minHeight: '9rem', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem' }}>
                <input
                  type="checkbox"
                  id="checkin-leaving"
                  checked={leavingEarly}
                  onChange={(e) => setLeavingEarly(e.target.checked)}
                  style={{ width: '1rem', height: '1rem', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                />
                <label
                  htmlFor="checkin-leaving"
                  style={{ color: 'var(--text-primary)', fontSize: '0.9rem', whiteSpace: 'nowrap', cursor: 'pointer' }}
                >
                  Leaving Early?
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="What time?"
                  value={leavingTime}
                  onChange={(e) => setLeavingTime(e.target.value)}
                  style={{ flex: '0 0 auto', width: '50%', visibility: leavingEarly ? 'visible' : 'hidden' }}
                />
              </div>

              {(!idInfo.studentId) && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <label
                    htmlFor="checkin-studentid"
                    style={{
                      display: 'block',
                      marginBottom: '0.4rem',
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      fontSize: '0.9rem'
                    }}
                  >
                    Student ID
                  </label>
                  <input
                    id="checkin-studentid"
                    className="input-field"
                    type="text"
                    autoComplete="off"
                    placeholder="Enter your student ID"
                    value={manualStudentId}
                    onChange={(e) => setManualStudentId(e.target.value)}
                  />
                </div>
              )}

              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={!canSubmit}
                style={{
                  width: '100%',
                  padding: '0.75rem 1.5rem',
                  fontSize: '1.05rem',
                  fontWeight: 600,
                  opacity: canSubmit ? 1 : 0.55,
                  cursor: canSubmit ? 'pointer' : 'not-allowed'
                }}
              >
                {submitting ? <><Loader2 size={18} className="animate-spin" /> Submitting…</> : 'Submit'}
              </button>

              <p style={{
                marginTop: '1rem',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '0.85rem'
              }}>
                {status}
              </p>
            </>
          )}
        </div>
      </div>

      <p style={{
        marginTop: '1.25rem',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: '0.8rem',
        lineHeight: 1.6
      }}>
        Please direct any questions to our advisor, Mrs. Gastelum, at{' '}
        <a href="mailto:LizGastelum@iusd.org" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)' }}>
          LizGastelum@iusd.org
        </a>{' '}
        or in room B6.
      </p>
    </div>
  );
}
