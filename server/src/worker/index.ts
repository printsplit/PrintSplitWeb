import { processingQueue } from './queue';
import { ProcessingJobData, ProcessingJobResult } from '../types/job';
import { getStorageClient } from '../storage/minio-client';
import { ManifoldSplitter } from '../processing/manifold-splitter';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import archiver from 'archiver';

const storage = getStorageClient();
const splitter = new ManifoldSplitter();

// Worker concurrency (number of jobs processed simultaneously)
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '2');

console.log(`🚀 Starting STL Processing Worker (concurrency: ${CONCURRENCY})`);

// Process jobs
processingQueue.process(CONCURRENCY, async (job) => {
  const data: ProcessingJobData = job.data;
  console.log(`📋 Processing job ${data.jobId}: ${data.fileName}`);

  const workDir = path.join(os.tmpdir(), `job-${data.jobId}`);
  const inputPath = path.join(workDir, data.fileName);
  const outputDir = path.join(workDir, 'parts');

  try {
    // Create working directories
    await fs.mkdir(workDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });

    // Download input STL from MinIO
    console.log(`⬇️  Downloading ${data.fileId} from storage...`);
    await storage.downloadFile(data.fileId, inputPath, 'upload');

    // Update progress
    await job.progress(25);

    // Process STL using existing ManifoldSplitter
    console.log(`⚙️  Processing STL with manifold-3d...`);
    const result = await splitter.splitSTL({
      inputPath,
      outputDir,
      dimensions: data.dimensions,
      smartBoundaries: data.smartBoundaries,
      balancedCutting: data.balancedCutting,
      alignmentHoles: data.alignmentHoles,
    });

    if (!result.success || !result.parts) {
      throw new Error(result.error || 'STL processing failed');
    }

    await job.progress(75);

    // Upload parts to MinIO
    console.log(`⬆️  Uploading ${result.parts.length} parts to storage...`);
    const uploadedParts = [];

    for (const part of result.parts) {
      const objectName = `${data.jobId}/${part.name}`;
      await storage.uploadFile(part.path, objectName, 'result');

      // Use API download endpoint instead of direct MinIO URLs
      const url = `/api/download/${data.jobId}/${part.name}`;

      uploadedParts.push({
        name: part.name,
        url,
        section: part.section,
      });
    }

    await job.progress(90);

    // Create ZIP archive of all parts
    console.log(`📦 Creating ZIP archive...`);
    const zipPath = path.join(workDir, `${data.jobId}.zip`);
    await createZipArchive(result.parts.map((p) => p.path), zipPath);

    // Upload ZIP to MinIO
    const zipObjectName = `${data.jobId}/all-parts.zip`;
    await storage.uploadFile(zipPath, zipObjectName, 'result');
    const downloadAllUrl = `/api/download/${data.jobId}/all`;

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
  await processingQueue.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('⏸️  Received SIGINT, shutting down gracefully...');
  await processingQueue.close();
  process.exit(0);
});

console.log('✅ Worker ready and waiting for jobs...');
