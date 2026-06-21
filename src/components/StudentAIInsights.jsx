/* eslint-disable */
import { useState, useEffect } from 'react';
import { Sparkles, Calendar, BookOpen, AlertCircle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { ChemicalText } from './ChemicalText';

export function StudentAIInsights({ studentId, teacherId }) {
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const handleManualGenerate = () => {
    if (!studentId || !teacherId) return;
    setGenerating(true);
    setError('');
    fetch(`/api/teacher-data?route=insights&studentId=${encodeURIComponent(studentId)}&teacherId=${encodeURIComponent(teacherId)}&bypassLimit=true`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to generate student insights');
        return res.json();
      })
      .then(data => {
        setInsights(data.insights || []);
        setGenerating(false);
      })
      .catch(err => {
        console.error(err);
        setError(err.message || 'Failed to generate insights');
        setGenerating(false);
      });
  };

  useEffect(() => {
    if (!studentId || !teacherId) return;
    setLoading(true);
    setError('');
    fetch(`/api/teacher-data?route=insights&studentId=${encodeURIComponent(studentId)}&teacherId=${encodeURIComponent(teacherId)}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load student insights');
        return res.json();
      })
      .then(data => {
        setInsights(data.insights || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError(err.message || 'Failed to fetch insights');
        setLoading(false);
      });
  }, [studentId, teacherId]);

  if (loading) {
    return (
      <div className="glass-panel" style={{ padding: 'var(--card-padding)', textAlign: 'center', marginBottom: '1.5rem', background: 'var(--bg-tertiary)' }}>
        <Loader2 className="animate-spin" size={28} style={{ margin: '0 auto 0.5rem', color: 'var(--accent-primary)' }} />
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Analyzing student practice data and generating insights...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel" style={{ padding: 'var(--card-padding)', marginBottom: '1.5rem', border: '1px solid rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.02)' }}>
        <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: 0 }}>{error}</p>
      </div>
    );
  }

  if (insights.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: 'var(--card-padding)', marginBottom: '1.5rem', textAlign: 'center', background: 'var(--bg-tertiary)', border: '1px solid rgba(255,255,255,0.04)' }}>
        <Sparkles size={24} style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>No AI insights available yet. Insights are generated automatically 1 week after each lesson plan is published (max once every 6 days).</p>
        <button
          onClick={handleManualGenerate}
          disabled={generating}
          className="btn btn-primary"
          style={{ padding: '0.4rem 1.0rem', fontSize: '0.8rem', height: 'auto', minHeight: 'auto' }}
        >
          {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {generating ? 'Generating Insight...' : 'Manually Generate First Insight'}
        </button>
      </div>
    );
  }

  const latest = insights[0];
  const historyList = insights.slice(1);

  const getProgressStyle = (status) => {
    const s = String(status || '').trim().toLowerCase();
    if (s.startsWith('yes')) {
      return { bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.25)', text: 'var(--success)' };
    } else if (s.startsWith('no')) {
      return { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.25)', text: 'var(--danger)' };
    }
    return { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.25)', text: 'var(--warning)' };
  };

  const latestProgress = getProgressStyle(latest.progress_status);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem', textAlign: 'left' }}>

      {/* Latest Insight Card */}
      <div className="glass-panel animate-fade-in" style={{ padding: 'var(--card-padding)', background: 'rgba(99, 102, 241, 0.03)', border: '1px solid rgba(99, 102, 241, 0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.5rem' }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
            <Sparkles size={18} style={{ color: 'var(--accent-primary)' }} />
            Latest AI Insight
          </h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={handleManualGenerate}
              disabled={generating}
              className="btn btn-outline"
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', height: 'auto', minHeight: 'auto', borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' }}
            >
              {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {generating ? 'Generating...' : 'Regenerate / Force Update'}
            </button>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Calendar size={12} />
              {(() => { const d = new Date(latest.created_at?.value || latest.created_at); return isNaN(d.getTime()) ? 'Unknown date' : d.toLocaleDateString(); })()}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Progress Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Progress toward goals:</span>
            <span style={{
              background: latestProgress.bg,
              border: `1px solid ${latestProgress.border}`,
              color: latestProgress.text,
              fontSize: '0.75rem',
              fontWeight: 'bold',
              padding: '0.2rem 0.5rem',
              borderRadius: '4px',
              textTransform: 'capitalize'
            }}>
              {latest.progress_status || 'Unknown'}
            </span>
          </div>

          {/* Practice Summary */}
          <div style={{ background: 'var(--bg-tertiary)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.03)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.35rem' }}>
              <AlertCircle size={14} /> Practice Summary
            </span>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
              <ChemicalText text={latest.summary} theme="dark" />
            </p>
          </div>

          {/* Suggestions */}
          <div style={{ background: 'var(--bg-tertiary)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.03)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--accent-secondary)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.35rem' }}>
              <BookOpen size={14} /> Coaching Next Steps
            </span>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
              <ChemicalText text={latest.suggestions} theme="dark" />
            </p>
          </div>
        </div>
      </div>

      {/* History Log */}
      {historyList.length > 0 && (
        <div className="glass-panel" style={{ padding: 'var(--card-padding)', background: 'var(--bg-secondary)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
            Previous Insights Log ({historyList.length})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {historyList.map(ins => {
              const isExpanded = expandedId === ins.insight_id;
              const rawDate = new Date(ins.created_at?.value || ins.created_at);
              const dateStr = isNaN(rawDate.getTime()) ? 'Unknown date' : rawDate.toLocaleDateString();
              const histProgress = getProgressStyle(ins.progress_status);

              return (
                <div key={ins.insight_id} style={{ border: '1px solid rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setExpandedId(isExpanded ? null : ins.insight_id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: '600' }}>{dateStr}</span>
                      <span style={{
                        background: histProgress.bg,
                        border: `1px solid ${histProgress.border}`,
                        color: histProgress.text,
                        fontSize: '0.7rem',
                        fontWeight: 'bold',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '3px'
                      }}>
                        {(ins.progress_status || 'Unknown').split(' ')[0]}
                      </span>
                    </div>
                    {isExpanded ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'rgba(0,0,0,0.1)' }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold', display: 'block', marginBottom: '0.2rem' }}>Practice Summary:</span>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.4', whiteSpace: 'pre-wrap' }}>
                          <ChemicalText text={ins.summary} theme="dark" />
                        </p>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold', display: 'block', marginBottom: '0.2rem' }}>Suggestions:</span>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.4', whiteSpace: 'pre-wrap' }}>
                          <ChemicalText text={ins.suggestions} theme="dark" />
                        </p>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold', display: 'block', marginBottom: '0.2rem' }}>Progress Detail:</span>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.4', whiteSpace: 'pre-wrap' }}>
                          <ChemicalText text={ins.progress_status} theme="dark" />
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
