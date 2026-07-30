import { ArrowLeft } from 'lucide-react';

const SCRIPT_URL = 'https://script.google.com/a/macros/iusd.org/s/AKfycbyXDPNzEKen0motfkX0zcbwvAEb-7uvE-f_yLgoQX-du_7jwkaDXBpnbZfQlrP_usXwuQ/exec';

export function CheckInScreen({ onBack }) {
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
            height: 'calc(100vh - 220px)',
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
