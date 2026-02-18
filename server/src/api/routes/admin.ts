import express from 'express';
import { authenticateAdmin, adminLogin } from '../middleware/auth';
import { processingQueue, forceFailJob, forceFailRepairJob, cleanQueue, cleanRepairQueue } from '../../worker/queue';
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
    const activeJobDetails = activeJobs.map(job => {
      const progressData = job.progress();
      const progress = typeof progressData === 'object' && progressData !== null
        ? progressData.percent || 0
        : (typeof progressData === 'number' ? progressData : 0);

      return {
        id: job.id,
        progress,
        startedAt: job.processedOn,
        data: {
          fileName: job.data.fileName,
          dimensions: job.data.dimensions,
        }
      };
    });

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
        const progressData = job.progress();
        const progress = typeof progressData === 'object' && progressData !== null
          ? progressData.percent || 0
          : (typeof progressData === 'number' ? progressData : 0);

        return {
          id: job.id,
          state: jobState,
          progress,
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

    const state = await job.getState();

    if (state === 'active') {
      // Set cancellation flag in job data
      const jobData = job.data;
      jobData._cancelled = true;
      await job.update(jobData);
      console.log(`⚠️  Admin set cancellation flag for active job ${id}`);
    } else {
      // For waiting/delayed jobs, just remove them
      await job.remove();
      console.log(`⚠️  Admin removed ${state} job ${id}`);
    }

    res.json({
      success: true,
      message: `Job ${id} cancellation initiated`,
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

/**
 * GET /api/admin/system-health
 * Get system health status (Redis, MinIO, Workers)
 */
router.get('/system-health', authenticateAdmin, async (req, res) => {
  try {
    const health = {
      redis: false,
      minio: false,
      workers: {
        active: 0,
        healthy: false,
        lastActivity: null as number | null,
      },
      timestamp: Date.now(),
    };

    // Check Redis connection
    try {
      await processingQueue.client.ping();
      health.redis = true;
    } catch (error) {
      console.error('Redis health check failed:', error);
    }

    // Check MinIO - try to get storage service
    try {
      const { getStorageClient } = await import('../../storage/minio-client');
      const storage = getStorageClient();
      // Simple check - MinIO client exists
      health.minio = !!storage;
    } catch (error) {
      console.error('MinIO health check failed:', error);
    }

    // Check workers by looking at active jobs
    try {
      const activeJobs = await processingQueue.getActive();
      health.workers.active = activeJobs.length;

      // If there are active jobs, workers are processing
      if (activeJobs.length > 0) {
        health.workers.healthy = true;
        // Find most recent job start time
        const mostRecent = activeJobs.reduce((latest, job) => {
          return job.processedOn && job.processedOn > latest ? job.processedOn : latest;
        }, 0);
        health.workers.lastActivity = mostRecent || null;
      } else {
        // Check if there are waiting jobs - if yes but no active, workers might be down
        const waitingCount = await processingQueue.getWaitingCount();
        const recentCompleted = await processingQueue.getCompleted(0, 0);

        if (waitingCount > 0 && recentCompleted.length === 0) {
          // Jobs waiting but nothing recently completed - potential issue
          health.workers.healthy = false;
        } else {
          // No jobs waiting, or jobs were recently completed
          health.workers.healthy = true;
          if (recentCompleted.length > 0 && recentCompleted[0].finishedOn) {
            health.workers.lastActivity = recentCompleted[0].finishedOn;
          }
        }
      }
    } catch (error) {
      console.error('Worker health check failed:', error);
    }

    res.json(health);
  } catch (error: any) {
    console.error('System health check error:', error);
    res.status(500).json({ error: error.message || 'Failed to get system health' });
  }
});

/**
 * POST /api/admin/worker/restart
 * Signal the worker to restart via Redis flag
 */
router.post('/worker/restart', authenticateAdmin, async (req, res) => {
  try {
    console.log('⚠️  Admin initiated worker restart signal');

    // Set restart flag in Redis with 60 second expiry
    await processingQueue.client.setex('worker:restart', 60, Date.now().toString());

    res.json({
      success: true,
      message: 'Worker restart signal sent. Worker will restart within 10 seconds.',
    });
  } catch (error: any) {
    console.error('Worker restart error:', error);
    res.status(500).json({
      error: error.message || 'Failed to signal worker restart',
    });
  }
});

/**
 * POST /api/admin/jobs/:id/force-fail
 * Force-fail a stuck active job (moves it to failed state immediately)
 */
router.post('/jobs/:id/force-fail', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Try processing queue first, then repair queue
    let success = await forceFailJob(id);
    if (!success) {
      success = await forceFailRepairJob(id);
    }

    if (!success) {
      return res.status(404).json({
        error: 'Job not found or not in active state. Only active (stuck) jobs can be force-failed.',
      });
    }

    console.log(`⚠️  Admin force-failed stuck job ${id}`);
    res.json({
      success: true,
      message: `Job ${id} has been force-failed and removed from the active queue.`,
    });
  } catch (error: any) {
    console.error('Force-fail error:', error);
    res.status(500).json({ error: error.message || 'Failed to force-fail job' });
  }
});

/**
 * POST /api/admin/queue/clean
 * Clean jobs from the queue by state
 * Body: { state: 'completed' | 'failed' | 'delayed' | 'wait', includeRepair?: boolean }
 */
router.post('/queue/clean', authenticateAdmin, async (req, res) => {
  try {
    const { state, includeRepair = true } = req.body;

    const validStates = ['completed', 'failed', 'delayed', 'wait'];
    if (!state || !validStates.includes(state)) {
      return res.status(400).json({
        error: `Invalid state. Must be one of: ${validStates.join(', ')}`,
      });
    }

    let totalCleaned = await cleanQueue(state);

    if (includeRepair) {
      totalCleaned += await cleanRepairQueue(state);
    }

    console.log(`🧹 Admin cleaned ${totalCleaned} ${state} jobs from queue`);
    res.json({
      success: true,
      message: `Cleaned ${totalCleaned} ${state} job(s) from the queue.`,
      cleaned: totalCleaned,
    });
  } catch (error: any) {
    console.error('Queue clean error:', error);
    res.status(500).json({ error: error.message || 'Failed to clean queue' });
  }
});

export { router as adminRouter };
