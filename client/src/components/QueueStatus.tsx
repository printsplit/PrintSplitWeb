import { useEffect, useState } from 'react';

interface QueuePosition {
  id: string;
  state: string;
  position: number | null;
  totalWaiting: number;
  estimatedWaitTime: number;
  message?: string;
}

interface QueueStatusProps {
  jobId: string | null;
  jobState: string | null;
}

export function QueueStatus({ jobId, jobState }: QueueStatusProps) {
  const [queueInfo, setQueueInfo] = useState<QueuePosition | null>(null);

  useEffect(() => {
    if (!jobId || jobState !== 'waiting') {
      setQueueInfo(null);
      return;
    }

    // Fetch queue position immediately
    fetchQueuePosition();

    // Then poll every 5 seconds
    const interval = setInterval(fetchQueuePosition, 5000);

    return () => clearInterval(interval);
  }, [jobId, jobState]);

  const fetchQueuePosition = async () => {
    if (!jobId) return;

    try {
      const response = await fetch(`/api/jobs/${jobId}/position`);
      if (response.ok) {
        const data = await response.json();
        setQueueInfo(data);
      }
    } catch (error) {
      console.error('Failed to fetch queue position:', error);
    }
  };

  const formatWaitTime = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    }
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  };

  // Don't show anything if job is not waiting
  if (!jobId || jobState !== 'waiting' || !queueInfo) {
    return null;
  }

  // Job is waiting but position info not available yet
  if (queueInfo.position === null) {
    return null;
  }

  return (
    <div style={{
      marginTop: '1rem',
      padding: '1rem',
      background: '#fff3cd',
      border: '1px solid #ffc107',
      borderRadius: '4px',
      color: '#856404',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom: '0.5rem',
      }}>
        <div style={{
          width: '20px',
          height: '20px',
          border: '3px solid #856404',
          borderTop: '3px solid transparent',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <strong>Waiting in queue...</strong>
      </div>

      <div style={{ fontSize: '0.875rem', lineHeight: '1.5' }}>
        <p style={{ margin: '0.25rem 0' }}>
          <strong>Position:</strong> {queueInfo.position} of {queueInfo.totalWaiting}
        </p>
        {queueInfo.estimatedWaitTime > 0 && (
          <p style={{ margin: '0.25rem 0' }}>
            <strong>Estimated wait:</strong> ~{formatWaitTime(queueInfo.estimatedWaitTime)}
          </p>
        )}
        {queueInfo.message && (
          <p style={{ margin: '0.5rem 0 0', fontStyle: 'italic' }}>
            {queueInfo.message}
          </p>
        )}
      </div>

      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}
