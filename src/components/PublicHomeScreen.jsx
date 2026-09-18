import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { translations } from '../utils/i18n';

export function PublicHomeScreen({ lang = 'en' }) {
  const isZh = lang === 'zh';
  const tFaq = translations[lang]?.faq || translations.en.faq;
  const [openItems, setOpenItems] = useState({ 'nhd-mathcounts': true });

  const toggleItem = (id) => {
    setOpenItems(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const faqItems = [
    {
      id: 'nhd-mathcounts',
      question: tFaq.question,
      answer: tFaq.answerEmphatic
    }
  ];

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

      <div className="glass-panel animate-fade-in" style={{ padding: '1.5rem' }}>
        <h2 style={{
          fontSize: '0.85rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--accent-primary)',
          margin: '0 0 1rem 0'
        }}>
          {isZh ? '常见问题' : 'FAQ'}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {faqItems.map((item) => {
            const isOpen = !!openItems[item.id];
            return (
              <div 
                key={item.id}
                style={{
                  borderTop: '1px solid var(--bg-glass-border)',
                  paddingTop: '0.75rem',
                  paddingBottom: '0.75rem'
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'transparent',
                    border: 'none',
                    padding: '0.5rem 0',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'var(--text-primary)',
                    fontFamily: 'inherit'
                  }}
                  aria-expanded={isOpen}
                >
                  <span style={{ fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.4, paddingRight: '1rem' }}>
                    {item.question}
                  </span>
                  <ChevronDown
                    size={18}
                    color="var(--accent-primary)"
                    style={{
                      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                      flexShrink: 0
                    }}
                  />
                </button>

                {isOpen && (
                  <div style={{
                    paddingTop: '0.5rem',
                    paddingBottom: '0.25rem',
                    animation: 'fade-in 0.2s ease'
                  }}>
                    <p style={{
                      fontSize: '0.95rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.6,
                      margin: 0
                    }}>
                      {item.answer}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
