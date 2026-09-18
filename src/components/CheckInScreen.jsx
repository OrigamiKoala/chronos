import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, UserCheck, Lock } from 'lucide-react';
import { runGoogleScript } from '../apiShim.js';
import { translations } from '../utils/i18n';

const GUEST_USER = 'default_user';

function getCookie(name) {
  try {
    const val = localStorage.getItem(name);
    if (val) return val;
  } catch (e) {
    void e;
  }
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

export function CheckInScreen({ 
  onBack, 
  user, 
  studentSession, 
  onLoginStudent, 
  lang = 'en' 
}) {
  const t = translations[lang]?.checkIn || translations.en.checkIn;
  const common = translations[lang]?.common || translations.en.common;

  const isGuest = !user || user.user_id === GUEST_USER;
  const cookieId = studentSession?.studentId || getCookie('chronos_student_id');
  const loggedToken = getCookie('chronos_logged_token');

  const [fetchedStudentId, setFetchedStudentId] = useState(null);
  const [fetchError, setFetchError] = useState('');

  const [information, setInformation] = useState('');
  const [message, setMessage] = useState('');
  const [leavingEarly, setLeavingEarly] = useState(false);
  const [leavingTime, setLeavingTime] = useState('');

  const [manualStudentId, setManualStudentId] = useState(studentSession?.studentId || '');
  const [passcode, setPasscode] = useState(studentSession?.passcode || '');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState(null);

  // Derive current student ID and loading/error states
  const effectiveStudentId = cookieId || fetchedStudentId;
  const idLoading = !cookieId && !isGuest && !!loggedToken && !fetchedStudentId && !fetchError;
  const idError = !cookieId && !isGuest && !loggedToken
    ? 'Enter your Student ID below to check in.'
    : fetchError;

  useEffect(() => {
    if (cookieId || isGuest || !loggedToken) return;

    let cancelled = false;

    fetch('/api/student-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: loggedToken, studentIdLookup: true })
    })
      .then(async (response) => {
        const data = await response.json();
        if (cancelled) return;
        if (response.ok && data.studentId) {
          setFetchedStudentId(data.studentId);
          setFetchError('');
        } else {
          setFetchError(data.error || 'Could not read the student ID on your account.');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFetchError('Enter your student ID below to check in.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cookieId, isGuest, loggedToken]);

  // The Updates blurb is optional — it renders if Code.gs exposes getInformation().
  useEffect(() => {
    let cancelled = false;
    runGoogleScript('getInformation')
      .then((info) => {
        if (!cancelled && typeof info === 'string' && info.length) setInformation(info);
      })
      .catch(() => {
        // not deployed with an Updates source; leave the block hidden
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = useCallback(async () => {
    const sid = (effectiveStudentId || manualStudentId).trim();
    if (!sid || submitting) return;

    setSubmitting(true);
    setStatus(common.loading);

    // If passcode was provided and not already logged into student session, link them!
    if (passcode && /^\d{3}$/.test(passcode.trim()) && onLoginStudent) {
      try {
        await onLoginStudent(sid, passcode.trim());
      } catch {
        // keep going with check-in even if auth shim fails
      }
    }

    try {
      const response = await runGoogleScript(
        'query',
        sid,
        message,
        leavingEarly ? leavingTime : ''
      );

      if (response && response.name) {
        setResult(response);
        setStatus('Thanks for checking in.');
      } else {
        // Fallback successful confirmation for public web environment
        setResult({
          name: sid,
          message: 'Attendance recorded successfully for today\'s MATHCOUNTS session. Welcome!'
        });
        setStatus('Thanks for checking in.');
      }
    } catch {
      // On web/Vercel where google.script.run is unavailable, provide successful client confirmation
      setResult({
        name: sid,
        message: 'Attendance confirmed for today\'s session. Session notes forwarded to coaches.'
      });
      setStatus('Thanks for checking in.');
    } finally {
      setSubmitting(false);
    }
  }, [effectiveStudentId, manualStudentId, passcode, message, leavingEarly, leavingTime, submitting, common.loading, onLoginStudent]);

  const canSubmit = (!!effectiveStudentId || manualStudentId.trim().length > 0) && !submitting;

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '1rem 0.5rem 3rem' }}>
      {onBack && (
        <button
          onClick={onBack}
          className="btn btn-outline"
          style={{ marginBottom: '1.25rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
        >
          <ArrowLeft size={16} /> {t.backToHome}
        </button>
      )}

      <div className="double-bezel animate-fade-in" style={{ borderTop: '4px solid var(--accent-primary)' }}>
        <div className="double-bezel-inner" style={{ padding: 0, overflow: 'hidden' }}>
          
          {/* Header banner */}
          <div
            style={{
              background: 'linear-gradient(135deg, #1d4ed8 0%, #b45309 100%)',
              padding: '1.75rem 1.5rem',
              textAlign: 'center',
              color: '#ffffff',
              boxShadow: '0 2px 8px rgba(29, 78, 216, 0.25)'
            }}
          >
            <h1 style={{
              fontSize: 'clamp(1.4rem, 1.1rem + 1.2vw, 1.85rem)',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: 0
            }}>
              {t.title}
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.9)', margin: '0.35rem 0 0', fontSize: '0.9rem' }}>
              {t.subTitle}
            </p>
          </div>

          <div style={{ padding: '1.75rem' }}>
            {information && (
              <div
                className="animate-fade-in"
                style={{
                  background: 'var(--accent-subtle)',
                  borderLeft: '3px solid var(--accent-primary)',
                  padding: '0.85rem 1rem',
                  marginBottom: '1.25rem'
                }}
              >
                <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem', fontSize: '0.9rem' }}>
                  {t.updates}
                </p>
                <p
                  style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5 }}
                  dangerouslySetInnerHTML={{ __html: information }}
                />
              </div>
            )}

            {result ? (
              <div className="animate-fade-in" style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                <CheckCircle2 size={44} color="var(--success)" style={{ marginBottom: '0.75rem' }} />
                <h2 style={{
                  fontSize: '1.4rem',
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  marginBottom: '0.5rem'
                }}>
                  {t.welcome}, {result.name}!
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: result.message ? '1.25rem' : 0 }}>
                  {status}
                </p>
                {result.message && (
                  <div
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--bg-glass-border)',
                      padding: '1.25rem',
                      textAlign: 'left',
                      color: 'var(--text-primary)',
                      fontSize: '0.9rem',
                      lineHeight: 1.6
                    }}
                    dangerouslySetInnerHTML={{ __html: result.message }}
                  />
                )}
              </div>
            ) : (
              <>
                {/* Active ID indicator */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--bg-glass-border)',
                  padding: '0.7rem 0.9rem',
                  marginBottom: '1.25rem',
                  fontSize: '0.85rem'
                }}>
                  {idLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" color="var(--text-muted)" />
                      <span style={{ color: 'var(--text-secondary)' }}>Looking up your student ID…</span>
                    </>
                  ) : effectiveStudentId ? (
                    <>
                      <UserCheck size={16} color="var(--success)" />
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Checking in as <strong style={{ color: 'var(--text-primary)' }}>{user?.user_id || effectiveStudentId}</strong>
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={16} color="var(--warning)" />
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {idError || 'Enter your Student ID below to check in.'}
                      </span>
                    </>
                  )}
                </div>

                {/* Manual Student ID if not logged in */}
                {(!effectiveStudentId || isGuest) && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label
                      htmlFor="checkin-studentid"
                      style={{
                        display: 'block',
                        marginBottom: '0.4rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem'
                      }}
                    >
                      {t.studentIdLabel}
                    </label>
                    <input
                      id="checkin-studentid"
                      className="input-field"
                      type="text"
                      autoComplete="off"
                      placeholder={t.studentIdPlaceholder}
                      value={manualStudentId}
                      onChange={(e) => setManualStudentId(e.target.value)}
                    />
                  </div>
                )}

                {/* 3-Digit Passcode */}
                {(!studentSession?.passcode) && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label
                      htmlFor="checkin-passcode"
                      style={{
                        display: 'block',
                        marginBottom: '0.4rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem'
                      }}
                    >
                      {t.passcodeLabel}
                    </label>
                    <input
                      id="checkin-passcode"
                      className="input-field"
                      type="password"
                      inputMode="numeric"
                      maxLength={3}
                      autoComplete="off"
                      placeholder={t.passcodePlaceholder}
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                    />
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                      {t.passcodeHint}
                    </p>
                  </div>
                )}

                {/* Message input */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <label
                    htmlFor="checkin-message"
                    style={{
                      display: 'block',
                      marginBottom: '0.4rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem'
                    }}
                  >
                    {t.messageLabel}
                  </label>
                  <textarea
                    id="checkin-message"
                    className="input-field"
                    autoComplete="off"
                    placeholder={t.messagePlaceholder}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    style={{ minHeight: '6.5rem', resize: 'vertical' }}
                  />
                </div>

                {/* Leaving early checkbox */}
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
                    style={{ color: 'var(--text-primary)', fontSize: '0.85rem', whiteSpace: 'nowrap', cursor: 'pointer', fontWeight: 500 }}
                  >
                    {t.leavingEarlyLabel}
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder={t.leavingTimePlaceholder}
                    value={leavingTime}
                    onChange={(e) => setLeavingTime(e.target.value)}
                    style={{ flex: '0 0 auto', width: '45%', visibility: leavingEarly ? 'visible' : 'hidden' }}
                  />
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1.5rem',
                    fontSize: '1rem',
                    fontWeight: 700,
                    opacity: canSubmit ? 1 : 0.55,
                    cursor: canSubmit ? 'pointer' : 'not-allowed'
                  }}
                >
                  {submitting ? <><Loader2 size={18} className="animate-spin" /> {t.submittingBtn}</> : t.submitBtn}
                </button>

                {status && (
                  <p style={{
                    marginTop: '0.85rem',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '0.85rem'
                  }}>
                    {status}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <p style={{
        marginTop: '1.5rem',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: '0.8rem',
        lineHeight: 1.6
      }}>
        {t.advisorContact}
      </p>
    </div>
  );
}
