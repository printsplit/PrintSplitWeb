import { processingQueue, repairQueue } from './queue';
import { ProcessingJobData, ProcessingJobResult, RepairJobData, RepairJobResult } from '../types/job';
import { getStorageClient } from '../storage/minio-client';
import { ManifoldSplitter } from '../processing/manifold-splitter';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import archiver from 'archiver';

const storage = getStorageClient();

// Worker concurrency (number of jobs processed simultaneously)
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '2');

console.log(`🚀 Starting STL Processing Worker (concurrency: ${CONCURRENCY})`);

// Check for restart signal every 10 seconds
const restartCheckInterval = setInterval(async () => {
  try {
    const restartSignal = await processingQueue.client.get('worker:restart');
    if (restartSignal) {
      console.log('⚠️  Restart signal received - shutting down worker...');
      await processingQueue.client.del('worker:restart');
      await processingQueue.close();
      process.exit(0); // Docker will restart the container
    }
  } catch (error) {
    console.error('Error checking restart signal:', error);
  }
}, 10000);

// Process jobs
processingQueue.process(CONCURRENCY, async (job) => {
  const data: ProcessingJobData = job.data;
  console.log(`📋 Processing job ${data.jobId}: ${data.fileName}`);

  const workDir = path.join(os.tmpdir(), `job-${data.jobId}`);
  const inputPath = path.join(workDir, data.fileName);
  const outputDir = path.join(workDir, 'parts');

  // Create a new ManifoldSplitter instance for each job to avoid WASM state corruption
  const splitter = new ManifoldSplitter();
  splitter.setJobId(data.jobId); // Set job ID for logging

  // Helper function to check if job is cancelled
  const checkCancellation = async () => {
    const latestJob = await processingQueue.getJob(data.jobId);
    if (latestJob?.data._cancelled) {
      console.log(`⚠️  Job ${data.jobId} was cancelled - exiting gracefully`);
      throw new Error('Job was cancelled');
    }
  };

  // Progress updater that sends both percent and message to Bull
  const updateProgress = async (percent: number, message: string) => {
    await job.progress({ percent, message });
    console.log(`[Job ${data.jobId}] ${percent.toFixed(1)}% - ${message}`);
  };

  try {
    // Create working directories
    await fs.mkdir(workDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });

    // Check for cancellation before download
    await checkCancellation();

    // Download input STL from MinIO
    console.log(`⬇️  Downloading ${data.fileId} from storage...`);
    await updateProgress(10, `Downloading file: ${data.fileName}`);
    await storage.downloadFile(data.fileId, inputPath, 'upload');

    // Check for cancellation after download
    await checkCancellation();

    // Update progress
    await updateProgress(20, 'Download complete, preparing to process');

    // Process STL using ManifoldSplitter
    console.log(`⚙️  Processing STL with manifold-3d...`);
    let result;

    try {
      result = await splitter.splitSTL({
        inputPath,
        outputDir,
        dimensions: data.dimensions,
        smartBoundaries: data.smartBoundaries,
        balancedCutting: data.balancedCutting,
        alignmentHoles: data.alignmentHoles,
        onProgress: updateProgress, // Pass progress callback
      });
    } catch (manifoldError: any) {
      // Handle Manifold-specific errors (WASM memory issues, etc.)
      const errorMessage = manifoldError.message || String(manifoldError);

      if (errorMessage.includes('offset is out of bounds') || errorMessage.includes('RangeError')) {
        throw new Error(
          'STL file is too large or complex for processing. ' +
          'Try reducing model complexity, splitting manually, or using smaller dimensions.'
        );
      }

      throw new Error(`Manifold processing error: ${errorMessage}`);
    }

    if (!result.success || !result.parts) {
      throw new Error(result.error || 'STL processing failed');
    }

    // Check for cancellation after processing
    await checkCancellation();

    await updateProgress(75, `Processing complete: ${result.parts?.length || 0} parts created`);

    // Upload parts to MinIO
    console.log(`⬆️  Uploading ${result.parts.length} parts to storage...`);
    const uploadedParts = [];

    for (let i = 0; i < result.parts.length; i++) {
      const part = result.parts[i];
      const objectName = `${data.jobId}/${part.name}`;
      await storage.uploadFile(part.path, objectName, 'result');

      // Use API download endpoint instead of direct MinIO URLs
      const url = `/api/download/${data.jobId}/${part.name}`;

      uploadedParts.push({
        name: part.name,
        url,
        section: part.section,
      });

      // Update progress every 5 parts
      if (i % 5 === 0 || i === result.parts.length - 1) {
        const uploadPercent = 75 + ((i + 1) / result.parts.length) * 15;
        await updateProgress(uploadPercent, `Uploading parts: ${i + 1}/${result.parts.length}`);
      }
    }

    await updateProgress(90, 'Creating ZIP archive');

    // Create ZIP archive of all parts
    console.log(`📦 Creating ZIP archive...`);
    const zipPath = path.join(workDir, `${data.jobId}.zip`);
    await createZipArchive(result.parts.map((p) => p.path), zipPath);

    // Upload ZIP to MinIO
    const zipObjectName = `${data.jobId}/all-parts.zip`;
    await storage.uploadFile(zipPath, zipObjectName, 'result');
    const downloadAllUrl = `/api/download/${data.jobId}/all`;

    await updateProgress(95, 'Finalizing');

    // Clean up local files
    await fs.rm(workDir, { recursive: true, force: true });

    // Return result
    const jobResult: ProcessingJobResult = {
      success: true,
      jobId: data.jobId,
      parts: uploadedParts,
      total_parts: result.total_parts,
      sections: result.sections,
      original_dimensions: result.original_dimensions,
      downloadAllUrl,
    };

    console.log(`✅ Job ${data.jobId} completed successfully!`);
    return jobResult;
  } catch (error) {
    console.error(`❌ Job ${data.jobId} failed:`, error);

    // Clean up on error
    try {
      await fs.rm(workDir, { recursive: true, force: true });
    } catch {}

    throw error;
  }
});

