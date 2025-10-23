import { useState, useEffect } from 'react';
import FileUpload from '../components/FileUpload';
import DimensionControls from '../components/DimensionControls';
import STLPreview from '../components/STLPreview';
import ProcessingControls from '../components/ProcessingControls';
import { api } from '../api/client';
import '../App.css';

interface Dimensions {
  x: number;
  y: number;
  z: number;
}

interface AlignmentHoles {
  enabled: boolean;
  diameter: number;
  depth: number;
  spacing: 'sparse' | 'normal' | 'dense';
}

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

export function HomePage() {
  // Load settings from localStorage with defaults
  const loadSettings = () => {
    try {
      const savedSettings = localStorage.getItem('printsplit-settings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        return {
          dimensions: parsed.dimensions || { x: 200, y: 200, z: 200 },
          smartBoundaries: parsed.smartBoundaries !== undefined ? parsed.smartBoundaries : true,
          balancedCutting: parsed.balancedCutting !== undefined ? parsed.balancedCutting : true,
          alignmentHoles: {
            enabled: parsed.alignmentHoles?.enabled || false,
            diameter: parsed.alignmentHoles?.diameter || 1.8,
            depth: parsed.alignmentHoles?.depth || 3,
            spacing: parsed.alignmentHoles?.spacing || 'normal'
          }
        };
      }
    } catch (error) {
      console.warn('Failed to load settings from localStorage:', error);
    }

    // Return defaults if loading fails
    return {
      dimensions: { x: 200, y: 200, z: 200 },
      smartBoundaries: true,
      balancedCutting: true,
      alignmentHoles: { enabled: false, diameter: 1.8, depth: 3, spacing: 'normal' }
    };
  };

  const settings = loadSettings();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dimensions, setDimensions] = useState<Dimensions>(settings.dimensions);
  const [smartBoundaries, setSmartBoundaries] = useState<boolean>(settings.smartBoundaries);
  const [balancedCutting, setBalancedCutting] = useState<boolean>(settings.balancedCutting);
  const [alignmentHoles, setAlignmentHoles] = useState<AlignmentHoles>(settings.alignmentHoles);
  const [processing, setProcessing] = useState<ProcessingState>({
    isProcessing: false,
    progress: 0,
    status: 'Ready'
  });
  const [lastResult, setLastResult] = useState<ProcessingResult | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // Save settings to localStorage whenever they change
  const saveSettings = () => {
    try {
      const settingsToSave = {
        dimensions,
        smartBoundaries,
        balancedCutting,
        alignmentHoles
      };
      localStorage.setItem('printsplit-settings', JSON.stringify(settingsToSave));
    } catch (error) {
      console.warn('Failed to save settings to localStorage:', error);
    }
  };

  // Save settings whenever relevant state changes
  useEffect(() => {
    saveSettings();
  }, [dimensions, smartBoundaries, balancedCutting, alignmentHoles]);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
  };

  const handleDimensionChange = (newDimensions: Dimensions) => {
    setDimensions(newDimensions);
  };

  const handleSmartBoundariesChange = (enabled: boolean) => {
    setSmartBoundaries(enabled);
  };

  const handleBalancedCuttingChange = (enabled: boolean) => {
    setBalancedCutting(enabled);
  };

  const handleAlignmentHolesChange = (settings: AlignmentHoles) => {
    setAlignmentHoles(settings);
  };

  const handleProcess = async () => {
    if (!selectedFile) {
      alert('Please select an STL file');
      return;
    }

    setProcessing({ isProcessing: true, progress: 0, status: 'Uploading file...' });
    setLastResult(null);

    try {
      // Step 1: Upload the file
      setProcessing(prev => ({ ...prev, progress: 10, status: 'Uploading STL file...' }));
      const { fileId, fileName } = await api.uploadFile(selectedFile);

      // Step 2: Start processing
      setProcessing(prev => ({ ...prev, progress: 20, status: 'Starting processing...' }));
      const { jobId } = await api.processSTL({
        fileId,
        fileName,
        dimensions,
        smartBoundaries,
        balancedCutting,
        alignmentHoles,
      });

      // Save jobId for download links
      setCurrentJobId(jobId);

      // Step 3: Wait for job completion with progress updates
      setProcessing(prev => ({ ...prev, progress: 30, status: 'Processing...' }));
      const result = await api.waitForJob(jobId, (progress, status) => {
        // Map progress from 30-100
        const mappedProgress = 30 + (progress * 0.7);
        setProcessing({ isProcessing: true, progress: mappedProgress, status: `Processing: ${status}` });
      });

      // Step 4: Set the result
      if (result) {
        setLastResult({
          success: true,
          parts: result.parts,
          total_parts: result.total_parts,
        });

        setProcessing({
          isProcessing: false,
          progress: 100,
          status: `Complete! Created ${result.total_parts} part(s)`
        });
      } else {
        setProcessing({
          isProcessing: false,
          progress: 0,
          status: 'Error: No result returned'
        });
      }
    } catch (error) {
      console.error('Processing error:', error);
      setProcessing({
        isProcessing: false,
        progress: 0,
        status: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  };

  return (
    <div className="app">
      <main className="app-main">
        <div className="left-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, color: '#6b9bd6', fontSize: '1.5rem' }}>PrintSplit</h2>
            <a
              href="/core/admin/login"
              style={{
                fontSize: '0.75rem',
                color: '#888',
                textDecoration: 'none',
                padding: '4px 8px',
                border: '1px solid #444',
                borderRadius: '3px',
              }}
              title="Admin Dashboard"
            >
              Admin
            </a>
          </div>
          <FileUpload
            onFileSelect={handleFileSelect}
            selectedFile={selectedFile}
          />

          <DimensionControls
            dimensions={dimensions}
            onChange={handleDimensionChange}
            smartBoundaries={smartBoundaries}
            onSmartBoundariesChange={handleSmartBoundariesChange}
            balancedCutting={balancedCutting}
            onBalancedCuttingChange={handleBalancedCuttingChange}
            alignmentHoles={alignmentHoles}
            onAlignmentHolesChange={handleAlignmentHolesChange}
          />

          <ProcessingControls
            onProcess={handleProcess}
            processing={processing}
            canProcess={!!selectedFile && !processing.isProcessing}
            lastResult={lastResult}
            jobId={currentJobId || undefined}
          />
        </div>

        <div className="right-panel">
          <STLPreview
            file={selectedFile}
            dimensions={dimensions}
            processingResult={lastResult}
          />
        </div>
      </main>
    </div>
  );
}
