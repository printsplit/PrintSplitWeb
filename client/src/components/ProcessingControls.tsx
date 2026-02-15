import React, { useState, useEffect } from 'react';
import { QueueStatus } from './QueueStatus';

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

interface RepairReport {
  wasRepaired: boolean;
  originalStatus: string;
  repairedStatus: string;
  originalVertices: number;
  repairedVertices: number;
  originalTriangles: number;
  repairedTriangles: number;
}

interface RepairResult {
  success: boolean;
  wasRepaired?: boolean;
  report?: RepairReport;
  repairedFileUrl?: string;
  error?: string;
}

interface ProcessingControlsProps {
  onProcess: () => void;
  processing: ProcessingState;
  canProcess: boolean;
  lastResult: ProcessingResult | null;
  jobId?: string;
  onRepair?: () => void;
  canRepair?: boolean;
  repairState?: ProcessingState;
  repairResult?: RepairResult | null;
  repairJobId?: string;
}

const ProcessingControls: React.FC<ProcessingControlsProps> = ({
  onProcess,
  processing,
  canProcess,
  lastResult,
  jobId,
  onRepair,
  canRepair,
  repairState,
  repairResult,
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

  const handleDownloadRepaired = () => {
    if (repairResult?.repairedFileUrl) {
      const url = `${import.meta.env.VITE_API_URL || ''}${repairResult.repairedFileUrl}`;
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

  return (
    <div className="panel-section">
      <h3>Processing</h3>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          className="process-button"
          onClick={onProcess}
          disabled={!canProcess}
          style={{ flex: 1 }}
        >
          {processing.isProcessing ? 'Processing...' : 'Split STL File'}
        </button>

        {onRepair && (
          <button
            className="process-button"
            onClick={onRepair}
            disabled={!canRepair}
            style={{
              flex: 1,
              background: canRepair ? '#5a7c5a' : '#3a3a3a',
            }}
          >
            {repairState?.isProcessing ? 'Repairing...' : 'Repair Mesh'}
          </button>
        )}

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

      {repairState?.isProcessing && (
        <div style={{ marginTop: '12px' }}>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${repairState.progress}%`, backgroundColor: '#5a7c5a' }}
            />
          </div>
        </div>
      )}

      <div className="status-text">
        {repairState?.isProcessing || repairState?.status ? repairState.status : processing.status}
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

      {repairResult && repairResult.success && (
        <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#2d4a2d', borderRadius: '6px', border: '1px solid #5a7c5a' }}>
          <div style={{ fontWeight: 'bold', color: '#7cb87c', marginBottom: '8px' }}>
            {repairResult.wasRepaired ? 'Mesh Repaired!' : 'Mesh Already Valid'}
          </div>
          {repairResult.report && (
            <div style={{ fontSize: '0.8rem', color: '#ccc', marginBottom: '8px' }}>
              <div>Status: {repairResult.report.originalStatus} → {repairResult.report.repairedStatus}</div>
              <div>Vertices: {repairResult.report.originalVertices.toLocaleString()} → {repairResult.report.repairedVertices.toLocaleString()}</div>
              <div>Triangles: {repairResult.report.originalTriangles.toLocaleString()} → {repairResult.report.repairedTriangles.toLocaleString()}</div>
            </div>
          )}
          {repairResult.wasRepaired && repairResult.repairedFileUrl && (
            <button
              className="process-button"
              onClick={handleDownloadRepaired}
              style={{ width: '100%', background: '#5a7c5a' }}
            >
              Download Repaired STL
            </button>
          )}
        </div>
      )}

      {repairResult && !repairResult.success && (
        <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#4a2d2d', borderRadius: '6px', border: '1px solid #f44336' }}>
          <div style={{ fontWeight: 'bold', color: '#f44336', marginBottom: '8px' }}>
            Repair Failed
          </div>
          <div style={{ fontSize: '0.8rem', color: '#ccc' }}>
            {repairResult.error}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProcessingControls;