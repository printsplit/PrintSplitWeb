import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { addRepairJob } from '../../worker/queue';
import { RepairJobData } from '../../types/job';

const router = express.Router();

/**
 * POST /api/repair
 * Start STL repair job
 */
router.post('/', async (req, res) => {
  try {
    const { fileId, fileName } = req.body;

    if (!fileId || !fileName) {
      return res.status(400).json({ error: 'Missing required fields: fileId, fileName' });
    }

    const jobId = uuidv4();
    const jobData: RepairJobData = {
      jobId,
      fileId,
      fileName,
    };

    await addRepairJob(jobData);

    res.json({
      success: true,
      jobId,
      message: 'Repair job started',
    });
  } catch (error: any) {
    console.error('Repair start error:', error);
    res.status(500).json({ error: error.message || 'Failed to start repair' });
  }
});

export { router as repairRouter };
