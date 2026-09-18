import { translations } from '../utils/i18n';

export function PublicHomeScreen({ lang = 'en' }) {
  const isZh = lang === 'zh';
  const tFaq = translations[lang]?.faq || translations.en.faq;

  return (
    <div style={{ maxWidth: '640px', margin: '2rem auto 4rem', padding: '0 1rem' }}>
      <h1 style={{
        fontSize: 'clamp(2rem, 1.6rem + 1.8vw, 2.75rem)',
        fontWeight: 800,
        color: 'var(--text-primary)',
        letterSpacing: '-0.02em',
        marginBottom: '2rem',
        textAlign: 'center'
      }}>
        Rancho MATHCOUNTS
      </h1>

      <div className="glass-panel animate-fade-in" style={{ padding: '2rem' }}>
        <h2 style={{
          fontSize: '0.85rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--accent-primary)',
          marginBottom: '1rem'
        }}>
          {isZh ? '常见问题' : 'FAQ'}
        </h2>

        <div style={{ borderTop: '1px solid var(--bg-glass-border)', paddingTop: '1.25rem' }}>
          <h3 style={{
            fontSize: '1.15rem',
            fontWeight: 700,
            color: 'var(--text-primary)',
            lineHeight: 1.4,
            marginBottom: '0.75rem'
          }}>
            {tFaq.question}
          </h3>

          <p style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            color: 'var(--danger)',
            margin: 0
          }}>
            {tFaq.answerEmphatic}
          </p>
        </div>
      </div>
    </div>
  );
}
