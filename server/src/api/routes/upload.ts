import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { getStorageClient } from '../../storage/minio-client';
import * as path from 'path';

const router = express.Router();
const storage = getStorageClient();

// Parse file size from string like "100MB" to bytes
function parseFileSize(sizeStr: string): number {
  const units: { [key: string]: number } = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  };

  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B)$/i);
  if (!match) {
    return parseInt(sizeStr); // Fallback to parsing as plain number
  }

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  return Math.floor(value * (units[unit] || 1));
}

// Configure multer for temporary file storage
const upload = multer({
  dest: '/tmp/uploads',
  limits: {
    fileSize: parseFileSize(process.env.MAX_FILE_SIZE || '150MB'), // 150MB default
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.stl') {
      return cb(new Error('Only STL files are allowed'));
    }
    cb(null, true);
  },
});

/**
 * POST /api/upload
 * Upload STL file
 */
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileId = uuidv4();
    const originalName = req.file.originalname;
    const objectName = `${fileId}/${originalName}`;

    // Upload to MinIO
    await storage.uploadFile(req.file.path, objectName, 'upload');

    // Clean up temp file
    const fs = require('fs/promises');
    await fs.unlink(req.file.path);

    res.json({
      success: true,
      fileId: objectName,
      fileName: originalName,
      size: req.file.size,
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message || 'Upload failed' });
  }
});

export { router as uploadRouter };
