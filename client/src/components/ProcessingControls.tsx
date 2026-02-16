import React, { useState, useEffect } from 'react';
import { QueueStatus } from './QueueStatus';
import { MeshValidation } from '../utils/meshValidator';

interface ProcessingState {
  isProcessing: boolean;
  progress: number;
  status: string;
}

interface ProcessingResult {
  success: boolean;
  parts?: Array<{
    name: string;
    url: string;
    section: [number, number, number];
  }>;
  total_parts?: number;
  sections?: {
    x: number;
    y: number;
    z: number;
  };
  error?: string;
}

interface ProcessingControlsProps {
  onProcess: () => void;
  processing: ProcessingState;
  canProcess: boolean;
  lastResult: ProcessingResult | null;
  jobId?: string;
  needsRepair?: boolean;
  meshValidation?: MeshValidation | null;
}

const ProcessingControls: React.FC<ProcessingControlsProps> = ({
  onProcess,
  processing,
  canProcess,
  lastResult,
  jobId,
  needsRepair,
  meshValidation,
}) => {
  const [jobState, setJobState] = useState<string | null>(null);

  // Poll for job state while processing
  useEffect(() => {
    if (!jobId || !processing.isProcessing) {
      setJobState(null);
      return;
    }

    const fetchJobState = async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        if (response.ok) {
          const data = await response.json();
          setJobState(data.state);
        }
      } catch (error) {
        console.error('Failed to fetch job state:', error);
      }
    };

    // Fetch immediately
    fetchJobState();

    // Then poll every 2 seconds
    const interval = setInterval(fetchJobState, 2000);
    return () => clearInterval(interval);
  }, [jobId, processing.isProcessing]);

  const handleDownloadAll = () => {
    if (jobId) {
      const url = `${import.meta.env.VITE_API_URL || '/api'}/download/${jobId}/all`;
      window.open(url, '_blank');
    }
  };

  const handleDownloadPart = (partName: string) => {
    if (jobId) {
      const url = `${import.meta.env.VITE_API_URL || '/api'}/download/${jobId}/${partName}`;
      window.open(url, '_blank');
    }
  };

  const handleCancelJob = async () => {
    if (!jobId) return;

    if (!confirm('Are you sure you want to cancel this job?')) {
      return;
    }

    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        window.location.reload(); // Reload to reset state
      }
    } catch (error) {
      console.error('Failed to cancel job:', error);
    }
  };

  const buttonLabel = processing.isProcessing
    ? 'Processing...'
    : needsRepair
      ? 'Repair & Split STL File'
      : 'Split STL File';

  return (
    <div className="panel-section">
      <h3>Processing</h3>

      {needsRepair && meshValidation && !processing.isProcessing && (
        <div style={{
          marginBottom: '10px',
          padding: '8px 10px',
          backgroundColor: 'rgba(255, 193, 7, 0.12)',
          border: '1px solid rgba(255, 193, 7, 0.3)',
          borderRadius: '6px',
          fontSize: '0.8rem',
          color: '#ffc107',
        }}>
          Mesh has {meshValidation.boundaryEdges} open edge{meshValidation.boundaryEdges !== 1 ? 's' : ''} (holes). Repair will be applied automatically before splitting.
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          className="process-button"
          onClick={onProcess}
          disabled={!canProcess}
          style={{ flex: 1 }}
        >
          {buttonLabel}
        </button>

        {processing.isProcessing && jobId && (
          <button
            onClick={handleCancelJob}
            style={{
              padding: '12px 16px',
              background: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
            }}
          >
            Cancel
          </button>
        )}
      </div>

      {processing.isProcessing && (
        <div style={{ marginTop: '12px' }}>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${processing.progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="status-text">
        {processing.status}
      </div>

      {/* Show queue position if job is waiting */}
      {processing.isProcessing && jobId && (
        <QueueStatus jobId={jobId} jobState={jobState} />
      )}

      {lastResult && lastResult.success && (
        <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#2d4a2d', borderRadius: '6px', border: '1px solid #6b9bd6' }}>
          <div style={{ fontWeight: 'bold', color: '#6b9bd6', marginBottom: '8px' }}>
            Processing Complete!
          </div>
          <div style={{ fontSize: '0.9rem', color: '#ccc', marginBottom: '8px' }}>
            Created {lastResult.total_parts} part(s)
          </div>
          {lastResult.sections && (
            <div style={{ fontSize: '0.8rem', color: '#999', marginBottom: '12px' }}>
              Grid: {lastResult.sections.x} × {lastResult.sections.y} × {lastResult.sections.z}
            </div>
          )}

          <button
            className="process-button"
            onClick={handleDownloadAll}
            style={{ marginBottom: '12px', width: '100%' }}
          >
            Download All Parts (ZIP)
          </button>

          <div style={{ fontSize: '0.85rem', color: '#ccc', marginBottom: '6px', fontWeight: 'bold' }}>
            Individual Parts:
          </div>
          <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
            {lastResult.parts?.map((part, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 8px',
                  marginBottom: '4px',
                  backgroundColor: 'rgba(0,0,0,0.3)',
                  borderRadius: '4px',
                  fontSize: '0.8rem'
                }}
              >
                <span style={{ color: '#ccc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {part.name}
                </span>
                <button
                  onClick={() => handleDownloadPart(part.name)}
                  style={{
                    marginLeft: '8px',
                    padding: '4px 12px',
                    fontSize: '0.75rem',
                    backgroundColor: '#5a8bc4',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#4a7ab3'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#5a8bc4'}
                >
                  Download
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {lastResult && !lastResult.success && (
        <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#4a2d2d', borderRadius: '6px', border: '1px solid #f44336' }}>
          <div style={{ fontWeight: 'bold', color: '#f44336', marginBottom: '8px' }}>
            Processing Failed
          </div>
          <div style={{ fontSize: '0.8rem', color: '#ccc' }}>
            {lastResult.error}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProcessingControls;
