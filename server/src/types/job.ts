export interface ProcessingJobData {
  jobId: string;
  fileId: string;
  fileName: string;
  dimensions: {
    x: number;
    y: number;
    z: number;
  };
  smartBoundaries?: boolean;
  balancedCutting?: boolean;
  alignmentHoles?: {
    enabled: boolean;
    diameter: number;
    depth: number;
    spacing?: 'sparse' | 'normal' | 'dense';
  };
}

export interface ProcessingJobResult {
  success: boolean;
  jobId: string;
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
  original_dimensions?: {
    x: number;
    y: number;
    z: number;
  };
  error?: string;
  downloadAllUrl?: string;
}

export type JobState = 'waiting' | 'active' | 'completed' | 'failed';

export interface JobStatus {
  id: string;
  state: JobState;
  progress: number;
  result?: ProcessingJobResult;
  error?: string;
  createdAt: number;
  processedAt?: number;
  completedAt?: number;
}
