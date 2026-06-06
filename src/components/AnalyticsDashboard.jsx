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

export function AnalyticsDashboard({ user, onBack, strengths = [], weaknesses = [], topicBreakdowns = {}, detailedAnalysis = {}, history = [], loadingExamId = null, onReviewExam = null }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('All');
  const [selectedTopicDetail, setSelectedTopicDetail] = useState(null);
  const [activeTab, setActiveTab] = useState('analytics'); // 'analytics' or 'org_portal'
  const [orgMembers, setOrgMembers] = useState([]);
  const [orgLoading, setOrgLoading] = useState(false);

  const displayHistory = useMemo(() => history && history.length > 0 ? history : (data?.history || []), [history, data?.history]);
  const displayStrengths = useMemo(() => strengths && strengths.length > 0 ? strengths : (data?.strengths || []), [strengths, data?.strengths]);
  const displayWeaknesses = useMemo(() => weaknesses && weaknesses.length > 0 ? weaknesses : (data?.weaknesses || []), [weaknesses, data?.weaknesses]);
  const displayDetailedAnalysis = useMemo(() => Object.keys(detailedAnalysis || {}).length > 0 ? detailedAnalysis : (data?.detailedAnalysis || {}), [detailedAnalysis, data?.detailedAnalysis]);
  const displayTopicBreakdowns = useMemo(() => Object.keys(topicBreakdowns || {}).length > 0 ? topicBreakdowns : (data?.topicBreakdowns || {}), [topicBreakdowns, data?.topicBreakdowns]);

  const fetchOrgMembers = () => {
    if (!user?.user_organization) return;
    setOrgLoading(true);
    fetch(`/api/org-members?organization=${encodeURIComponent(user.user_organization)}`)
      .then(r => r.json())
      .then(d => {
        if (d.members) {
          setOrgMembers(d.members);
        }
        setOrgLoading(false);
      })
      .catch(e => {
        console.error('Failed to fetch org members:', e);
        setOrgLoading(false);
      });
  };

  useEffect(() => {
    fetchOrgMembers();
  }, [user?.user_organization]);

  const handleUpdateRole = async (targetUser, newRole) => {
    try {
      const res = await fetch('/api/org-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUsername: targetUser,
          userRole: newRole,
          userOrganization: user.user_organization,
          operatorUsername: user.user_id
        })
      });
      if (res.ok) {
        fetchOrgMembers();
      } else {
        const d = await res.json();
        alert(d.error || 'Failed to update member role');
      }
    } catch (e) {
      console.error(e);
      alert('Error updating member role');
    }
  };

  const renderOrgPortal = () => {
    if (orgLoading) {
      return (
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <Loader2 className="animate-spin" size={32} style={{ margin: '0 auto 1rem', color: 'var(--accent-primary)' }} />
          <p style={{ color: 'var(--text-secondary)' }}>Loading organization dashboard...</p>
        </div>
      );
    }

    const students = orgMembers.filter(m => m.user_role === 'student');
    const teachers = orgMembers.filter(m => m.user_role === 'teacher');
    const admins = orgMembers.filter(m => m.user_role === 'admin');

    const getOverallElo = (m) => {
      if (m.user_role === 'teacher' || m.user_role === 'admin') return null;
      return Math.round(((m.math_rating || 100) + (m.physics_rating || 100) + (m.chemistry_rating || 100)) / 3);
    };

    const getSortRating = (m) => {
      if (m.user_role === 'teacher' || m.user_role === 'admin') return -9999;
      if (selectedSubjectFilter === 'Math') return m.math_rating || 100;
      if (selectedSubjectFilter === 'Physics') return m.physics_rating || 100;
      if (selectedSubjectFilter === 'Chemistry') return m.chemistry_rating || 100;
      return getOverallElo(m);
    };

    const sortedMembers = [...orgMembers].sort((a, b) => getSortRating(b) - getSortRating(a));

    const avgMath = students.length > 0 ? Math.round(students.reduce((acc, m) => acc + (m.math_rating || 100), 0) / students.length) : 100;
    const avgPhys = students.length > 0 ? Math.round(students.reduce((acc, m) => acc + (m.physics_rating || 100), 0) / students.length) : 100;
    const avgChem = students.length > 0 ? Math.round(students.reduce((acc, m) => acc + (m.chemistry_rating || 100), 0) / students.length) : 100;

    const isTeacherOrAdmin = user.user_role === 'teacher' || user.user_role === 'admin';
    const isAdmin = user.user_role === 'admin';

    return (
      <div className="glass-panel animate-fade-in" style={{ padding: 'var(--panel-padding)', minHeight: '400px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 className="text-gradient" style={{ fontSize: '1.75rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Brain size={28} /> {user.user_organization} Dashboard
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              You are logged in as a <strong style={{ color: 'var(--accent-primary)', textTransform: 'capitalize' }}>{user.user_role || 'member'}</strong>
            </p>
          </div>
          <button className="btn btn-outline" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={fetchOrgMembers}>
            Refresh Roster
          </button>
        </div>

        {isTeacherOrAdmin && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <div style={{ padding: 'var(--card-padding-sm)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Total Members</span>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{orgMembers.length}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  ({students.length} S / {teachers.length} T / {admins.length} A)
                </span>
              </div>
            </div>
            <div style={{ padding: 'var(--card-padding-sm)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Avg Math ELO</span>
              <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#6366f1' }}>{avgMath}</span>
            </div>
            <div style={{ padding: 'var(--card-padding-sm)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Avg Physics ELO</span>
              <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>{avgPhys}</span>
            </div>
            <div style={{ padding: 'var(--card-padding-sm)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Avg Chemistry ELO</span>
              <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>{avgChem}</span>
            </div>
          </div>
        )}

        <h4 style={{ marginBottom: '1rem', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
          {isTeacherOrAdmin ? 'Organization Member Roster' : 'Organization Leaderboard'}
        </h4>

        {sortedMembers.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No other members in this organization yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Rank</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>User</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Role</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>Math</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>Physics</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>Chemistry</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>Overall Avg</th>
                  {isAdmin && <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {sortedMembers.map((m, idx) => {
                  const isSelf = m.user_id === user.user_id;
                  const overall = getOverallElo(m);
                  return (
                    <tr
                      key={m.user_id}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        background: isSelf ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                        transition: 'background 0.2s',
                        cursor: 'default'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = isSelf ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255,255,255,0.02)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = isSelf ? 'rgba(99, 102, 241, 0.08)' : 'transparent' }}
                    >
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 'bold', color: idx === 0 ? 'var(--warning)' : 'var(--text-secondary)' }}>
                        #{idx + 1}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: isSelf ? 'bold' : 'normal', color: isSelf ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                        {m.user_id} {isSelf && '(You)'}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <span style={{
                          fontSize: '0.75rem',
                          background: m.user_role === 'admin' ? 'rgba(239, 68, 68, 0.15)' : m.user_role === 'teacher' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(74, 222, 128, 0.15)',
                          color: m.user_role === 'admin' ? '#ef4444' : m.user_role === 'teacher' ? '#f59e0b' : '#4ade80',
                          padding: '0.15rem 0.4rem',
                          borderRadius: '4px',
                          textTransform: 'uppercase',
                          fontWeight: '600'
                        }}>
                          {m.user_role || 'student'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: '#6366f1' }}>
                        {m.user_role === 'teacher' || m.user_role === 'admin' ? '—' : (m.math_rating || 100)}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: '#f59e0b' }}>
                        {m.user_role === 'teacher' || m.user_role === 'admin' ? '—' : (m.physics_rating || 100)}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: '#10b981' }}>
                        {m.user_role === 'teacher' || m.user_role === 'admin' ? '—' : (m.chemistry_rating || 100)}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                        {m.user_role === 'teacher' || m.user_role === 'admin' ? '—' : overall}
                      </td>
                      {isAdmin && (
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                          {isSelf ? (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Self (Use Profile)</span>
                          ) : (
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                              <select
                                className="input-field"
                                style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', width: 'auto', minWidth: '90px' }}
                                value={m.user_role || 'student'}
                                onChange={(e) => handleUpdateRole(m.user_id, e.target.value)}
                              >
                                <option value="student">Student</option>
                                <option value="teacher">Teacher</option>
                                <option value="admin">Admin</option>
                              </select>
                              <button
                                className="btn btn-outline"
                                style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', height: 'auto', minHeight: 'auto', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                                onClick={async () => {
                                  if (confirm(`Remove ${m.user_id} from organization?`)) {
                                    try {
                                      const res = await fetch('/api/org-members', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          targetUsername: m.user_id,
                                          userRole: null,
                                          userOrganization: null,
                                          operatorUsername: user.user_id
                                        })
                                      });
                                      if (res.ok) {
                                        fetchOrgMembers();
                                      } else {
                                        const d = await res.json();
                                        alert(d.error || 'Failed to remove member');
                                      }
                                    } catch (e) {
                                      console.error(e);
                                      alert('Error removing member');
                                    }
                                  }
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

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

    // To graph ELO vs time effectively, we want to map every ELO change to its exact timestamp
    // Sorting history chronologically (asc) to build progression
    const sortedHistory = [...data.eloHistory].sort((a, b) => {
      const da = new Date(a.created_at?.value || a.created_at);
      const db = new Date(b.created_at?.value || b.created_at);
      return da - db;
    });

    // Create a chronological baseline. If a subject has no exams yet, it remains 100.
    // We map each point to its exact time/date to see the ELO vs time progression accurately.
    const datasets = filteredSubjects.map(s => {
      const subjectHistory = sortedHistory.filter(h => h.subject === s);

      // Starting point: (100) before any exam
      const points = [{ x: 'Start', y: 100 }];

      let lastRating = 100;
      for (const h of subjectHistory) {
        lastRating = h.new_rating;
        const dateStr = formatDate(h.created_at?.value || h.created_at);
        points.push({ x: dateStr, y: lastRating });
      }

      return {
        label: s,
        data: points.map(p => p.y),
        borderColor: CHART_COLORS[s].line,
        backgroundColor: CHART_COLORS[s].bg,
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 6
      };
    });

    // Generate labels that correspond to all the changes in chronological order
    // To align datasets on the same X-axis, let's find the max steps or align them using step labels
    // If filtering a single subject, X-axis labels are precisely that subject's exam dates.
    // If 'All', we can align them by sequential steps/dates or use the union of all dates,
    // or simply display sequential attempts with the actual date label.
    // A clean approach is to use the sequential index of exams as labels, showing their actual dates,
    // or map the union of all timestamps. Let's do union of all timestamps to align them properly.
    const timeline = [];
    const subjectState = {};
    subjects.forEach(s => {
      subjectState[s] = 100;
    });

    // Initialize with Start
    timeline.push({ label: 'Start', ratings: { ...subjectState } });

    for (const h of sortedHistory) {
      const sub = h.subject;
      subjectState[sub] = h.new_rating;
      const dateStr = formatDate(h.created_at?.value || h.created_at);

      timeline.push({
        label: dateStr,
        ratings: { ...subjectState }
      });
    }

    const labels = timeline.map(t => t.label);
    const finalDatasets = filteredSubjects.map(s => {
      return {
        label: s,
        data: timeline.map(t => t.ratings[s]),
        borderColor: CHART_COLORS[s].line,
        backgroundColor: CHART_COLORS[s].bg,
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 6
      };
    });

    return { labels, datasets: finalDatasets };
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

  // Aggregate timeline chart
  const aggregateTimelineChartData = useMemo(() => {
    if (!data?.timelines) return null;
    const timeline = data.timelines[selectedSubjectFilter] || data.timelines.All;
    if (!timeline?.data?.length) return null;

    return {
      labels: timeline.labels,
      datasets: [{
        label: 'Cumulative / Active Points',
        data: timeline.data,
        borderColor: CHART_COLORS.efficiency.line,
        backgroundColor: CHART_COLORS.efficiency.bg,
        fill: true,
        tension: 0.35,
        pointRadius: 2,
        pointHoverRadius: 5
      }]
    };
  }, [data, selectedSubjectFilter]);

  // Avg Time per Question breakdown per subject
  const avgTimeSubjectChartData = useMemo(() => {
    if (!data?.avgTimePerSubject) return null;
    const subjects = ['Math', 'Physics', 'Chemistry'];
    return {
      labels: subjects,
      datasets: [{
        label: 'Seconds / Question',
        data: subjects.map(s => data.avgTimePerSubject[s] || 0),
        backgroundColor: subjects.map(s => CHART_COLORS[s]?.bg || CHART_COLORS.time.bg),
        borderColor: subjects.map(s => CHART_COLORS[s]?.line || CHART_COLORS.time.line),
        borderWidth: 1,
        borderRadius: 6,
        barPercentage: 0.6
      }]
    };
  }, [data]);

  // Topic mastery horizontal bar
  const topicChartData = useMemo(() => {
    if (!data?.topicMastery?.length) return null;
    const filtered = (selectedSubjectFilter === 'All'
      ? data.topicMastery
      : data.topicMastery.filter(t => t.subject === selectedSubjectFilter)
    ).filter(t => t.total_count > 0);

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
      <div className="glass-panel" style={{ padding: 'var(--panel-padding-lg)', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
        <Loader2 className="animate-spin" size={48} style={{ margin: '0 auto 1rem', color: 'var(--accent-primary)' }} />
        <h3>Loading Analytics...</h3>
        <p style={{ color: 'var(--text-secondary)' }}>Crunching your performance data</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel" style={{ padding: 'var(--panel-padding-lg)', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
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
          <h2 className="text-gradient" style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>Analytics</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Across {summary.totalExams || 0} tests</p>
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

      {user?.user_organization && user?.user_role !== 'admin' && (
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '1.5rem', paddingBottom: '0.25rem' }}>
          <button
            onClick={() => setActiveTab('analytics')}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'analytics' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: activeTab === 'analytics' ? 'var(--text-primary)' : 'var(--text-secondary)',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.9rem',
              transition: 'all 0.2s'
            }}
          >
            My Analytics
          </button>
          <button
            onClick={() => setActiveTab('org_portal')}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'org_portal' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: activeTab === 'org_portal' ? 'var(--text-primary)' : 'var(--text-secondary)',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.9rem',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <Brain size={14} /> {user.user_organization} Dashboard
          </button>
        </div>
      )}

      {user?.user_organization && user?.user_role !== 'admin' && activeTab === 'org_portal' ? (
        renderOrgPortal()
      ) : (
        <>
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

            {selectedSubjectFilter === 'All' ? (
              ['Math', 'Physics', 'Chemistry'].map(s => (
                <div key={s} className="glass-panel analytics-stat-card">
                  <TrendingUp size={22} color={CHART_COLORS[s].line} />
                  <div>
                    <span className="analytics-stat-label">{s} ELO</span>
                    <span className="analytics-stat-value" style={{ color: CHART_COLORS[s].line }}>
                      {user?.[`${s.toLowerCase()}_rating`] || 100}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <>
                <div className="glass-panel analytics-stat-card">
                  <TrendingUp size={22} color={CHART_COLORS[selectedSubjectFilter].line} />
                  <div>
                    <span className="analytics-stat-label">{selectedSubjectFilter} ELO</span>
                    <span className="analytics-stat-value" style={{ color: CHART_COLORS[selectedSubjectFilter].line }}>
                      {user?.[`${selectedSubjectFilter.toLowerCase()}_rating`] || 100}
                    </span>
                  </div>
                </div>
                <div className="glass-panel analytics-stat-card">
                  <Clock size={22} color="var(--accent-secondary)" />
                  <div>
                    <span className="analytics-stat-label">Average Time per Question</span>
                    <span className="analytics-stat-value" style={{ color: 'var(--accent-secondary)' }}>
                      {data?.avgTimePerSubject?.[selectedSubjectFilter] ? `${Math.round(data.avgTimePerSubject[selectedSubjectFilter])}s` : '0s'}
                    </span>
                  </div>
                </div>
                <div className="glass-panel analytics-stat-card">
                  <Target size={22} color="var(--success)" />
                  <div>
                    <span className="analytics-stat-label">Overall Subject Accuracy</span>
                    <span className="analytics-stat-value" style={{ color: 'var(--success)' }}>
                      {(() => {
                        const subjectHistory = (data?.eloHistory || []).filter(h => h.subject === selectedSubjectFilter);
                        if (subjectHistory.length === 0) return '0%';
                        const sum = subjectHistory.reduce((acc, h) => acc + (h.accuracy || 0), 0);
                        return Math.round((sum / subjectHistory.length) * 100) + '%';
                      })()}
                    </span>
                  </div>
                </div>
              </>
            )}
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
              const entries = subjects.map(s => ({ subject: s, text: displayDetailedAnalysis[s] })).filter(e => e.text);
              if (!entries.length) return null;
              return entries.map(({ subject, text }) => (
                <div key={subject} className="glass-panel analytics-chart-panel" style={{ gridColumn: 'span 2', padding: 'var(--card-padding)', background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.2)', boxShadow: '0 4px 20px -2px rgba(168,85,247,0.1)' }}>
                  <h4 className="analytics-chart-title" style={{ color: 'var(--accent-secondary)', marginBottom: '0.75rem' }}>
                    <Brain size={18} color="var(--accent-secondary)" /> {subject} Overview
                  </h4>
                  <p style={{ fontSize: '0.875rem', lineHeight: '1.65', color: 'var(--text-secondary)', margin: 0, whiteSpace: 'pre-line' }}>{text}</p>
                </div>
              ));
            })()}

            {/* Silly vs Concept */}
            <div className="glass-panel analytics-chart-panel">
              <h4 className="analytics-chart-title">
                <Target size={18} color="var(--warning)" />Points Lost
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

            {/* Points timeline Chart */}
            <div className="glass-panel analytics-chart-panel">
              <h4 className="analytics-chart-title">
                <Zap size={18} color={CHART_COLORS.efficiency.line} /> Question Completion Timeline (Aggregate)
              </h4>
              {aggregateTimelineChartData ? (
                <div style={{ height: '240px' }}>
                  <Line data={aggregateTimelineChartData} options={{
                    ...baseChartOptions,
                    plugins: { ...baseChartOptions.plugins, title: { display: false } },
                    scales: {
                      ...baseChartOptions.scales,
                      x: { ...baseChartOptions.scales.x, title: { display: true, text: 'Time Elapsed', color: '#666677', font: { size: 10 } } },
                      y: { ...baseChartOptions.scales.y, title: { display: true, text: 'Points', color: '#666677', font: { size: 10 } } }
                    }
                  }} />
                </div>
              ) : (
                <p className="analytics-empty">No timeline data available</p>
              )}
            </div>

            {/* Avg Time / Question by Subject */}
            {selectedSubjectFilter === 'All' && (
              <div className="glass-panel analytics-chart-panel">
                <h4 className="analytics-chart-title">
                  <Clock size={18} color={CHART_COLORS.time.line} /> Avg Time / Question by Subject
                </h4>
                {avgTimeSubjectChartData ? (
                  <div style={{ height: '240px' }}>
                    <Bar data={avgTimeSubjectChartData} options={{
                      ...baseChartOptions,
                      plugins: { ...baseChartOptions.plugins, legend: { display: false } }
                    }} />
                  </div>
                ) : (
                  <p className="analytics-empty">Complete exams to see time breakdown</p>
                )}
              </div>
            )}

            {/* Topic Mastery */}
            <div className="glass-panel analytics-chart-panel" style={{ gridColumn: 'span 2' }}>
              <h4 className="analytics-chart-title">
                <BarChart3 size={18} color="var(--success)" /> Topic Breakdown
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
            const filteredS = selectedSubjectFilter === 'All' ? displayStrengths : displayStrengths.filter(s => s.subject === selectedSubjectFilter);
            const filteredW = selectedSubjectFilter === 'All' ? displayWeaknesses : displayWeaknesses.filter(w => w.subject === selectedSubjectFilter);
            if (filteredS.length === 0 && filteredW.length === 0) return null;
            return (
              <div className="glass-panel" style={{ marginTop: '2rem', padding: 'var(--card-padding)' }}>
                <h4 className="analytics-chart-title" style={{ marginBottom: '1rem' }}>
                  <Target size={18} color="var(--success)" /> Strengths &amp; Weaknesses
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: selectedTopicDetail ? '0.75rem' : 0 }}>
                  {filteredS.length > 0 && (
                    <div style={{ padding: 'var(--card-padding-sm)', background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 'var(--radius-md)' }}>
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
                    <div style={{ padding: 'var(--card-padding-sm)', background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 'var(--radius-md)' }}>
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
                  <div style={{ marginTop: '0.75rem', padding: 'var(--card-padding-sm)', background: selectedTopicDetail.type === 'strength' ? 'rgba(74,222,128,0.03)' : 'rgba(248,113,113,0.03)', border: `1px solid ${selectedTopicDetail.type === 'strength' ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`, borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                        <strong style={{ color: selectedTopicDetail.type === 'strength' ? 'var(--success)' : 'var(--danger)' }}>{selectedTopicDetail.topic}</strong>
                        {selectedTopicDetail.subject && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.4rem' }}>({selectedTopicDetail.subject})</span>}
                      </h4>
                      <button className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', height: 'auto', minHeight: 'auto' }} onClick={() => setSelectedTopicDetail(null)}>Close</button>
                    </div>
                    {displayTopicBreakdowns[selectedTopicDetail.topic] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.85rem', lineHeight: '1.6' }}>
                        <div>
                          <span style={{ color: 'var(--success)', fontWeight: '600', display: 'block', marginBottom: '0.15rem' }}>✓ What you are good at:</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{displayTopicBreakdowns[selectedTopicDetail.topic].good_at}</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--danger)', fontWeight: '600', display: 'block', marginBottom: '0.15rem' }}>✗ What you are not good at:</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{displayTopicBreakdowns[selectedTopicDetail.topic].not_good_at}</span>
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
          {displayHistory.length > 0 && (
            <div className="glass-panel" style={{ marginTop: '2rem', padding: 'var(--card-padding)' }}>
              <h4 className="analytics-chart-title" style={{ marginBottom: '1rem' }}>
                <TrendingUp size={18} color="var(--accent-primary)" /> History
              </h4>
              <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '0.5rem' }}>
                {displayHistory.map((h, i) => (
                  <div
                    key={i}
                    className="history-row"
                    onClick={() => loadingExamId === null && onReviewExam && onReviewExam(h)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-tertiary)', padding: 'var(--card-padding-sm)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.85rem', cursor: onReviewExam ? 'pointer' : 'default', transition: 'all 0.2s ease' }}
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
        </>
      )}
    </div>
  );
}
