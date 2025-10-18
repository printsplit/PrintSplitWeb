import { ManifoldSplitter } from './manifold-splitter';

export interface ProcessingOptions {
  inputPath: string;
  outputDir: string;
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

export interface ProcessingResult {
  success: boolean;
  parts?: Array<{
    name: string;
    path: string;
    section: [number, number, number];
  }>;
  total_parts?: number;
  sections?: {
    x: number;
    y: number;
    z: number;
  };
  original_dimensions?: any;
  error?: string;
}

export class ProcessingService {
  private manifoldSplitter: ManifoldSplitter;

  constructor() {
    this.manifoldSplitter = new ManifoldSplitter();
  }

  public async processSTL(options: ProcessingOptions): Promise<ProcessingResult> {
    console.log('Processing STL with Manifold-3D...');

    try {
      // Use manifold splitter
      const result = await this.manifoldSplitter.splitSTL(options);
      console.log('Manifold processing completed:', result.success ? '✅ Success' : '❌ Failed');

      return result;
    } catch (error) {
      console.error('Manifold processing error:', error);
      return {
        success: false,
        error: `Manifold processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  public async getProcessorInfo(): Promise<{
    manifold: { available: boolean; path: string | null; version?: string };
  }> {
    const manifoldInfo = await this.getManifoldInfo();

    return {
      manifold: manifoldInfo
    };
  }

  private async getManifoldInfo(): Promise<{ available: boolean; path: string | null; version?: string }> {
    try {
      // Test if manifold-3d can be imported and initialized using dynamic import
      const importManifold = new Function('specifier', 'return import(specifier)');
      const manifoldModule = await importManifold('manifold-3d');
      const ManifoldModule = manifoldModule.default;
      const manifoldInstance = await ManifoldModule();
      manifoldInstance.setup();

      // Try to create a simple test manifold to verify it works
      const testCube = manifoldInstance.Manifold.cube([1, 1, 1]);
      if (testCube && testCube.status() === 'NoError') {
        return {
          available: true,
          path: 'manifold-3d (Node.js native)',
          version: 'latest'
        };
      } else {
        return {
          available: false,
          path: null
        };
      }
    } catch (error) {
      console.log('Manifold-3D not available:', error);
      return {
        available: false,
        path: null
      };
    }
  }
}