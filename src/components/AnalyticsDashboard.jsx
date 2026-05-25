/* eslint-disable */
import { useState, useEffect, useMemo } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { TrendingUp, Target, Zap, Brain, BarChart3, Clock, Flame, ArrowLeft, Loader2 } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

const CHART_COLORS = {
  Math: { line: '#6366f1', bg: 'rgba(99, 102, 241, 0.15)' },
  Physics: { line: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  Chemistry: { line: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
  silly: { line: '#f59e0b', bg: 'rgba(245, 158, 11, 0.25)' },
  concept: { line: '#ef4444', bg: 'rgba(239, 68, 68, 0.25)' },
  intuition: { line: '#a855f7', bg: 'rgba(168, 85, 247, 0.2)' },
  efficiency: { line: '#06b6d4', bg: 'rgba(6, 182, 212, 0.3)' },
  time: { line: '#ec4899', bg: 'rgba(236, 72, 153, 0.2)' }
};

const baseChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#a0a0b0', font: { family: 'Inter', size: 11 } } },
    tooltip: {
      backgroundColor: 'rgba(26, 26, 33, 0.95)',
      titleColor: '#f0f0f5',
      bodyColor: '#a0a0b0',
      borderColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      cornerRadius: 8,
      padding: 10,
      bodyFont: { family: 'Inter' },
      titleFont: { family: 'Outfit', weight: '600' }
    }
  },
  scales: {
    x: {
      ticks: { color: '#666677', font: { size: 10 } },
      grid: { color: 'rgba(255,255,255,0.04)' }
    },
    y: {
      ticks: { color: '#666677', font: { size: 10 } },
      grid: { color: 'rgba(255,255,255,0.04)' }
    }
  }
};

