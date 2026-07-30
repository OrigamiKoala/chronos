import { ArrowLeft, ExternalLink, ShieldAlert } from 'lucide-react';

const SCRIPT_URL = 'https://script.google.com/a/macros/iusd.org/s/AKfycbwvP1A_NnGe2NT-XhLrMO-6VDYbGcIhytNigzMQRnZEV4Sb0Hmm06-A25XWasFYylTR8w/exec';

export function CheckInScreen({ onBack }) {
  const handleOpenDirect = () => {
    window.open(SCRIPT_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '1rem 0.5rem' }}>
      {onBack && (
        <button
          onClick={onBack}
          className="btn btn-outline"
          style={{ marginBottom: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <ArrowLeft size={16} /> Back to Main App
        </button>
      )}

      {/* IUSD Google Sign-In Guidance Banner */}
      <div 
        className="glass-panel" 
        style={{ 
          padding: '1rem 1.25rem', 
          marginBottom: '1rem', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          background: 'rgba(99, 102, 241, 0.08)',
          borderColor: 'rgba(99, 102, 241, 0.25)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '260px' }}>
          <ShieldAlert size={22} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
          <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: '1.4' }}>
            <strong>IUSD Account Required:</strong> Modern browsers block Google sign-in inside embedded frames. If you see <em>"Sorry, unable to open the file"</em> below, click the button to sign in with your IUSD account in a new tab.
          </div>
        </div>
        <button
          onClick={handleOpenDirect}
          className="btn btn-primary"
          style={{ fontSize: '0.85rem', padding: '0.5rem 1rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}
        >
          Open & Sign In <ExternalLink size={14} />
        </button>
      </div>

      <div 
        className="glass-panel animate-fade-in" 
        style={{ 
          padding: '0.5rem', 
          overflow: 'hidden', 
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)'
        }}
      >
        <iframe
          src={SCRIPT_URL}
          title="Student Check-In"
          style={{
            width: '100%',
            height: 'calc(100vh - 260px)',
            minHeight: '650px',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            backgroundColor: '#ffffff'
          }}
          allow="autoplay"
        />
      </div>
    </div>
  );
}
