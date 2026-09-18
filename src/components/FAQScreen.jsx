import { ArrowLeft } from 'lucide-react';
import { translations } from '../utils/i18n';

export function FAQScreen({ onNavigate, lang = 'en' }) {
  const isZh = lang === 'zh';
  const common = translations[lang]?.common || translations.en.common;

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '1rem 0.5rem 3rem' }}>
      <button
        onClick={() => onNavigate('/')}
        className="btn btn-outline"
        style={{ marginBottom: '1.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
      >
        <ArrowLeft size={16} /> {common.back}
      </button>

      <div className="glass-panel" style={{ padding: '2rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1rem', lineHeight: 1.4 }}>
          {isZh ? '可以同时参加 NHD 和 MATHCOUNTS 吗？' : 'Can you participate in both NHD and MATHCOUNTS?'}
        </h2>

        <p style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          color: 'var(--danger)',
          margin: 0
        }}>
          {isZh ? '不行。绝对不行。' : 'No. Emphatically no.'}
        </p>
      </div>
    </div>
  );
}
