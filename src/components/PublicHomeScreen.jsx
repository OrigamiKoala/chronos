import { useState } from 'react';
import { 
  FileText, 
  Play
} from 'lucide-react';
import { translations } from '../utils/i18n';

const PAST_TESTS = [
  {
    id: 'mc-chap-2024',
    title: '2024 MATHCOUNTS Chapter Competition',
    category: 'MATHCOUNTS',
    questions: 38,
    preset: 'amc8'
  },
  {
    id: 'mc-state-2023',
    title: '2023 MATHCOUNTS State Championship',
    category: 'MATHCOUNTS',
    questions: 38,
    preset: 'amc10'
  },
  {
    id: 'amc8-2024',
    title: '2024 AMC 8',
    category: 'AMC 8',
    questions: 25,
    preset: 'amc8'
  },
  {
    id: 'amc8-2023',
    title: '2023 AMC 8',
    category: 'AMC 8',
    questions: 25,
    preset: 'amc8'
  },
  {
    id: 'amc10-2023a',
    title: '2023 AMC 10A',
    category: 'AMC 10',
    questions: 25,
    preset: 'amc10'
  },
  {
    id: 'mc-school-2024',
    title: '2024 MATHCOUNTS School Round',
    category: 'MATHCOUNTS',
    questions: 40,
    preset: 'amc8'
  }
];

const PHOTOS = [
  { id: '1', title: 'Chapter Competition', gradient: 'linear-gradient(135deg, #1e3a8a, #d97706)' },
  { id: '2', title: 'Team Round', gradient: 'linear-gradient(135deg, #1d4ed8, #b45309)' },
  { id: '3', title: 'State Finals', gradient: 'linear-gradient(135deg, #0f172a, #1d4ed8)' },
  { id: '4', title: 'Weekly Session', gradient: 'linear-gradient(135deg, #1e40af, #f59e0b)' }
];

export function PublicHomeScreen({ onNavigate, onStartPreset, lang = 'en' }) {
  const isZh = lang === 'zh';
  const tNav = translations[lang]?.nav || translations.en.nav;
  const [filter, setFilter] = useState('ALL');
  const [selectedPreview, setSelectedPreview] = useState(null);

  const filteredTests = PAST_TESTS.filter(test => {
    if (filter === 'ALL') return true;
    if (filter === 'AMC8') return test.category === 'AMC 8';
    if (filter === 'AMC10') return test.category === 'AMC 10';
    if (filter === 'MATHCOUNTS') return test.category === 'MATHCOUNTS';
    return true;
  });

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '1rem 0.5rem 4rem' }}>
      
      {/* Hero Section */}
      <div className="glass-panel animate-fade-in" style={{ padding: '2.5rem 2rem', marginBottom: '2.5rem' }}>
        <h1 style={{
          fontSize: 'clamp(1.8rem, 1.5rem + 1.5vw, 2.5rem)',
          fontWeight: 700,
          color: 'var(--text-primary)',
          letterSpacing: '-0.02em',
          marginBottom: '0.5rem'
        }}>
          {isZh ? '大学高中数学俱乐部' : 'UHS Math Club'}
        </h1>

        <p style={{
          fontSize: '1rem',
          color: 'var(--text-secondary)',
          marginBottom: '1.75rem'
        }}>
          {isZh ? '历年真题与活动照片。' : 'Past competition tests and photos.'}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <button
            onClick={() => onNavigate('/hw')}
            className="btn btn-primary"
            style={{ padding: '0.55rem 1.25rem', fontSize: '0.9rem' }}
          >
            {tNav.homework}
          </button>

          <button
            onClick={() => onNavigate('/faq')}
            className="btn btn-outline"
            style={{ padding: '0.55rem 1.25rem', fontSize: '0.9rem' }}
          >
            {tNav.faq}
          </button>

          <button
            onClick={() => onNavigate('/practice')}
            className="btn btn-outline"
            style={{ padding: '0.55rem 1.25rem', fontSize: '0.9rem' }}
          >
            {tNav.practice}
          </button>
        </div>
      </div>

      {/* Past Tests Section */}
      <div style={{ marginBottom: '3rem' }} id="tests">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {isZh ? '历年真题' : 'Past Tests'}
          </h2>

          <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
            <button
              onClick={() => setFilter('ALL')}
              className={`btn ${filter === 'ALL' ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}
            >
              {isZh ? '全部' : 'All'}
            </button>
            <button
              onClick={() => setFilter('AMC8')}
              className={`btn ${filter === 'AMC8' ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}
            >
              AMC 8
            </button>
            <button
              onClick={() => setFilter('AMC10')}
              className={`btn ${filter === 'AMC10' ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}
            >
              AMC 10
            </button>
            <button
              onClick={() => setFilter('MATHCOUNTS')}
              className={`btn ${filter === 'MATHCOUNTS' ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}
            >
              MATHCOUNTS
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredTests.map((test) => (
            <div 
              key={test.id} 
              className="glass-panel" 
              style={{ padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}
            >
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                  {test.title}
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {test.questions} {isZh ? '题' : 'problems'}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setSelectedPreview(test)}
                  className="btn btn-outline"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                >
                  {isZh ? '详情' : 'Details'}
                </button>

                <button
                  onClick={() => {
                    if (onStartPreset) {
                      onStartPreset(test.preset);
                    } else {
                      onNavigate('/practice');
                    }
                  }}
                  className="btn btn-primary"
                  style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <Play size={13} /> {isZh ? '练习' : 'Practice'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Photos Section */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1.25rem' }}>
          {isZh ? '活动照片' : 'Photos'}
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '1rem'
        }}>
          {PHOTOS.map((p) => (
            <div key={p.id} className="glass-panel" style={{ padding: '0.75rem' }}>
              <div style={{
                height: '130px',
                background: p.gradient,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '0.65rem',
                color: '#ffffff'
              }}>
                <FileText size={24} style={{ opacity: 0.8 }} />
              </div>
              <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                {p.title}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Test Preview Modal */}
      {selectedPreview && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}
          onClick={() => setSelectedPreview(null)}
        >
          <div 
            className="glass-panel animate-fade-in" 
            style={{ maxWidth: '440px', width: '100%', padding: '1.75rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              {selectedPreview.title}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              {selectedPreview.category} • {selectedPreview.questions} {isZh ? '道题' : 'problems'}
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSelectedPreview(null)}
                className="btn btn-outline"
                style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
              >
                {isZh ? '关闭' : 'Close'}
              </button>
              <button
                onClick={() => {
                  const preset = selectedPreview.preset;
                  setSelectedPreview(null);
                  if (onStartPreset) {
                    onStartPreset(preset);
                  } else {
                    onNavigate('/practice');
                  }
                }}
                className="btn btn-primary"
                style={{ padding: '0.45rem 1rem', fontSize: '0.85rem' }}
              >
                {isZh ? '开始练习' : 'Start Practice'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
