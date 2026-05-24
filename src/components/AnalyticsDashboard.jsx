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

export function AnalyticsDashboard({ user, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('All');

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

    // Build per-subject running ELO
    const subjectElo = {};
    for (const s of subjects) subjectElo[s] = [{ label: 'Start', rating: 100 }];

    for (const h of data.eloHistory) {
      subjectElo[h.subject].push({
        label: formatDate(h.created_at),
        rating: h.new_rating
      });
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

  const missedADay = useMemo(() => {
    if (!data?.eloHistory?.length) return true;
    const lastExam = data.eloHistory[data.eloHistory.length - 1];
    const lastExamDateStr = lastExam.created_at?.value || lastExam.created_at;
    if (!lastExamDateStr) return true;
    const lastExamDate = new Date(lastExamDateStr);
    if (isNaN(lastExamDate.getTime())) return true;
    return (new Date() - lastExamDate) > 24 * 60 * 60 * 1000;
  }, [data]);

  const summary = data?.summary || {};

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
            <span className="analytics-stat-value" style={{ color: summary.streakType === 'correct' ? 'var(--success)' : 'var(--danger)' }}>
              {summary.currentStreak || 0} {summary.streakType === 'correct' ? '🔥' : (missedADay ? '❄️' : '')}
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
    </div>
  );
}
