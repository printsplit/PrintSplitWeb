import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { addProcessingJob } from '../../worker/queue';
import { ProcessingJobData } from '../../types/job';

const router = express.Router();

/**
 * POST /api/process
 * Start STL processing job
 */
router.post('/', async (req, res) => {
  try {
    const { fileId, fileName, dimensions, smartBoundaries, balancedCutting, alignmentHoles } = req.body;

    // Validate required fields
    if (!fileId || !fileName || !dimensions) {
      return res.status(400).json({ error: 'Missing required fields: fileId, fileName, dimensions' });
    }

    if (!dimensions.x || !dimensions.y || !dimensions.z) {
      return res.status(400).json({ error: 'Dimensions must include x, y, and z values' });
    }

    // Create job
    const jobId = uuidv4();
    const jobData: ProcessingJobData = {
      jobId,
      fileId,
      fileName,
      dimensions,
      smartBoundaries: smartBoundaries !== undefined ? smartBoundaries : true,
      balancedCutting: balancedCutting !== undefined ? balancedCutting : true,
      alignmentHoles: alignmentHoles || {
        enabled: false,
        diameter: 1.8,
        depth: 3,
        spacing: 'normal',
      },
    };

    await addProcessingJob(jobData);

    res.json({
      success: true,
      jobId,
      message: 'Processing job started',
    });
  } catch (error: any) {
    console.error('Process start error:', error);
    res.status(500).json({ error: error.message || 'Failed to start processing' });
  }
});

export { router as processRouter };
