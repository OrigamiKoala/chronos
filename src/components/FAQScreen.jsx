import { ArrowLeft, AlertTriangle, CalendarX, Users, ShieldAlert } from 'lucide-react';
import { translations } from '../utils/i18n';

export function FAQScreen({ onNavigate, lang = 'en' }) {
  const t = translations[lang]?.faq || translations.en.faq;
  const common = translations[lang]?.common || translations.en.common;

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      <button
        onClick={() => onNavigate('/')}
        className="btn btn-outline"
        style={{ marginBottom: '1.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
      >
        <ArrowLeft size={16} /> {common.back}
      </button>

      {/* Outer Shell (Double-Bezel) */}
      <div className="double-bezel animate-fade-in" style={{ marginBottom: '2rem', borderTop: '4px solid var(--accent-primary)' }}>
        <div className="double-bezel-inner" style={{ padding: '2.25rem 2rem' }}>
          
          {/* Eyebrow badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.25rem 0.65rem',
            background: 'var(--accent-gold-subtle)',
            border: '1px solid var(--accent-gold-border)',
            color: 'var(--accent-gold)',
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: '1rem'
          }}>
            <ShieldAlert size={14} /> {t.badge}
          </div>

          <h1 style={{
            fontSize: 'clamp(1.6rem, 1.3rem + 1.2vw, 2.2rem)',
            fontWeight: 800,
            color: 'var(--text-primary)',
            lineHeight: 1.2,
            marginBottom: '0.5rem'
          }}>
            {t.title}
          </h1>

          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '2rem', lineHeight: 1.6 }}>
            {t.subtitle}
          </p>

          {/* Question Box */}
          <div style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--bg-glass-border)',
            borderLeft: '4px solid var(--accent-primary)',
            padding: '1.25rem 1.5rem',
            marginBottom: '1.5rem'
          }}>
            <p style={{
              fontSize: '1.15rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
              lineHeight: 1.4,
              margin: 0
            }}>
              Q: {t.question}
            </p>
          </div>

          {/* Emphatic Answer */}
          <div style={{
            background: 'rgba(220, 38, 38, 0.05)',
            border: '1px solid rgba(220, 38, 38, 0.25)',
            borderLeft: '4px solid var(--danger)',
            padding: '1.25rem 1.5rem',
            marginBottom: '2rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <AlertTriangle size={20} color="var(--danger)" />
              <span style={{
                fontSize: '1.3rem',
                fontWeight: 800,
                color: 'var(--danger)',
                letterSpacing: '-0.01em'
              }}>
                {t.answerEmphatic}
              </span>
            </div>
            <p style={{
              fontSize: '0.95rem',
              color: 'var(--text-primary)',
              lineHeight: 1.65,
              margin: 0
            }}>
              {t.answerBody}
            </p>
          </div>

          {/* Detail cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem'
          }}>
            <div style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--bg-glass-border)',
              padding: '1.25rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', marginBottom: '0.5rem' }}>
                <CalendarX size={18} />
                <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{t.rulePoint1Title}</strong>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>
                {t.rulePoint1Desc}
              </p>
            </div>

            <div style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--bg-glass-border)',
              padding: '1.25rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', marginBottom: '0.5rem' }}>
                <Users size={18} />
                <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{t.rulePoint2Title}</strong>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>
                {t.rulePoint2Desc}
              </p>
            </div>

            <div style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--bg-glass-border)',
              padding: '1.25rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', marginBottom: '0.5rem' }}>
                <ShieldAlert size={18} />
                <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{t.rulePoint3Title}</strong>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>
                {t.rulePoint3Desc}
              </p>
            </div>
          </div>

          <div style={{
            borderTop: '1px solid var(--bg-glass-border)',
            paddingTop: '1.25rem',
            fontSize: '0.85rem',
            color: 'var(--text-muted)',
            lineHeight: 1.6
          }}>
            {t.contactAdvisor}
          </div>

        </div>
      </div>
    </div>
  );
}
