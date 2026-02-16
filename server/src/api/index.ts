import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { uploadRouter } from './routes/upload';
import { processRouter } from './routes/process';
import { jobsRouter } from './routes/jobs';
import { downloadRouter } from './routes/download';
import { healthRouter } from './routes/health';
import { adminRouter } from './routes/admin';
import { repairRouter } from './routes/repair';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(compression());

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting - skip admin routes (they have auth protection)
const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED !== 'false'; // Default: enabled
const rateLimitWindowMinutes = parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES || '15');
const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '200');

if (rateLimitEnabled) {
  const limiter = rateLimit({
    windowMs: rateLimitWindowMinutes * 60 * 1000,
    max: rateLimitMax,
    message: 'Too many requests from this IP, please try again later.',
    skip: (req) => req.path.startsWith('/api/admin'), // Skip rate limiting for admin routes
  });

  console.log(`⚡ Rate limiting: ${rateLimitMax} requests per ${rateLimitWindowMinutes} minutes`);
  app.use('/api/', limiter);
} else {
  console.log('⚠️  Rate limiting: DISABLED');
}

// API Routes (admin first to skip rate limiting)
app.use('/api/admin', adminRouter);
app.use('/api/health', healthRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/process', processRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/download', downloadRouter);
app.use('/api/repair', repairRouter);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('API Error:', err);

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 PrintSplit API server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️  MinIO: ${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`);
  console.log(`📮 Redis: ${process.env.REDIS_URL}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('⏸️  Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('⏸️  Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

export default app;
