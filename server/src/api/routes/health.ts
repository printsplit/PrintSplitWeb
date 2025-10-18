import express from 'express';
import { getQueueStats } from '../../worker/queue';
import { getStorageClient } from '../../storage/minio-client';

const router = express.Router();

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/', async (req, res) => {
  try {
    const storage = getStorageClient();

    // Check queue connection
    const queueStats = await getQueueStats();

    // Check MinIO connection (try to list a bucket)
    await storage.listObjects('', 'result');

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        api: 'ok',
        redis: 'ok',
        minio: 'ok',
      },
      queue: queueStats,
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

export { router as healthRouter };
