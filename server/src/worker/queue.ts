import Bull from 'bull';
import { ProcessingJobData, ProcessingJobResult, RepairJobData, RepairJobResult } from '../types/job';

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
  settings: {
    lockDuration: 600000, // 10 minutes - allow long processing for large STL files
    lockRenewTime: 30000, // Renew lock every 30 seconds to keep job alive
    stalledInterval: 60000, // Check for stalled jobs every 60 seconds
    maxStalledCount: 2, // Allow job to stall twice before giving up
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

// Create repair queue (shorter lock settings since repair is fast)
export const repairQueue = new Bull<RepairJobData>('stl-repair', REDIS_URL, {
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 48 * 3600,
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600,
    },
  },
  settings: {
    lockDuration: 120000,    // 2 minutes (repair is fast)
    lockRenewTime: 15000,
    stalledInterval: 30000,
    maxStalledCount: 2,
  },
});

repairQueue.on('error', (error) => {
  console.error('Repair queue error:', error);
});

repairQueue.on('failed', (job, error) => {
  console.error(`Repair job ${job.id} failed:`, error);
});

repairQueue.on('completed', (job, result: RepairJobResult) => {
  console.log(`Repair job ${job.id} completed. Repaired: ${result.report?.wasRepaired}`);
});

export async function addRepairJob(data: RepairJobData): Promise<string> {
  const job = await repairQueue.add(data, {
    jobId: data.jobId,
  });
  return job.id as string;
}

export async function getRepairJobStatus(jobId: string): Promise<Bull.Job<RepairJobData> | null> {
  return await repairQueue.getJob(jobId);
}
