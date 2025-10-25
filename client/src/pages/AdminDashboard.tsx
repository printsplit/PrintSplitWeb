import { useState, useEffect } from 'react';
import { navigate } from '../components/Router';
import { useAuth } from '../context/AuthContext';

interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
  total: number;
}

interface ProcessingStats {
  avgProcessingTime: number;
  successRate: number;
  totalProcessed: number;
}

interface ActiveJob {
  id: string;
  progress: number;
  startedAt: number;
  data: {
    fileName: string;
    dimensions: any;
  };
}

interface SystemHealth {
  redis: boolean;
  minio: boolean;
  workers: {
    active: number;
    healthy: boolean;
    lastActivity: number | null;
  };
  timestamp: number;
}

interface AdminStats {
  queue: QueueStats;
  processing: ProcessingStats;
  activeJobs: ActiveJob[];
  timestamp: number;
}

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { isAuthenticated, token, logout } = useAuth();

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/admin/login');
    }
  }, [isAuthenticated]);

  // Fetch stats and health
  const fetchStats = async () => {
    if (!token) return;

    try {
      const [statsRes, healthRes] = await Promise.all([
        fetch('/api/admin/stats', {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch('/api/admin/system-health', {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ]);

      if (!statsRes.ok) {
        if (statsRes.status === 401 || statsRes.status === 403) {
          logout();
          navigate('/admin/login');
          return;
        }
        throw new Error('Failed to fetch stats');
      }

      const statsData = await statsRes.json();
      setStats(statsData);

      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setHealth(healthData);
      }

      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load stats');
      console.error('Stats fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch and auto-refresh every 5 seconds
  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [token]);

  const handleKillJob = async (jobId: string) => {
    if (!token) return;

    if (!confirm(`Are you sure you want to kill job ${jobId.substring(0, 8)}...?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/jobs/${jobId}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to kill job');
      }

      // Refresh stats immediately after killing
      fetchStats();
    } catch (err: any) {
      alert(`Failed to kill job: ${err.message}`);
      console.error('Kill job error:', err);
    }
  };

  const handleRestartWorker = async () => {
    if (!token) return;

    if (!confirm('⚠️ WARNING: This will restart the worker and cancel all active jobs. The worker will restart within 10 seconds. Are you sure?')) {
      return;
    }

    try {
      const response = await fetch('/api/admin/worker/restart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to restart worker');
      }

      const data = await response.json();
      alert(data.message || 'Worker restart signal sent. It will restart within 10 seconds.');
      // Refresh stats after a delay
      setTimeout(fetchStats, 12000);
    } catch (err: any) {
      alert(`Failed to restart worker: ${err.message}`);
      console.error('Restart worker error:', err);
    }
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    return formatTime(seconds);
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f5f7fa',
      padding: '2rem',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem',
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem', color: '#333' }}>
            Admin Dashboard
          </h1>
          <p style={{ margin: '0.5rem 0 0', color: '#666', fontSize: '0.875rem' }}>
            Auto-refreshes every 5 seconds
          </p>
        </div>
        <div>
          <a
            href="/core"
            style={{
              marginRight: '1rem',
              padding: '0.5rem 1rem',
              background: '#fff',
              border: '1px solid #ddd',
              borderRadius: '4px',
              textDecoration: 'none',
              color: '#333',
              fontSize: '0.875rem',
            }}
          >
            Back to App
          </a>
          <button
            onClick={logout}
            style={{
              padding: '0.5rem 1rem',
              background: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          marginBottom: '1rem',
          padding: '1rem',
          background: '#fee',
          border: '1px solid #fcc',
          borderRadius: '4px',
          color: '#c33',
        }}>
          {error}
        </div>
      )}

      {stats && (
        <>
          {/* System Health Status */}
          {health && (
            <div style={{
              background: 'white',
              padding: '1rem',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              marginBottom: '2rem',
              display: 'flex',
              gap: '2rem',
              alignItems: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: health.redis ? '#28a745' : '#dc3545',
                }} />
                <span style={{ fontSize: '0.875rem', color: '#666' }}>Redis</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: health.minio ? '#28a745' : '#dc3545',
                }} />
                <span style={{ fontSize: '0.875rem', color: '#666' }}>MinIO</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: health.workers.healthy ? '#28a745' : '#dc3545',
                }} />
                <span style={{ fontSize: '0.875rem', color: '#666' }}>
                  Workers ({health.workers.active} active)
                </span>
              </div>
              {!health.workers.healthy && (
                <span style={{
                  fontSize: '0.75rem',
                  color: '#dc3545',
                  fontWeight: 'bold',
                }}>
                  ⚠️ Workers may be down!
                </span>
              )}
              <button
                onClick={handleRestartWorker}
                style={{
                  marginLeft: 'auto',
                  padding: '0.5rem 1rem',
                  background: '#ff9800',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f57c00'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#ff9800'}
                title="Signal worker to restart (active jobs will be cancelled, restarts within 10 seconds)"
              >
                🔄 Restart Worker
              </button>
            </div>
          )}

          {/* Queue Stats Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem',
          }}>
            <StatCard title="Waiting" value={stats.queue.waiting} color="#ffc107" />
            <StatCard title="Active" value={stats.queue.active} color="#28a745" />
            <StatCard title="Completed" value={stats.queue.completed} color="#17a2b8" />
            <StatCard title="Failed" value={stats.queue.failed} color="#dc3545" />
          </div>

          {/* Processing Stats */}
          <div style={{
            background: 'white',
            padding: '1.5rem',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            marginBottom: '2rem',
          }}>
            <h2 style={{ margin: '0 0 1rem', fontSize: '1.25rem', color: '#333' }}>
              Processing Statistics
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem' }}>
              <div>
                <p style={{ margin: 0, color: '#666', fontSize: '0.875rem' }}>
                  Average Processing Time
                </p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: '#333' }}>
                  {formatTime(stats.processing.avgProcessingTime)}
                </p>
              </div>
              <div>
                <p style={{ margin: 0, color: '#666', fontSize: '0.875rem' }}>
                  Success Rate
                </p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: '#28a745' }}>
                  {stats.processing.successRate}%
                </p>
              </div>
              <div>
                <p style={{ margin: 0, color: '#666', fontSize: '0.875rem' }}>
                  Total Processed
                </p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: '#333' }}>
                  {stats.processing.totalProcessed}
                </p>
              </div>
            </div>
          </div>

          {/* Active Jobs */}
          {stats.activeJobs.length > 0 && (
            <div style={{
              background: 'white',
              padding: '1.5rem',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            }}>
              <h2 style={{ margin: '0 0 1rem', fontSize: '1.25rem', color: '#333' }}>
                Active Jobs ({stats.activeJobs.length})
              </h2>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #ddd' }}>
                      <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', color: '#666' }}>
                        Job ID
                      </th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', color: '#666' }}>
                        Filename
                      </th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', color: '#666' }}>
                        Progress
                      </th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', color: '#666' }}>
                        Running Time
                      </th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', color: '#666' }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.activeJobs.map((job) => (
                      <tr key={job.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '0.75rem', fontSize: '0.875rem', fontFamily: 'monospace' }}>
                          {job.id.substring(0, 8)}...
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                          {job.data.fileName}
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{
                              flex: 1,
                              height: '8px',
                              background: '#eee',
                              borderRadius: '4px',
                              overflow: 'hidden',
                            }}>
                              <div style={{
                                height: '100%',
                                width: `${job.progress}%`,
                                background: '#28a745',
                                transition: 'width 0.3s',
                              }} />
                            </div>
                            <span>{job.progress}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                          {formatDuration(Date.now() - job.startedAt)}
                        </td>
                        <td style={{ padding: '0.75rem' }}>
                          <button
                            onClick={() => handleKillJob(job.id)}
                            style={{
                              padding: '0.375rem 0.75rem',
                              fontSize: '0.75rem',
                              background: '#dc3545',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#c82333'}
                            onMouseLeave={(e) => e.currentTarget.style.background = '#dc3545'}
                          >
                            Kill
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: number; color: string }) {
  return (
    <div style={{
      background: 'white',
      padding: '1.5rem',
      borderRadius: '8px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      borderLeft: `4px solid ${color}`,
    }}>
      <p style={{ margin: 0, color: '#666', fontSize: '0.875rem', fontWeight: '500' }}>
        {title}
      </p>
      <p style={{ margin: '0.5rem 0 0', fontSize: '2rem', fontWeight: 'bold', color: '#333' }}>
        {value}
      </p>
    </div>
  );
}
