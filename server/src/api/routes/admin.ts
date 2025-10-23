import express from 'express';
import { authenticateAdmin, adminLogin } from '../middleware/auth';
import { processingQueue } from '../../worker/queue';
import { JobStatus } from '../../types/job';

const router = express.Router();

/**
 * POST /api/admin/login
 * Admin login endpoint
 */
router.post('/login', adminLogin);

/**
 * GET /api/admin/stats
 * Get comprehensive queue and processing statistics
 */
router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    // Get basic queue counts
    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      processingQueue.getWaitingCount(),
      processingQueue.getActiveCount(),
      processingQueue.getCompletedCount(),
      processingQueue.getFailedCount(),
      processingQueue.getDelayedCount(),
      processingQueue.getPausedCount(),
    ]);

    // Get jobs for processing stats calculation
    const [completedJobs, failedJobs, activeJobs] = await Promise.all([
      processingQueue.getCompleted(0, 99), // Get last 100 completed
      processingQueue.getFailed(0, 99),    // Get last 100 failed
      processingQueue.getActive(0, 49),    // Get current active jobs
    ]);

    // Calculate average processing time from completed jobs
    let avgProcessingTime = 0;
    let totalProcessingTime = 0;
    let jobsWithTime = 0;

    for (const job of completedJobs) {
      if (job.finishedOn && job.processedOn) {
        const processingTime = job.finishedOn - job.processedOn;
        totalProcessingTime += processingTime;
        jobsWithTime++;
      }
    }

    if (jobsWithTime > 0) {
      avgProcessingTime = Math.round(totalProcessingTime / jobsWithTime / 1000); // Convert to seconds
    }

    // Calculate success rate
    const totalProcessed = completed + failed;
    const successRate = totalProcessed > 0
      ? Math.round((completed / totalProcessed) * 100)
      : 100;

    // Get current active job details
    const activeJobDetails = activeJobs.map(job => ({
      id: job.id,
      progress: job.progress(),
      startedAt: job.processedOn,
      data: {
        fileName: job.data.fileName,
        dimensions: job.data.dimensions,
      }
    }));

    res.json({
      queue: {
        waiting,
        active,
        completed,
        failed,
        delayed,
        paused,
        total: waiting + active + completed + failed + delayed + paused,
      },
      processing: {
        avgProcessingTime, // in seconds
        successRate,       // percentage
        totalProcessed,
      },
      activeJobs: activeJobDetails,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: error.message || 'Failed to get admin stats' });
  }
});

/**
 * GET /api/admin/jobs
 * Get detailed list of jobs with filtering
 */
router.get('/jobs', authenticateAdmin, async (req, res) => {
  try {
    const { state, limit = '50' } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10), 100);

    let jobs: any[] = [];

    switch (state) {
      case 'waiting':
        jobs = await processingQueue.getWaiting(0, limitNum - 1);
        break;
      case 'active':
        jobs = await processingQueue.getActive(0, limitNum - 1);
        break;
      case 'completed':
        jobs = await processingQueue.getCompleted(0, limitNum - 1);
        break;
      case 'failed':
        jobs = await processingQueue.getFailed(0, limitNum - 1);
        break;
      case 'delayed':
        jobs = await processingQueue.getDelayed(0, limitNum - 1);
        break;
      default:
        // Get a mix of all states
        const [waiting, active, completed, failed] = await Promise.all([
          processingQueue.getWaiting(0, 9),
          processingQueue.getActive(0, 9),
          processingQueue.getCompleted(0, 19),
          processingQueue.getFailed(0, 9),
        ]);
        jobs = [...waiting, ...active, ...completed, ...failed];
    }

    // Format job data
    const formattedJobs = await Promise.all(
      jobs.map(async (job) => {
        const jobState = await job.getState();
        return {
          id: job.id,
          state: jobState,
          progress: job.progress(),
          data: {
            fileName: job.data.fileName,
            dimensions: job.data.dimensions,
            smartBoundaries: job.data.smartBoundaries,
          },
          createdAt: job.timestamp,
          processedAt: job.processedOn || null,
          completedAt: job.finishedOn || null,
          failedReason: job.failedReason || null,
          attempts: job.attemptsMade,
        };
      })
    );

    res.json({
      jobs: formattedJobs,
      count: formattedJobs.length,
    });
  } catch (error: any) {
    console.error('Admin jobs list error:', error);
    res.status(500).json({ error: error.message || 'Failed to get jobs list' });
  }
});

/**
 * POST /api/admin/jobs/:id/cancel
 * Force cancel a job (admin only)
 */
router.post('/jobs/:id/cancel', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const job = await processingQueue.getJob(id);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    await job.remove();

    res.json({
      success: true,
      message: `Job ${id} cancelled successfully`,
    });
  } catch (error: any) {
    console.error('Admin job cancel error:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel job' });
  }
});

/**
 * GET /api/admin/queue-details
 * Get detailed queue information for monitoring
 */
router.get('/queue-details', authenticateAdmin, async (req, res) => {
  try {
    const [waitingJobs, activeJobs] = await Promise.all([
      processingQueue.getWaiting(0, 49),
      processingQueue.getActive(0, 49),
    ]);

    const waitingDetails = waitingJobs.map(job => ({
      id: job.id,
      fileName: job.data.fileName,
      createdAt: job.timestamp,
      waitTime: Date.now() - job.timestamp, // milliseconds
    }));

    const activeDetails = activeJobs.map(job => ({
      id: job.id,
      fileName: job.data.fileName,
      progress: job.progress(),
      startedAt: job.processedOn,
      runningTime: job.processedOn ? Date.now() - job.processedOn : 0,
    }));

    res.json({
      waiting: waitingDetails,
      active: activeDetails,
    });
  } catch (error: any) {
    console.error('Queue details error:', error);
    res.status(500).json({ error: error.message || 'Failed to get queue details' });
  }
});

export { router as adminRouter };
