import { useState } from 'react';
import { 
  ArrowRight, 
  FileText, 
  Calendar, 
  Award, 
  Users, 
  ExternalLink, 
  CheckCircle2, 
  HelpCircle,
  BrainCircuit,
  Camera,
  Play
} from 'lucide-react';
import { translations } from '../utils/i18n';

const PAST_TESTS = [
  {
    id: 'mc-chap-2024',
    title: 'MATHCOUNTS 2024 Chapter Competition',
    category: 'MATHCOUNTS',
    type: 'Sprint & Target Round',
    year: '2024',
    questions: 38,
    time: '40 + 30 min',
    difficulty: 'Intermediate',
    description: 'Official chapter competition problems spanning combinatorics, number theory, and coordinate geometry.',
    preset: 'amc8'
  },
  {
    id: 'mc-state-2023',
    title: 'MATHCOUNTS 2023 State Championship',
    category: 'MATHCOUNTS',
    type: 'Sprint & Target Round',
    year: '2023',
    questions: 38,
    time: '40 + 30 min',
    difficulty: 'Advanced',
    description: 'High-level state championship problem set designed for national qualifier screening.',
    preset: 'amc10'
  },
  {
    id: 'amc8-2024',
    title: 'AMC 8 (American Mathematics Contest 8)',
    category: 'AMC 8',
    type: '25 Multiple Choice',
    year: '2024',
    questions: 25,
    time: '40 min',
    difficulty: 'National Grade 8',
    description: 'The premier national contest for middle school mathematics talent by MAA.',
    preset: 'amc8'
  },
  {
    id: 'amc8-2023',
    title: 'AMC 8 (American Mathematics Contest 8)',
    category: 'AMC 8',
    type: '25 Multiple Choice',
    year: '2023',
    questions: 25,
    time: '40 min',
    difficulty: 'National Grade 8',
    description: 'MAA contest problems testing pre-algebra, probability, and spatial reasoning.',
    preset: 'amc8'
  },
  {
    id: 'amc10-2023a',
    title: 'AMC 10A (American Mathematics Contest 10)',
    category: 'AMC 10',
    type: '25 Multiple Choice',
    year: '2023',
    questions: 25,
    time: '75 min',
    difficulty: 'Olympiad Qualifying',
    description: 'Rigorous high school contest qualifying for the American Invitational Mathematics Exam (AIME).',
    preset: 'amc10'
  },
  {
    id: 'mc-school-2024',
    title: 'MATHCOUNTS 2024 School Round',
    category: 'MATHCOUNTS',
    type: 'Sprint & Team Round',
    year: '2024',
    questions: 40,
    time: '40 + 20 min',
    difficulty: 'School Qualifier',
    description: 'Rancho San Joaquin internal team selection and warmup problem set.',
    preset: 'amc8'
  }
];

const PHOTOS = [
  {
    id: 'countdown',
    tag: 'Chapter Round',
    titleKey: 'photo1Title',
    descKey: 'photo1Desc',
    aspect: '16/10',
    gradient: 'linear-gradient(135deg, #0a192f 0%, #1e40af 55%, #b45309 100%)',
    icon: Award
  },
  {
    id: 'teamwork',
    tag: 'Team Strategy',
    titleKey: 'photo2Title',
    descKey: 'photo2Desc',
    aspect: '16/10',
    gradient: 'linear-gradient(135deg, #172554 0%, #1d4ed8 50%, #d97706 100%)',
    icon: Users
  },
  {
    id: 'trophy',
    tag: 'State Finals',
    titleKey: 'photo3Title',
    descKey: 'photo3Desc',
    aspect: '16/10',
    gradient: 'linear-gradient(135deg, #0a192f 0%, #1d4ed8 45%, #f59e0b 100%)',
    icon: Award
  },
  {
    id: 'lecture',
    tag: 'Weekly Workshop',
    titleKey: 'photo4Title',
    descKey: 'photo4Desc',
    aspect: '16/10',
    gradient: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 60%, #d97706 100%)',
    icon: BrainCircuit
  }
];

