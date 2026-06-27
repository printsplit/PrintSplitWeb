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
// A wildcard origin ('*') combined with credentials is rejected by browsers,
// so when no explicit allow-list is configured we reflect the request origin
// (origin: true), which is valid alongside credentials.
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({
  origin: allowedOrigins && allowedOrigins.length > 0 ? allowedOrigins : true,
  credentials: true,
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting - skip admin routes (they have auth protection)
const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED !== 'false'; // Default: enabled
const rateLimitWindowMinutes = parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES || '15');
// Long jobs are polled by several components at once (job status, queue
// position, processing state), so the default headroom must cover a full job's
// worth of polls plus normal browsing.
const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000');

if (rateLimitEnabled) {
  const limiter = rateLimit({
    windowMs: rateLimitWindowMinutes * 60 * 1000,
    max: rateLimitMax,
    // Respond with JSON so clients that parse the body (response.json()) don't
    // choke on a plain-text 429.
    message: { error: 'Too many requests from this IP, please try again later.' },
    // Exempt authenticated admin routes (e.g. dashboard polling) from the
    // general limit, but NOT the login endpoint — it must stay rate-limited.
    // Use originalUrl because req.path is stripped of the mount prefix here.
    skip: (req) =>
      req.originalUrl.startsWith('/api/admin') &&
      !req.originalUrl.startsWith('/api/admin/login'),
  });

  // Stricter dedicated limiter for the login endpoint to throttle brute force.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '10'),
    message: { error: 'Too many login attempts, please try again later.' },
  });

  console.log(`⚡ Rate limiting: ${rateLimitMax} requests per ${rateLimitWindowMinutes} minutes`);
  app.use('/api/admin/login', loginLimiter);
  app.use('/api/', limiter);
} else {
  console.log('⚠️  Rate limiting: DISABLED');
}

// API Routes
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