// Process repair jobs
repairQueue.process(CONCURRENCY, async (job) => {
  const data: RepairJobData = job.data;
  console.log(`🔧 Repair job ${data.jobId}: ${data.fileName}`);

  const workDir = path.join(os.tmpdir(), `repair-${data.jobId}`);
  const inputPath = path.join(workDir, data.fileName);
  const outputFileName = `repaired-${data.fileName}`;
  const outputPath = path.join(workDir, outputFileName);

  const splitter = new ManifoldSplitter();
  splitter.setJobId(data.jobId);

  const updateProgress = async (percent: number, message: string) => {
    await job.progress({ percent, message });
    console.log(`[Repair ${data.jobId}] ${percent.toFixed(1)}% - ${message}`);
  };

  try {
    await fs.mkdir(workDir, { recursive: true });

    await updateProgress(5, `Downloading file: ${data.fileName}`);
    await storage.downloadFile(data.fileId, inputPath, 'upload');

    await updateProgress(10, 'Starting repair');
    const result = await splitter.repairSTL({
      inputPath,
      outputPath,
      onProgress: updateProgress,
    });

    if (result.success && result.wasRepaired && result.outputPath) {
      await updateProgress(90, 'Uploading repaired file');
      const objectName = `${data.jobId}/${outputFileName}`;
      await storage.uploadFile(result.outputPath, objectName, 'result');

      const repairedFileUrl = `/api/download/${data.jobId}/${outputFileName}`;

      await fs.rm(workDir, { recursive: true, force: true });

      const jobResult: RepairJobResult = {
        success: true,
        jobId: data.jobId,
        repairedFileUrl,
        report: {
          wasRepaired: result.wasRepaired,
          originalStatus: result.report.originalStatus,
          repairedStatus: result.report.repairedStatus,
          originalVertices: result.report.originalVertices,
          repairedVertices: result.report.repairedVertices,
          originalTriangles: result.report.originalTriangles,
          repairedTriangles: result.report.repairedTriangles,
        },
      };

      console.log(`✅ Repair job ${data.jobId} completed!`);
      return jobResult;
    } else {
      await fs.rm(workDir, { recursive: true, force: true });

      const jobResult: RepairJobResult = {
        success: result.success,
        jobId: data.jobId,
        report: result.wasRepaired === false && result.success ? {
          wasRepaired: false,
          originalStatus: result.report.originalStatus,
          repairedStatus: result.report.repairedStatus,
          originalVertices: result.report.originalVertices,
          repairedVertices: result.report.repairedVertices,
          originalTriangles: result.report.originalTriangles,
          repairedTriangles: result.report.repairedTriangles,
        } : undefined,
        error: result.error,
      };

      return jobResult;
    }
  } catch (error) {
    console.error(`❌ Repair job ${data.jobId} failed:`, error);
    try {
      await fs.rm(workDir, { recursive: true, force: true });
    } catch {}
    throw error;
  }
});

// Helper function to create ZIP archive
async function createZipArchive(filePaths: string[], outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = require('fs').createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));

    archive.pipe(output);

    for (const filePath of filePaths) {
      const fileName = path.basename(filePath);
      archive.file(filePath, { name: fileName });
    }

    archive.finalize();
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('⏸️  Received SIGTERM, shutting down gracefully...');
  clearInterval(restartCheckInterval);
  await Promise.all([processingQueue.close(), repairQueue.close()]);
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('⏸️  Received SIGINT, shutting down gracefully...');
  clearInterval(restartCheckInterval);
  await Promise.all([processingQueue.close(), repairQueue.close()]);
  process.exit(0);
});

console.log('✅ Worker ready and waiting for jobs...');
