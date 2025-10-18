import express from 'express';
import { getStorageClient } from '../../storage/minio-client';

const router = express.Router();
const storage = getStorageClient();

/**
 * GET /api/download/:jobId/all
 * Download all parts as ZIP
 * NOTE: This route MUST come before /:jobId/:partName to avoid matching "all" as a partName
 */
router.get('/:jobId/all', async (req, res) => {
  try {
    const { jobId } = req.params;
    const zipObjectName = `${jobId}/all-parts.zip`;

    // Check if ZIP exists
    const exists = await storage.objectExists(zipObjectName, 'result');
    if (!exists) {
      return res.status(404).json({ error: 'ZIP file not found' });
    }

    // Get file buffer
    const buffer = await storage.getFileBuffer(zipObjectName, 'result');

    // Set headers
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${jobId}-parts.zip"`);
    res.setHeader('Content-Length', buffer.length);

    // Send file
    res.send(buffer);
  } catch (error: any) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message || 'Download failed' });
  }
});

/**
 * GET /api/download/:jobId/:partName
 * Download a specific part
 */
router.get('/:jobId/:partName', async (req, res) => {
  try {
    const { jobId, partName } = req.params;
    const objectName = `${jobId}/${partName}`;

    // Check if file exists
    const exists = await storage.objectExists(objectName, 'result');
    if (!exists) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Get file buffer
    const buffer = await storage.getFileBuffer(objectName, 'result');

    // Set headers
    res.setHeader('Content-Type', 'application/sla');
    res.setHeader('Content-Disposition', `attachment; filename="${partName}"`);
    res.setHeader('Content-Length', buffer.length);

    // Send file
    res.send(buffer);
  } catch (error: any) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message || 'Download failed' });
  }
});

/**
 * GET /api/download/:jobId/url/:partName
 * Get pre-signed download URL
 */
router.get('/:jobId/url/:partName', async (req, res) => {
  try {
    const { jobId, partName } = req.params;
    const objectName = `${jobId}/${partName}`;

    // Check if file exists
    const exists = await storage.objectExists(objectName, 'result');
    if (!exists) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Get pre-signed URL (valid for 24 hours)
    const url = await storage.getDownloadUrl(objectName, 'result', 24 * 60 * 60);

    res.json({ url });
  } catch (error: any) {
    console.error('URL generation error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate download URL' });
  }
});

export { router as downloadRouter };