export function PublicHomeScreen({ onNavigate, onStartPreset, lang = 'en' }) {
  const t = translations[lang]?.home || translations.en.home;
  const navT = translations[lang]?.nav || translations.en.nav;
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
    <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '1rem 0.5rem 4rem' }}>
      
      {/* Hero Section */}
      <div className="double-bezel animate-fade-in" style={{ marginBottom: '2rem', borderTop: '4px solid var(--accent-gold)' }}>
        <div className="double-bezel-inner" style={{ padding: 'clamp(2rem, 1.5rem + 2vw, 3.5rem) clamp(1.5rem, 1rem + 2vw, 3rem)' }}>
          
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.25rem 0.75rem',
            background: 'var(--accent-gold-subtle)',
            border: '1px solid var(--accent-gold-border)',
            color: 'var(--accent-gold)',
            fontSize: '0.75rem',
            fontWeight: 800,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: '1.25rem'
          }}>
            {t.heroTag}
          </div>

          <h1 style={{
            fontSize: 'clamp(2rem, 1.6rem + 2vw, 3.2rem)',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            color: 'var(--text-primary)',
            lineHeight: 1.15,
            marginBottom: '0.75rem'
          }}>
            {t.heroTitle}
          </h1>

          <p style={{
            fontSize: 'clamp(1rem, 0.95rem + 0.3vw, 1.15rem)',
            color: 'var(--text-secondary)',
            maxWidth: '68ch',
            lineHeight: 1.6,
            marginBottom: '2rem'
          }}>
            {t.heroSubtitle}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <button
              onClick={() => onNavigate('/hello')}
              className="btn btn-primary"
              style={{ padding: '0.75rem 1.6rem', fontSize: '0.95rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <CheckCircle2 size={18} /> {t.checkInCta}
            </button>

            <button
              onClick={() => onNavigate('/hw')}
              className="btn btn-gold"
              style={{ padding: '0.75rem 1.4rem', fontSize: '0.95rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <FileText size={18} /> {t.homeworkCta}
            </button>

            <button
              onClick={() => onNavigate('/faq')}
              className="btn btn-outline"
              style={{ padding: '0.75rem 1.4rem', fontSize: '0.95rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <HelpCircle size={18} /> {t.faqCta}
            </button>
          </div>

        </div>
      </div>

      {/* Quick Action Bento Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '1.25rem',
        marginBottom: '3rem'
      }}>
        {/* Check-In Card */}
        <div 
          className="double-bezel" 
          style={{ cursor: 'pointer', transition: 'transform 0.15s ease', borderTop: '3px solid var(--accent-primary)' }}
          onClick={() => onNavigate('/hello')}
        >
          <div className="double-bezel-inner" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Weekly Routine
                </span>
                <CheckCircle2 size={20} color="var(--accent-primary)" />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                {t.quickCheckInTitle}
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {t.quickCheckInDesc}
              </p>
            </div>
            <div style={{ marginTop: '1.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--accent-primary)', fontWeight: 600, fontSize: '0.85rem' }}>
              {t.checkInCta} <ArrowRight size={15} />
            </div>
          </div>
        </div>

        {/* Homework Card */}
        <div 
          className="double-bezel" 
          style={{ cursor: 'pointer', transition: 'transform 0.15s ease', borderTop: '3px solid var(--accent-gold)' }}
          onClick={() => onNavigate('/hw')}
        >
          <div className="double-bezel-inner" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-gold)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Assignments
                </span>
                <FileText size={20} color="var(--accent-gold)" />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                {t.quickHwTitle}
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {t.quickHwDesc}
              </p>
            </div>
            <div style={{ marginTop: '1.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--accent-gold)', fontWeight: 600, fontSize: '0.85rem' }}>
              {t.homeworkCta} <ArrowRight size={15} />
            </div>
          </div>
        </div>

        {/* FAQ Card */}
        <div 
          className="double-bezel" 
          style={{ cursor: 'pointer', transition: 'transform 0.15s ease', borderTop: '3px solid var(--danger)' }}
          onClick={() => onNavigate('/faq')}
        >
          <div className="double-bezel-inner" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Important Rule
                </span>
                <HelpCircle size={20} color="var(--danger)" />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                {t.quickFaqTitle}
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {t.quickFaqDesc}
              </p>
            </div>
            <div style={{ marginTop: '1.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--danger)', fontWeight: 600, fontSize: '0.85rem' }}>
              {t.faqCta} <ArrowRight size={15} />
            </div>
          </div>
        </div>
      </div>

      {/* Past Tests Section */}
      <div style={{ marginBottom: '3.5rem' }} id="tests">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
              {t.testsTitle}
            </h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {t.testsSubtitle}
            </p>
          </div>

          {/* Filter Tabs */}
          <div style={{ display: 'inline-flex', background: 'var(--bg-tertiary)', border: '1px solid var(--bg-glass-border)', padding: '3px' }}>
            <button
              onClick={() => setFilter('ALL')}
              className={`btn ${filter === 'ALL' ? 'btn-primary' : ''}`}
              style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem' }}
            >
              {t.filterAll}
            </button>
            <button
              onClick={() => setFilter('AMC8')}
              className={`btn ${filter === 'AMC8' ? 'btn-primary' : ''}`}
              style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem' }}
            >
              {t.filterAMC8}
            </button>
            <button
              onClick={() => setFilter('AMC10')}
              className={`btn ${filter === 'AMC10' ? 'btn-primary' : ''}`}
              style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem' }}
            >
              {t.filterAMC10}
            </button>
            <button
              onClick={() => setFilter('MATHCOUNTS')}
              className={`btn ${filter === 'MATHCOUNTS' ? 'btn-primary' : ''}`}
              style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem' }}
            >
              {t.filterMathcounts}
            </button>
          </div>
        </div>

        {/* Tests Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '1.25rem'
        }}>
          {filteredTests.map((test) => {
            const isMc = test.category === 'MATHCOUNTS';
            return (
              <div key={test.id} className="double-bezel" style={{ borderTop: isMc ? '3px solid var(--accent-gold)' : '3px solid var(--accent-primary)' }}>
                <div className="double-bezel-inner" style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      background: isMc ? 'var(--accent-gold-subtle)' : 'var(--accent-subtle)',
                      color: isMc ? 'var(--accent-gold)' : 'var(--accent-primary)',
                      padding: '0.15rem 0.5rem',
                      border: `1px solid ${isMc ? 'var(--accent-gold-border)' : 'var(--accent-border)'}`
                    }}>
                      {test.category} • {test.year}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {test.questions} {t.questionsCount}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                    {test.title}
                  </h3>

                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
                    {test.description}
                  </p>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => setSelectedPreview(test)}
                      className="btn btn-outline"
                      style={{ flex: 1, padding: '0.45rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                    >
                      <FileText size={14} /> {t.viewQuestions}
                    </button>

                    <button
                      onClick={() => {
                        if (onStartPreset) {
                          onStartPreset(test.preset);
                        } else {
                          onNavigate('/practice');
                        }
                      }}
                      className={`btn ${isMc ? 'btn-gold' : 'btn-primary'}`}
                      style={{ flex: 1, padding: '0.45rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                    >
                      <Play size={14} /> Practice
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Photos & Club Life Section */}
      <div style={{ marginBottom: '3rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', marginBottom: '0.25rem' }}>
            <Camera size={18} />
            <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Gallery
            </span>
          </div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            {t.photosTitle}
          </h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            {t.photosSubtitle}
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1.25rem'
        }}>
          {PHOTOS.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.id} className="double-bezel">
                <div className="double-bezel-inner" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column' }}>
                  <div style={{
                    height: '140px',
                    background: p.gradient,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '1rem',
                    marginBottom: '1rem',
                    color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      background: 'rgba(255, 255, 255, 0.2)',
                      padding: '0.15rem 0.5rem',
                      alignSelf: 'flex-start',
                      letterSpacing: '0.05em'
                    }}>
                      {p.tag}
                    </span>
                    <Icon size={32} style={{ opacity: 0.85 }} />
                  </div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                    {t[p.titleKey]}
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                    {t[p.descKey]}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer info banner */}
      <div style={{
        textAlign: 'center',
        padding: '2rem 1rem',
        borderTop: '1px solid var(--bg-glass-border)',
        color: 'var(--text-muted)',
        fontSize: '0.85rem',
        lineHeight: 1.7
      }}>
        <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-secondary)' }}>
          {t.footerText}
        </p>
        <p style={{ margin: '0.25rem 0 0' }}>
          {t.advisorNote}
        </p>
      </div>

      {/* Modal for Preview */}
      {selectedPreview && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}
          onClick={() => setSelectedPreview(null)}
        >
          <div 
            className="double-bezel" 
            style={{ maxWidth: '540px', width: '100%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="double-bezel-inner" style={{ padding: '1.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase' }}>
                  {selectedPreview.category} • {selectedPreview.year}
                </span>
                <button 
                  onClick={() => setSelectedPreview(null)}
                  className="btn btn-outline" 
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                >
                  ✕
                </button>
              </div>

              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                {selectedPreview.title}
              </h2>

              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                {selectedPreview.description}
              </p>

              <div style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--bg-glass-border)',
                padding: '1rem',
                fontSize: '0.85rem',
                color: 'var(--text-primary)',
                marginBottom: '1.5rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Format:</span>
                  <strong>{selectedPreview.type}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Questions:</span>
                  <strong>{selectedPreview.questions} problems</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Allowed Time:</span>
                  <strong>{selectedPreview.time}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
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
                  style={{ flex: 1, padding: '0.65rem', fontSize: '0.9rem' }}
                >
                  Start Practice Simulation
                </button>
                <button
                  onClick={() => setSelectedPreview(null)}
                  className="btn btn-outline"
                  style={{ padding: '0.65rem 1.2rem', fontSize: '0.9rem' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