function formatDate(dateVal) {
  if (!dateVal) return '';
  const dateStr = typeof dateVal === 'object' && dateVal.value ? dateVal.value : dateVal;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? '?' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function AnalyticsDashboard({ user, onBack, strengths = [], weaknesses = [], topicBreakdowns = {}, detailedAnalysis = {}, history = [], loadingExamId = null, onReviewExam = null, formatDate = (d) => d }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('All');
  const [selectedTopicDetail, setSelectedTopicDetail] = useState(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetch(`/api/analytics?username=${user.user_id}`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load analytics');
        return r.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [user]);

  // ELO over time chart
  const eloChartData = useMemo(() => {
    if (!data?.eloHistory?.length) return null;
    const subjects = ['Math', 'Physics', 'Chemistry'];
    const filteredSubjects = selectedSubjectFilter === 'All' ? subjects : [selectedSubjectFilter];

    // Build per-subject running ELO, then collapse to one point per calendar day
    // (keep the last rating of each day)
    const subjectElo = {};
    for (const s of subjects) subjectElo[s] = [{ dateKey: 'start', label: 'Start', rating: 100 }];

    for (const h of data.eloHistory) {
      const rawDate = h.created_at?.value || h.created_at || '';
      const d = new Date(rawDate);
      const dateKey = isNaN(d.getTime()) ? rawDate : d.toISOString().slice(0, 10); // YYYY-MM-DD
      const label = formatDate(h.created_at);
      const arr = subjectElo[h.subject];
      // If last entry is the same calendar day, overwrite it (keep final rating of that day)
      if (arr.length > 0 && arr[arr.length - 1].dateKey === dateKey) {
        arr[arr.length - 1] = { dateKey, label, rating: h.new_rating };
      } else {
        arr.push({ dateKey, label, rating: h.new_rating });
      }
    }

    const datasets = filteredSubjects.map(s => ({
      label: s,
      data: subjectElo[s].map(p => p.rating),
      borderColor: CHART_COLORS[s].line,
      backgroundColor: CHART_COLORS[s].bg,
      fill: true,
      tension: 0.35,
      pointRadius: 3,
      pointHoverRadius: 6
    }));

    const maxLen = Math.max(...filteredSubjects.map(s => subjectElo[s].length));
    const labels = Array.from({ length: maxLen }, (_, i) => {
      for (const s of filteredSubjects) {
        if (subjectElo[s][i]) return subjectElo[s][i].label;
      }
      return '';
    });

    return { labels, datasets };
  }, [data, selectedSubjectFilter]);


  // Silly vs Concept points lost
  const tagChartData = useMemo(() => {
    if (!data?.tagTimeSeries?.length) return null;

    let cumulativeSilly = 0;
    let cumulativeConcept = 0;
    const labels = [];
    const sillyData = [];
    const conceptData = [];

    for (const t of data.tagTimeSeries) {
      cumulativeSilly += t.silly;
      cumulativeConcept += t.concept;
      labels.push(formatDate(t.created_at));
      sillyData.push(cumulativeSilly);
      conceptData.push(cumulativeConcept);
    }

    return {
      labels,
      datasets: [
        {
          label: 'Silly Mistakes (pts lost)',
          data: sillyData,
          borderColor: CHART_COLORS.silly.line,
          backgroundColor: CHART_COLORS.silly.bg,
          fill: true,
          tension: 0.3
        },
        {
          label: 'Concept Gaps (pts lost)',
          data: conceptData,
          borderColor: CHART_COLORS.concept.line,
          backgroundColor: CHART_COLORS.concept.bg,
          fill: true,
          tension: 0.3
        }
      ]
    };
  }, [data]);

  // Intuition accuracy over time
  const intuitionChartData = useMemo(() => {
    if (!data?.intuitionSeries?.length) return null;
    return {
      labels: data.intuitionSeries.map(i => formatDate(i.created_at)),
      datasets: [{
        label: 'Intuition Accuracy (%)',
        data: data.intuitionSeries.map(i => i.accuracy),
        borderColor: CHART_COLORS.intuition.line,
        backgroundColor: CHART_COLORS.intuition.bg,
        fill: true,
        tension: 0.35,
        pointRadius: 4,
        pointHoverRadius: 7
      }]
    };
  }, [data]);

  // Point efficiency per exam
  const efficiencyChartData = useMemo(() => {
    if (!data?.efficiencyData?.length) return null;
    const filtered = selectedSubjectFilter === 'All'
      ? data.efficiencyData
      : data.efficiencyData.filter(e => e.subject === selectedSubjectFilter);

    return {
      labels: filtered.map((e, i) => `#${i + 1} ${formatDate(e.created_at)}`),
      datasets: [{
        label: 'Points / Minute',
        data: filtered.map(e => e.efficiency),
        backgroundColor: filtered.map(e => CHART_COLORS[e.subject]?.bg || CHART_COLORS.efficiency.bg),
        borderColor: filtered.map(e => CHART_COLORS[e.subject]?.line || CHART_COLORS.efficiency.line),
        borderWidth: 1,
        borderRadius: 6,
        barPercentage: 0.7
      }]
    };
  }, [data, selectedSubjectFilter]);

  // Time management per exam
  const timeChartData = useMemo(() => {
    if (!data?.efficiencyData?.length) return null;
    const filtered = selectedSubjectFilter === 'All'
      ? data.efficiencyData
      : data.efficiencyData.filter(e => e.subject === selectedSubjectFilter);

    return {
      labels: filtered.map((e, i) => `#${i + 1} ${formatDate(e.created_at)}`),
      datasets: [{
        label: 'Avg Seconds / Question',
        data: filtered.map(e => e.avgTimePerQuestion),
        borderColor: CHART_COLORS.time.line,
        backgroundColor: CHART_COLORS.time.bg,
        fill: true,
        tension: 0.3,
        pointRadius: 3
      }]
    };
  }, [data, selectedSubjectFilter]);

  // Topic mastery horizontal bar
  const topicChartData = useMemo(() => {
    if (!data?.topicMastery?.length) return null;
    const filtered = selectedSubjectFilter === 'All'
      ? data.topicMastery
      : data.topicMastery.filter(t => t.subject === selectedSubjectFilter);

    return {
      labels: filtered.map(t => t.sub_category),
      datasets: [{
        label: 'Accuracy %',
        data: filtered.map(t => Math.round(t.accuracy_rate * 100)),
        backgroundColor: filtered.map(t => {
          const rate = t.accuracy_rate;
          if (rate >= 0.7) return 'rgba(16, 185, 129, 0.5)';
          if (rate >= 0.5) return 'rgba(245, 158, 11, 0.5)';
          return 'rgba(239, 68, 68, 0.5)';
        }),
        borderColor: filtered.map(t => {
          const rate = t.accuracy_rate;
          if (rate >= 0.7) return '#10b981';
          if (rate >= 0.5) return '#f59e0b';
          return '#ef4444';
        }),
        borderWidth: 1,
        borderRadius: 4,
        barPercentage: 0.6
      }]
    };
  }, [data, selectedSubjectFilter]);

  const missedADay = useMemo(() => {
    if (!data?.eloHistory?.length) return true;
    const lastExam = data.eloHistory[data.eloHistory.length - 1];
    const lastExamDateStr = lastExam.created_at?.value || lastExam.created_at;
    if (!lastExamDateStr) return true;
    const lastExamDate = new Date(lastExamDateStr);
    if (isNaN(lastExamDate.getTime())) return true;
    return (new Date() - lastExamDate) > 24 * 60 * 60 * 1000;
  }, [data]);

  if (loading) {
    return (
      <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
        <Loader2 className="animate-spin" size={48} style={{ margin: '0 auto 1rem', color: 'var(--accent-primary)' }} />
        <h3>Loading Analytics...</h3>
        <p style={{ color: 'var(--text-secondary)' }}>Crunching your performance data</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
        <p style={{ color: 'var(--danger)' }}>{error}</p>
        <button className="btn btn-primary" onClick={onBack} style={{ marginTop: '1rem' }}>
          <ArrowLeft size={16} /> Go Back
        </button>
      </div>
    );
  }

  const summary = data?.summary || {};
  const displayedStreak = missedADay ? 0 : (summary.currentStreak || 0);
  const streakColor = summary.streakType === 'correct' && !missedADay
    ? 'var(--success)'
    : (missedADay ? 'var(--danger)' : 'var(--text-primary)');

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 className="text-gradient" style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>Performance Analytics</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{summary.totalExams || 0} exams analyzed</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {['All', 'Math', 'Physics', 'Chemistry'].map(s => (
            <button
              key={s}
              className={`btn ${selectedSubjectFilter === s ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
              onClick={() => setSelectedSubjectFilter(s)}
            >
              {s}
            </button>
          ))}
          <button className="btn btn-outline" onClick={onBack} style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
            <ArrowLeft size={14} /> Back
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className="glass-panel analytics-stat-card">
          <Flame size={22} color="var(--warning)" />
          <div>
            <span className="analytics-stat-label">Current Streak</span>
            <span className="analytics-stat-value" style={{ color: streakColor }}>
              {displayedStreak} {summary.streakType === 'correct' && !missedADay ? '🔥' : (missedADay ? '❄️' : '')}
            </span>
          </div>
        </div>

        {['Math', 'Physics', 'Chemistry'].map(s => (
          <div key={s} className="glass-panel analytics-stat-card">
            <TrendingUp size={22} color={CHART_COLORS[s].line} />
            <div>
              <span className="analytics-stat-label">{s} ELO</span>
              <span className="analytics-stat-value" style={{ color: CHART_COLORS[s].line }}>
                {user?.[`${s.toLowerCase()}_rating`] || 100}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="analytics-grid">
        {/* ELO Over Time */}
        <div className="glass-panel analytics-chart-panel" style={{ gridColumn: 'span 2' }}>
          <h4 className="analytics-chart-title">
            <TrendingUp size={18} color="var(--accent-primary)" /> ELO Rating Over Time
          </h4>
          {eloChartData ? (
            <div style={{ height: '280px' }}>
              <Line data={eloChartData} options={{
                ...baseChartOptions,
                plugins: { ...baseChartOptions.plugins, title: { display: false } },
                scales: {
                  ...baseChartOptions.scales,
                  y: { ...baseChartOptions.scales.y, suggestedMin: 50 }
                }
              }} />
            </div>
          ) : (
            <p className="analytics-empty">Take some exams to see your ELO trend</p>
          )}
        </div>

        {/* Subject Diagnosis */}
        {(() => {
          const subjects = selectedSubjectFilter === 'All' ? ['Math', 'Physics', 'Chemistry'] : [selectedSubjectFilter];
          const entries = subjects.map(s => ({ subject: s, text: detailedAnalysis[s] })).filter(e => e.text);
          if (!entries.length) return null;
          return entries.map(({ subject, text }) => (
            <div key={subject} className="glass-panel analytics-chart-panel" style={{ gridColumn: 'span 2', padding: '1.5rem', background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.2)', boxShadow: '0 4px 20px -2px rgba(168,85,247,0.1)' }}>
              <h4 className="analytics-chart-title" style={{ color: 'var(--accent-secondary)', marginBottom: '0.75rem' }}>
                <Brain size={18} color="var(--accent-secondary)" /> {subject} Diagnosis
              </h4>
              <p style={{ fontSize: '0.875rem', lineHeight: '1.65', color: 'var(--text-secondary)', margin: 0, whiteSpace: 'pre-line' }}>{text}</p>
            </div>
          ));
        })()}

        {/* Silly vs Concept */}
        <div className="glass-panel analytics-chart-panel">
          <h4 className="analytics-chart-title">
            <Target size={18} color="var(--warning)" /> Silly vs Concept Points Lost
          </h4>
          {tagChartData ? (
            <div style={{ height: '240px' }}>
              <Line data={tagChartData} options={{
                ...baseChartOptions,
                plugins: { ...baseChartOptions.plugins, title: { display: false } }
              }} />
            </div>
          ) : (
            <p className="analytics-empty">Tag problems during review to track mistake types</p>
          )}
        </div>

        {/* Intuition */}
        <div className="glass-panel analytics-chart-panel">
          <h4 className="analytics-chart-title">
            <Brain size={18} color={CHART_COLORS.intuition.line} /> Intuition Accuracy
          </h4>
          {intuitionChartData ? (
            <div style={{ height: '240px' }}>
              <Line data={intuitionChartData} options={{
                ...baseChartOptions,
                plugins: { ...baseChartOptions.plugins, title: { display: false } },
                scales: {
                  ...baseChartOptions.scales,
                  y: { ...baseChartOptions.scales.y, min: 0, max: 100 }
                }
              }} />
            </div>
          ) : (
            <p className="analytics-empty">Tag problems as &ldquo;unsure&rdquo; during review to track intuition</p>
          )}
        </div>

        {/* Point Efficiency */}
        <div className="glass-panel analytics-chart-panel">
          <h4 className="analytics-chart-title">
            <Zap size={18} color={CHART_COLORS.efficiency.line} /> Point Efficiency (pts/min)
          </h4>
          {efficiencyChartData?.datasets[0]?.data?.length ? (
            <div style={{ height: '240px' }}>
              <Bar data={efficiencyChartData} options={{
                ...baseChartOptions,
                plugins: { ...baseChartOptions.plugins, title: { display: false } }
              }} />
            </div>
          ) : (
            <p className="analytics-empty">Complete exams to see point efficiency</p>
          )}
        </div>

        {/* Time Management */}
        <div className="glass-panel analytics-chart-panel">
          <h4 className="analytics-chart-title">
            <Clock size={18} color={CHART_COLORS.time.line} /> Time per Question Trend
          </h4>
          {timeChartData?.datasets[0]?.data?.length ? (
            <div style={{ height: '240px' }}>
              <Line data={timeChartData} options={{
                ...baseChartOptions,
                plugins: { ...baseChartOptions.plugins, title: { display: false } },
                scales: {
                  ...baseChartOptions.scales,
                  y: { ...baseChartOptions.scales.y, title: { display: true, text: 'Seconds', color: '#666677' } }
                }
              }} />
            </div>
          ) : (
            <p className="analytics-empty">Complete exams to see time management trend</p>
          )}
        </div>

        {/* Topic Mastery */}
        <div className="glass-panel analytics-chart-panel" style={{ gridColumn: 'span 2' }}>
          <h4 className="analytics-chart-title">
            <BarChart3 size={18} color="var(--success)" /> Topic Mastery Breakdown
          </h4>
          {topicChartData?.labels?.length ? (
            <div style={{ height: Math.max(200, topicChartData.labels.length * 32) + 'px' }}>
              <Bar data={topicChartData} options={{
                ...baseChartOptions,
                indexAxis: 'y',
                plugins: { ...baseChartOptions.plugins, legend: { display: false }, title: { display: false } },
                scales: {
                  ...baseChartOptions.scales,
                  x: { ...baseChartOptions.scales.x, min: 0, max: 100 }
                }
              }} />
            </div>
          ) : (
            <p className="analytics-empty">Complete exams to build topic mastery data</p>
          )}
        </div>
      </div>

      {/* Strengths & Weaknesses */}
      {(() => {
        const filteredS = selectedSubjectFilter === 'All' ? strengths : strengths.filter(s => s.subject === selectedSubjectFilter);
        const filteredW = selectedSubjectFilter === 'All' ? weaknesses : weaknesses.filter(w => w.subject === selectedSubjectFilter);
        if (filteredS.length === 0 && filteredW.length === 0) return null;
        return (
          <div className="glass-panel" style={{ marginTop: '2rem', padding: '1.5rem' }}>
            <h4 className="analytics-chart-title" style={{ marginBottom: '1rem' }}>
              <Target size={18} color="var(--success)" /> Strengths &amp; Weaknesses
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: selectedTopicDetail ? '0.75rem' : 0 }}>
              {filteredS.length > 0 && (
                <div style={{ padding: '1rem', background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 'var(--radius-md)' }}>
                  <h5 style={{ color: 'var(--success)', marginBottom: '0.6rem', fontSize: '0.85rem' }}>Strengths</h5>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {filteredS.map((s, i) => (
                      <span key={i} onClick={() => setSelectedTopicDetail(prev => prev?.topic === s.topic && prev?.type === 'strength' ? null : { topic: s.topic, subject: s.subject, type: 'strength' })} style={{ background: 'rgba(74,222,128,0.1)', color: 'var(--success)', padding: '0.2rem 0.55rem', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', userSelect: 'none', border: selectedTopicDetail?.topic === s.topic && selectedTopicDetail?.type === 'strength' ? '1px solid var(--success)' : '1px solid transparent', transition: 'all 0.2s' }}>
                        {s.subject !== 'All' && selectedSubjectFilter === 'All' ? `${s.topic} (${s.subject})` : s.topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {filteredW.length > 0 && (
                <div style={{ padding: '1rem', background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 'var(--radius-md)' }}>
                  <h5 style={{ color: 'var(--danger)', marginBottom: '0.6rem', fontSize: '0.85rem' }}>Weaknesses</h5>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {filteredW.map((w, i) => (
                      <span key={i} onClick={() => setSelectedTopicDetail(prev => prev?.topic === w.topic && prev?.type === 'weakness' ? null : { topic: w.topic, subject: w.subject, type: 'weakness' })} style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--danger)', padding: '0.2rem 0.55rem', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', userSelect: 'none', border: selectedTopicDetail?.topic === w.topic && selectedTopicDetail?.type === 'weakness' ? '1px solid var(--danger)' : '1px solid transparent', transition: 'all 0.2s' }}>
                        {w.subject !== 'All' && selectedSubjectFilter === 'All' ? `${w.topic} (${w.subject})` : w.topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {selectedTopicDetail && (
              <div style={{ marginTop: '0.75rem', padding: '1.25rem', background: selectedTopicDetail.type === 'strength' ? 'rgba(74,222,128,0.03)' : 'rgba(248,113,113,0.03)', border: `1px solid ${selectedTopicDetail.type === 'strength' ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`, borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                    Topic Detail: <strong style={{ color: selectedTopicDetail.type === 'strength' ? 'var(--success)' : 'var(--danger)' }}>{selectedTopicDetail.topic}</strong>
                    {selectedTopicDetail.subject && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.4rem' }}>({selectedTopicDetail.subject})</span>}
                  </h4>
                  <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', height: 'auto', minHeight: 'auto' }} onClick={() => setSelectedTopicDetail(null)}>Close</button>
                </div>
                {topicBreakdowns[selectedTopicDetail.topic] ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.85rem', lineHeight: '1.6' }}>
                    <div>
                      <span style={{ color: 'var(--success)', fontWeight: '600', display: 'block', marginBottom: '0.15rem' }}>✓ What you are good at:</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{topicBreakdowns[selectedTopicDetail.topic].good_at}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--danger)', fontWeight: '600', display: 'block', marginBottom: '0.15rem' }}>✗ What you are not good at:</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{topicBreakdowns[selectedTopicDetail.topic].not_good_at}</span>
                    </div>
                  </div>
                ) : (
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No AI breakdown stored yet. Complete more sessions to build detail!</span>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Past Exam History */}
      {history.length > 0 && (
        <div className="glass-panel" style={{ marginTop: '2rem', padding: '1.5rem' }}>
          <h4 className="analytics-chart-title" style={{ marginBottom: '1rem' }}>
            <TrendingUp size={18} color="var(--accent-primary)" /> Past Exam History
          </h4>
          <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '0.5rem' }}>
            {history.map((h, i) => (
              <div
                key={i}
                className="history-row"
                onClick={() => loadingExamId === null && onReviewExam && onReviewExam(h)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-tertiary)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.85rem', cursor: onReviewExam ? 'pointer' : 'default', transition: 'all 0.2s ease' }}
              >
                <div>
                  <strong style={{ color: 'var(--accent-primary)' }}>{h.subject}</strong>
                  <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{formatDate(h.created_at)}</span>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <span style={{ color: h.accuracy >= 0.70 ? 'var(--success)' : h.accuracy >= 0.40 ? 'var(--warning)' : 'var(--danger)' }}>{Math.round(h.accuracy * 100)}% Acc</span>
                  <strong style={{ color: h.rating_change >= 0 ? 'var(--success)' : 'var(--danger)' }}>{h.rating_change >= 0 ? `+${h.rating_change}` : h.rating_change} ({h.new_rating})</strong>
                  {onReviewExam && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent-secondary)', textDecoration: 'underline', opacity: 0.8 }}>
                      {loadingExamId === h.exam_id ? 'Loading...' : 'Review'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
