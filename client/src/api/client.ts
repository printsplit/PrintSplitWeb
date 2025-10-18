// API client for PrintSplit Web
// Replaces Electron IPC with REST API calls

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export interface ProcessingOptions {
  fileId: string;
  fileName: string;
  dimensions: { x: number; y: number; z: number };
  smartBoundaries?: boolean;
  balancedCutting?: boolean;
  alignmentHoles?: {
    enabled: boolean;
    diameter: number;
    depth: number;
    spacing?: 'sparse' | 'normal' | 'dense';
  };
}

export interface JobStatus {
  id: string;
  state: 'waiting' | 'active' | 'completed' | 'failed';
  progress: number;
  result?: {
    success: boolean;
    jobId: string;
    parts?: Array<{
      name: string;
      url: string;
      section: [number, number, number];
    }>;
    total_parts?: number;
    downloadAllUrl?: string;
  };
  error?: string;
}

class PrintSplitAPI {
  /**
   * Upload STL file
   */
  async uploadFile(file: File): Promise<{ fileId: string; fileName: string; size: number }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }

    return response.json();
  }

  /**
   * Start processing job
   */
  async processSTL(options: ProcessingOptions): Promise<{ jobId: string }> {
    const response = await fetch(`${API_BASE_URL}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Processing failed');
    }

    return response.json();
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<JobStatus> {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get job status');
    }

    return response.json();
  }

  /**
   * Poll for job completion
   */
  async waitForJob(
    jobId: string,
    onProgress?: (progress: number, status: string) => void
  ): Promise<JobStatus['result']> {
    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const status = await this.getJobStatus(jobId);

          if (onProgress) {
            onProgress(status.progress, status.state);
          }

          if (status.state === 'completed') {
            clearInterval(interval);
            resolve(status.result);
          } else if (status.state === 'failed') {
            clearInterval(interval);
            reject(new Error(status.error || 'Job failed'));
          }
        } catch (error) {
          clearInterval(interval);
          reject(error);
        }
      }, 1000); // Poll every second
    });
  }

  /**
   * Read file for preview (convert URL to ArrayBuffer)
   */
  async readFile(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Failed to read file');
    }

    return response.arrayBuffer();
  }

  /**
   * Download file
   */
  async downloadFile(jobId: string, partName: string): Promise<void> {
    const url = `${API_BASE_URL}/download/${jobId}/${partName}`;
    window.open(url, '_blank');
  }

  /**
   * Download all parts as ZIP
   */
  async downloadAll(jobId: string): Promise<void> {
    const url = `${API_BASE_URL}/download/${jobId}/all`;
    window.open(url, '_blank');
  }

  /**
   * Cancel/delete job
   */
  async cancelJob(jobId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to cancel job');
    }
  }
}

// Export singleton instance
export const api = new PrintSplitAPI();

// Mock Electron API for compatibility with existing components
export const electronAPI = {
  selectFile: async (): Promise<File | null> => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.stl';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        resolve(file || null);
      };
      input.click();
    });
  },

  selectOutputDirectory: async (): Promise<string | null> => {
    // Web version doesn't need output directory selection
    // Files are downloaded via browser
    return Promise.resolve('browser-download');
  },

  readFile: async (filePath: string): Promise<ArrayBuffer> => {
    return api.readFile(filePath);
  },

  processSTL: async (_options: any): Promise<any> => {
    // This will be handled differently in the web version
    // Upload file first, then process
    throw new Error('Use api.uploadFile() and api.processSTL() instead');
  },
};

// Make it available globally for existing components
declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}

window.electronAPI = electronAPI;
