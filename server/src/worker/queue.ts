import Bull from 'bull';
import { ProcessingJobData, ProcessingJobResult } from '../types/job';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Create processing queue
export const processingQueue = new Bull<ProcessingJobData>('stl-processing', REDIS_URL, {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 48 * 3600, // Keep completed jobs for 48 hours
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  },
});

// Queue event listeners
processingQueue.on('error', (error) => {
  console.error('Queue error:', error);
});

processingQueue.on('failed', (job, error) => {
  console.error(`Job ${job.id} failed:`, error);
});

processingQueue.on('completed', (job, result: ProcessingJobResult) => {
  console.log(`Job ${job.id} completed successfully. Parts: ${result.total_parts}`);
});

export async function addProcessingJob(data: ProcessingJobData): Promise<string> {
  const job = await processingQueue.add(data, {
    jobId: data.jobId,
  });

  return job.id as string;
}

export async function getJobStatus(jobId: string): Promise<Bull.Job<ProcessingJobData> | null> {
  return await processingQueue.getJob(jobId);
}

export async function cancelJob(jobId: string): Promise<void> {
  const job = await processingQueue.getJob(jobId);
  if (job) {
    await job.remove();
  }
}

export async function getQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    processingQueue.getWaitingCount(),
    processingQueue.getActiveCount(),
    processingQueue.getCompletedCount(),
    processingQueue.getFailedCount(),
  ]);

  return { waiting, active, completed, failed };
}
