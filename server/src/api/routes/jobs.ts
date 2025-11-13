import express from 'express';
import { getJobStatus, cancelJob, getQueueStats } from '../../worker/queue';
import { JobStatus } from '../../types/job';

const router = express.Router();

/**
 * GET /api/jobs/:id
 * Get job status and results
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const job = await getJobStatus(id);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const state = await job.getState();
    const progressData = job.progress();

    // Extract progress percent and message
    let progressPercent = 0;
    let progressMessage: string | undefined = undefined;

    if (typeof progressData === 'object' && progressData !== null) {
      progressPercent = progressData.percent || 0;
      progressMessage = progressData.message;
    } else if (typeof progressData === 'number') {
      progressPercent = progressData;
    }

    const status: JobStatus = {
      id: job.id as string,
      state: state as any,
      progress: progressPercent,
      progressMessage,
      createdAt: job.timestamp,
      processedAt: job.processedOn || undefined,
      completedAt: job.finishedOn || undefined,
    };

    // Include result if completed
    if (state === 'completed' && job.returnvalue) {
      status.result = job.returnvalue;
    }

    // Include error if failed
    if (state === 'failed' && job.failedReason) {
      status.error = job.failedReason;
    }

    res.json(status);
  } catch (error: any) {
    console.error('Job status error:', error);
    res.status(500).json({ error: error.message || 'Failed to get job status' });
  }
});

/**
 * DELETE /api/jobs/:id
 * Cancel/delete a job
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const job = await getJobStatus(id);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const state = await job.getState();

    if (state === 'active') {
      // Set cancellation flag in job data
      const jobData = job.data;
      jobData._cancelled = true;
      await job.update(jobData);
      console.log(`⚠️  User set cancellation flag for active job ${id}`);
    } else {
      // For waiting/delayed jobs, just remove them
      await cancelJob(id);
      console.log(`⚠️  User removed ${state} job ${id}`);
    }

    res.json({
      success: true,
      message: 'Job cancellation initiated',
    });
  } catch (error: any) {
    console.error('Job deletion error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete job' });
  }
});

/**
 * GET /api/jobs
 * Get queue statistics
 */
router.get('/', async (req, res) => {
  try {
    const stats = await getQueueStats();
    res.json(stats);
  } catch (error: any) {
    console.error('Queue stats error:', error);
    res.status(500).json({ error: error.message || 'Failed to get queue stats' });
  }
});

/**
 * GET /api/jobs/:id/position
 * Get job's position in queue and estimated wait time
 */
router.get('/:id/position', async (req, res) => {
  try {
    const { id } = req.params;
    const job = await getJobStatus(id);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const state = await job.getState();

    // If job is not waiting, return state without position
    if (state !== 'waiting') {
      return res.json({
        id: job.id as string,
        state,
        position: null,
        totalWaiting: 0,
        estimatedWaitTime: 0,
      });
    }

    // Get all waiting jobs to calculate position
    const { processingQueue } = await import('../../worker/queue');
    const waitingJobs = await processingQueue.getWaiting(0, -1); // Get all waiting jobs
    const activeJobs = await processingQueue.getActive();

    // Find position of this job in waiting queue
    const position = waitingJobs.findIndex(j => j.id === id) + 1;
    const totalWaiting = waitingJobs.length;

    // Calculate estimated wait time
    // Get recent completed jobs to calculate average processing time
    const completedJobs = await processingQueue.getCompleted(0, 19); // Last 20 completed jobs

    let avgProcessingTime = 120; // Default: 2 minutes in seconds
    let totalProcessingTime = 0;
    let jobsWithTime = 0;

    for (const completedJob of completedJobs) {
      if (completedJob.finishedOn && completedJob.processedOn) {
        const processingTime = completedJob.finishedOn - completedJob.processedOn;
        totalProcessingTime += processingTime;
        jobsWithTime++;
      }
    }

    if (jobsWithTime > 0) {
      avgProcessingTime = Math.round(totalProcessingTime / jobsWithTime / 1000); // Convert to seconds
    }

    // Estimate wait time: (jobs ahead) * avg time per job
    // Also factor in currently active jobs finishing
    const jobsAhead = position - 1;
    const activeJobCount = activeJobs.length;
    const concurrency = activeJobCount > 0 ? activeJobCount : 1;

    // Rough estimate: jobs ahead / concurrency * avg time
    const estimatedWaitTime = Math.round((jobsAhead / concurrency) * avgProcessingTime);

    res.json({
      id: job.id as string,
      state,
      position,
      totalWaiting,
      estimatedWaitTime, // in seconds
      message: position === 1
        ? 'Your job is next in line'
        : `${jobsAhead} job(s) ahead of you`,
    });
  } catch (error: any) {
    console.error('Queue position error:', error);
    res.status(500).json({ error: error.message || 'Failed to get queue position' });
  }
});

export { router as jobsRouter };
