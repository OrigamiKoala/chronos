import { useState, useEffect } from 'react';
import { Shield, UserPlus, Users, Loader2, Database } from 'lucide-react';

export function AdminScreen({ user, onBack }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Bulk promotion form state
  const [promoteList, setPromoteList] = useState('');
  const [promoteRole, setPromoteRole] = useState('teacher');
  const [promoteLoading, setPromoteLoading] = useState(false);
  const [promoteError, setPromoteError] = useState('');
  const [promoteSuccess, setPromoteSuccess] = useState('');

  // Script execution state
  const [scriptLoading, setScriptLoading] = useState(false);
  const [scriptMessage, setScriptMessage] = useState('');
  const [scriptError, setScriptError] = useState('');

  const handleRunScripts = async () => {
    setScriptLoading(true);
    setScriptError('');
    setScriptMessage('');
    try {
      const res = await fetch('/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorUsername: user.user_id })
      });
      const data = await res.json();
      if (res.ok) {
        setScriptMessage(`Migration completed! Updated ${data.updatedCount || 0} user records.`);
      } else {
        setScriptError(data.error || 'Failed to execute script.');
      }
    } catch (err) {
      console.error(err);
      setScriptError('Connection error executing update script.');
    } finally {
      setScriptLoading(false);
    }
  };

  const fetchMembers = () => {
    if (!user?.user_organization) {
      setTimeout(() => {
        setError('You are not associated with any organization.');
        setLoading(false);
      }, 0);
      return;
    }
    fetch(`/api/org-members?organization=${encodeURIComponent(user.user_organization)}`)
      .then(r => r.json())
      .then(d => {
        if (d.members) {
          setMembers(d.members);
        }
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        setError('Failed to fetch organization members.');
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleBulkPromote = async (e) => {
    e.preventDefault();
    setPromoteError('');
    setPromoteSuccess('');
    
    if (!promoteList.trim()) {
      setPromoteError('Please enter at least one username.');
      return;
    }

    setPromoteLoading(true);
    try {
      const res = await fetch('/api/org-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUsername: promoteList,
          userRole: promoteRole,
          userOrganization: user.user_organization,
          operatorUsername: user.user_id
        })
      });

      const data = await res.json();
      if (res.ok) {
        setPromoteSuccess(`Successfully updated roles for: ${data.updated.join(', ')}`);
        setPromoteList('');
        setLoading(true);
        fetchMembers();
      } else {
        setPromoteError(data.error || 'Failed to promote users.');
      }
    } catch (err) {
      console.error(err);
      setPromoteError('Connection error during bulk promotion.');
    } finally {
      setPromoteLoading(false);
    }
  };

  if (user?.user_role !== 'admin') {
    return (
      <div className="glass-panel" style={{ padding: 'var(--panel-padding-lg)', textAlign: 'center', maxWidth: '500px', margin: '4rem auto' }}>
        <h3 style={{ color: 'var(--danger)' }}>Access Denied</h3>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Only administrators can access this portal.</p>
        <button className="btn btn-outline" style={{ marginTop: '1.5rem' }} onClick={onBack}>Go Back</button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Shield size={32} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
          <div>
            <h2 className="text-gradient" style={{ fontSize: '2rem', marginBottom: '0.15rem', lineHeight: '1.2' }}>
              Admin Control Panel
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
              Organization: <strong>{user.user_organization}</strong>
            </p>
          </div>
        </div>
        <button className="btn btn-outline" onClick={onBack}>
          Exit Admin
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem', alignItems: 'start', flexWrap: 'wrap-reverse' }}>
        {/* Roster column */}
        <div className="glass-panel" style={{ padding: 'var(--panel-padding)' }}>
          <h3 style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem' }}>
            <Users size={20} color="var(--accent-primary)" /> Members Directory ({members.length})
          </h3>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <Loader2 className="animate-spin" style={{ margin: '0 auto 0.5rem', color: 'var(--accent-primary)' }} />
              <span>Loading roster...</span>
            </div>
          ) : error ? (
            <p style={{ color: 'var(--danger)' }}>{error}</p>
          ) : members.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No members found in organization.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Username</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Role</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>Math</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>Physics</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>Chemistry</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map(m => (
                    <tr key={m.user_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: m.user_id === user.user_id ? 'bold' : 'normal', color: m.user_id === user.user_id ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                        {m.user_id} {m.user_id === user.user_id && '(You)'}
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
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: '#6366f1' }}>{m.math_rating || 100}</td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: '#f59e0b' }}>{m.physics_rating || 100}</td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: '#10b981' }}>{m.chemistry_rating || 100}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '340px' }}>
          {/* Promote Panel */}
          <div className="glass-panel" style={{ padding: 'var(--panel-padding)' }}>
            <h3 style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem' }}>
              <UserPlus size={20} color="var(--accent-primary)" /> Promote Members
            </h3>

            <form onSubmit={handleBulkPromote} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                  Usernames (comma-separated)
                </label>
                <textarea
                  placeholder="user1, user2, user3"
                  value={promoteList}
                  onChange={(e) => setPromoteList(e.target.value)}
                  className="input-field"
                  style={{ minHeight: '80px', fontFamily: 'monospace', resize: 'vertical' }}
                  disabled={promoteLoading}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                  Promote to Role
                </label>
                <select
                  value={promoteRole}
                  onChange={(e) => setPromoteRole(e.target.value)}
                  className="input-field"
                  disabled={promoteLoading}
                >
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {promoteError && <p style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>{promoteError}</p>}
              {promoteSuccess && <p style={{ color: 'var(--success)', fontSize: '0.8rem' }}>{promoteSuccess}</p>}

              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={promoteLoading}>
                {promoteLoading ? (
                  <>
                    <Loader2 className="animate-spin" size={16} /> Promoting
                  </>
                ) : (
                  'Promote Users'
                )}
              </button>
            </form>
          </div>

          {/* System Scripts Panel */}
          <div className="glass-panel" style={{ padding: 'var(--panel-padding)' }}>
            <h3 style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem' }}>
              <Database size={20} color="var(--accent-primary)" /> System Scripts
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: '1.4' }}>
              Execute the database migration utility to upgrade historical exam schemas for all pending users in the organization.
            </p>

            {scriptError && <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{scriptError}</p>}
            {scriptMessage && <p style={{ color: 'var(--success)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{scriptMessage}</p>}

            <button 
              type="button" 
              className="btn btn-outline" 
              style={{ width: '100%', borderColor: 'rgba(99, 102, 241, 0.4)', color: 'var(--accent-primary)' }} 
              onClick={handleRunScripts} 
              disabled={scriptLoading}
            >
              {scriptLoading ? (
                <>
                  <Loader2 className="animate-spin" size={16} /> Running Scripts
                </>
              ) : (
                'Run Database Migration'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
