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
    const progress = job.progress();

    const status: JobStatus = {
      id: job.id as string,
      state: state as any,
      progress: typeof progress === 'number' ? progress : 0,
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
    await cancelJob(id);

    res.json({
      success: true,
      message: 'Job cancelled/deleted',
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

export { router as jobsRouter };
