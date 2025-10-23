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
    filename: string;
    dimensions: any;
  };
}

interface AdminStats {
  queue: QueueStats;
  processing: ProcessingStats;
  activeJobs: ActiveJob[];
  timestamp: number;
}

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { isAuthenticated, token, logout } = useAuth();

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/admin/login');
    }
  }, [isAuthenticated]);

  // Fetch stats
  const fetchStats = async () => {
    if (!token) return;

    try {
      const response = await fetch('/api/admin/stats', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          logout();
          navigate('/admin/login');
          return;
        }
        throw new Error('Failed to fetch stats');
      }

      const data = await response.json();
      setStats(data);
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
                    </tr>
                  </thead>
                  <tbody>
                    {stats.activeJobs.map((job) => (
                      <tr key={job.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '0.75rem', fontSize: '0.875rem', fontFamily: 'monospace' }}>
                          {job.id.substring(0, 8)}...
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                          {job.data.filename}
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
