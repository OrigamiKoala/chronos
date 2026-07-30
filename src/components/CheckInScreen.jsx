import { useState, useEffect } from 'react';
import { ArrowLeft, UserCheck, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

const API_ENDPOINT = '/api/check-in';

export function CheckInScreen({ onBack }) {
  const [information, setInformation] = useState('');
  const [studentId, setStudentId] = useState('');
  const [yap, setYap] = useState('');
  const [leavingEarly, setLeavingEarly] = useState(false);
  const [leavingText, setLeavingText] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('Fill in the form to check-in and get your schedule for the day.');
  const [errorMessage, setErrorMessage] = useState('');
  
  const [checkedIn, setCheckedIn] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [responseMessage, setResponseMessage] = useState('');

  // Fetch initial updates/information via Vercel serverless proxy
  useEffect(() => {
    let isMounted = true;
    fetch(`${API_ENDPOINT}?action=info`)
      .then(res => res.json())
      .then(data => {
        if (isMounted && data && data.information) {
          setInformation(data.information);
        }
      })
      .catch(err => {
        console.warn('Could not fetch info update from API endpoint:', err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!studentId.trim()) {
      setErrorMessage('Please enter your Student ID.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setStatusText('Loading...');

    const payload = {
      id: studentId.trim(),
      yap: yap.trim(),
      leavingText: leavingEarly ? leavingText.trim() : ''
    };

    let result = null;

    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        result = await response.json();
      }
    } catch (err) {
      console.warn('POST submission via API proxy failed, trying GET fallback:', err);
    }

    // Fallback to GET via API proxy if POST fails
    if (!result) {
      try {
        const queryParams = new URLSearchParams({
          action: 'query',
          id: payload.id,
          yap: payload.yap,
          leavingText: payload.leavingText
        }).toString();
        
        const getRes = await fetch(`${API_ENDPOINT}?${queryParams}`);
        if (getRes.ok) {
          result = await getRes.json();
        }
      } catch (err) {
        console.error('GET submission fallback error:', err);
      }
    }

    setLoading(false);

    if (result && (result.name || result.yes)) {
      setCheckedIn(true);
      setStudentName(result.name || '');
      setResponseMessage(result.message || '');
      setStatusText('Thanks for checking in.');
    } else {
      setStatusText('Fill in the form to check-in and get your schedule for the day.');
      setErrorMessage('Something went wrong. Please double-check your ID.');
    }
  };

  const handleReset = () => {
    setCheckedIn(false);
    setStudentId('');
    setYap('');
    setLeavingEarly(false);
    setLeavingText('');
    setStudentName('');
    setResponseMessage('');
    setErrorMessage('');
    setStatusText('Fill in the form to check-in and get your schedule for the day.');
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1rem 0.5rem' }}>
      {onBack && (
        <button
          onClick={onBack}
          className="btn btn-outline"
          style={{ marginBottom: '1.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <ArrowLeft size={16} /> Back to Main App
        </button>
      )}

      {/* Page Header */}
      <div 
        className="glass-panel" 
        style={{ 
          padding: '1.5rem', 
          textAlign: 'center', 
          marginBottom: '1.5rem',
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%)',
          borderColor: 'rgba(99, 102, 241, 0.3)'
        }}
      >
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '0.25rem' }} className="text-gradient">
          Rancho MATHCOUNTS 2025–26
        </h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '1rem' }}>
          Rancho San Joaquin Middle School
        </p>
      </div>

      <div className="glass-panel animate-fade-in" style={{ padding: '2rem', marginBottom: '2rem' }}>
        {/* Information / Updates Banner */}
        {information && (
          <div 
            style={{ 
              marginBottom: '1.5rem', 
              background: 'rgba(99, 102, 241, 0.1)', 
              borderLeft: '4px solid var(--accent-primary)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem 1.25rem'
            }}
          >
            <p style={{ fontWeight: 600, color: 'var(--accent-primary)', marginBottom: '0.5rem' }}>
              Updates
            </p>
            <div 
              style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}
              dangerouslySetInnerHTML={{ __html: information }}
            />
          </div>
        )}

        {/* Check-In Welcome Screen (When Checked In) */}
        {checkedIn ? (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
              <CheckCircle size={48} color="var(--success)" />
            </div>
            <h2 style={{ color: 'var(--accent-secondary)', fontSize: '2rem', fontWeight: 700, marginBottom: '1rem' }}>
              Welcome, {studentName}!
            </h2>
            <p style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '1.5rem' }}>
              {statusText}
            </p>

            {responseMessage && (
              <div 
                style={{ 
                  textAlign: 'left', 
                  background: 'var(--bg-tertiary)', 
                  border: '1px solid var(--bg-glass-border)', 
                  borderRadius: 'var(--radius-md)', 
                  padding: '1.25rem',
                  marginBottom: '1.5rem'
                }}
              >
                <div dangerouslySetInnerHTML={{ __html: responseMessage }} />
              </div>
            )}

            <button 
              onClick={handleReset} 
              className="btn btn-outline"
              style={{ marginTop: '1rem' }}
            >
              Check-In Another Student
            </button>
          </div>
        ) : (
          /* Check-In Form */
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label 
                htmlFor="student-id" 
                style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text-primary)' }}
              >
                Student ID <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                id="student-id"
                type="password"
                className="input-field"
                placeholder="did you know you can change your IUSD password?"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                autoComplete="off"
                disabled={loading}
                required
              />
            </div>

            <div>
              <label 
                htmlFor="message-yap" 
                style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text-primary)' }}
              >
                Message
              </label>
              <textarea
                id="message-yap"
                className="input-field"
                placeholder="Send a message to our coaches ‣ Leaving early? ‣ Want resources? ‣ Submitting a link to homework? ‣ Feedback for the program?"
                value={yap}
                onChange={(e) => setYap(e.target.value)}
                rows={4}
                autoComplete="off"
                disabled={loading}
                style={{ resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={leavingEarly}
                  onChange={(e) => setLeavingEarly(e.target.checked)}
                  disabled={loading}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }}
                />
                <span style={{ fontWeight: 500 }}>Leaving Early?</span>
              </label>

              {leavingEarly && (
                <input
                  type="text"
                  className="input-field"
                  placeholder="What time?"
                  value={leavingText}
                  onChange={(e) => setLeavingText(e.target.value)}
                  disabled={loading}
                  style={{ flex: 1, minWidth: '150px' }}
                />
              )}
            </div>

            {errorMessage && (
              <div 
                style={{ 
                  padding: '0.75rem 1rem', 
                  backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                  border: '1px solid rgba(239, 68, 68, 0.3)', 
                  borderRadius: 'var(--radius-md)',
                  color: '#f87171',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.9rem'
                }}
              >
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.85rem', marginTop: '0.5rem', fontSize: '1.05rem', fontWeight: 600 }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Loading...
                </>
              ) : (
                <>
                  <UserCheck size={18} /> Submit
                </>
              )}
            </button>

            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              {statusText}
            </p>
          </form>
        )}
      </div>

      {/* Footer */}
      <footer 
        style={{ 
          textAlign: 'center', 
          padding: '1rem', 
          color: 'var(--text-muted)', 
          fontSize: '0.85rem',
          borderTop: '1px solid var(--bg-glass-border)'
        }}
      >
        Please direct any questions to our advisor, Mrs. Gastelum, at{' '}
        <a 
          href="mailto:LizGastelum@iusd.org" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}
        >
          LizGastelum@iusd.org
        </a>{' '}
        or in room B6.
      </footer>
    </div>
  );
}
