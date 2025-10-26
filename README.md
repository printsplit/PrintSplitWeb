# PrintSplit Web

A production-ready web application for splitting large 3D STL files into smaller, printable sections. Built with a scalable queue-based architecture for reliable background processing.

## Features

### Core Functionality
- **STL File Splitting**: Split large models into smaller sections based on configurable dimensions
- **Balanced Cutting**: Distributes pieces evenly to avoid tiny leftover sections
- **Alignment Holes**: Optional filament-based pin holes for easy part assembly
- **Real-time Progress**: Live progress updates and queue position tracking
- **Batch Download**: Download all parts as a single ZIP archive

## Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/printsplit/PrintSplitWeb
   cd PrintSplitWeb
   ```

2. **Create and edit environment file:**
   ```bash
   cp .env.example .env
   ```

3. Run the build_start.sh script. (This will run npm commands, build all files, stop the PrintSplit docker containers, rebuild them, then start them up again.)
   ```bash
   ./build_start.sh
   ```

4. Goto http://localhost/ to see PrintSplit running on your machine.


## Architecture

```
┌─────────────┐
│   Caddy     │  Reverse proxy with automatic HTTPS
│  (Port 80)  │  Routes: /core → React app, /api → Express
└──────┬──────┘
       │
   ┌───┴────────────────┐
   │                    │
┌──▼────┐        ┌──────▼──────┐
│ React │        │   Express   │
│  SPA  │        │  API Server │
└───────┘        └──────┬──────┘
                        │
          ┌─────────────┼─────────────┐
          │             │             │
     ┌────▼───┐    ┌────▼────┐   ┌───▼────┐
     │ Redis  │    │  MinIO  │   │ Worker │
     │ Queue  │    │ Storage │   │ (Bull) │
     └────────┘    └─────────┘   └────────┘
```

### Technology Stack

**Backend:**
- Node.js 20 with TypeScript
- Express.js (REST API)
- Bull (Redis-based job queue)
- MinIO (S3-compatible object storage)
- Manifold-3D (WebAssembly STL processing)

**Frontend:**
- React with TypeScript
- Vite (build tool)
- Three.js (3D preview - future feature)

**Infrastructure:**
- Docker & Docker Compose
- Caddy (reverse proxy with auto-HTTPS)
- Redis (job queue and caching)

## Setup

### Prerequisites
- Docker and Docker Compose installed
- 4GB+ RAM recommended for processing large files
- Ports 80, 443 available (or configure alternatives)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/printsplit/PrintSplitWeb
   cd PrintSplitWeb
   ```

2. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

3. **Configure environment variables:**
   ```bash
   # Edit .env file
   ADMIN_PASSWORD=your_secure_password_here
   MINIO_ROOT_USER=printsplit
   MINIO_ROOT_PASSWORD=your_minio_password
   ```

4. **Build and start services:**
   ```bash
   docker-compose up -d
   ```

5. **Access the application:**
   - **App**: http://localhost/core
   - **Admin**: http://localhost/core/admin/login
   - **MinIO Console**: http://localhost:9001

## Configuration

### Environment Variables

#### General Settings
```bash
NODE_ENV=production           # Environment (production/development)
```

#### Storage (MinIO)
```bash
MINIO_ROOT_USER=printsplit              # MinIO username
MINIO_ROOT_PASSWORD=printsplit123       # MinIO password
```

#### Queue & Processing
```bash
WORKER_CONCURRENCY=2                    # Simultaneous jobs per worker
JOB_RETENTION_HOURS=48                  # Keep completed jobs (hours)
JOB_RETENTION_DAYS=2                    # MinIO lifecycle (days)
```

#### Security & Limits
```bash
ADMIN_PASSWORD=changeme                 # Admin dashboard password
MAX_FILE_SIZE=100MB                     # Maximum upload size
RATE_LIMIT_ENABLED=false                # Enable rate limiting
```

### Worker Memory Configuration

The worker is configured with increased memory limits to handle large STL files:

```yaml
# docker-compose.yml
worker:
  command: node --max-old-space-size=4096 --wasm_max_mem_pages=65536 dist/worker/index.js
```

- **Node.js heap**: 4GB (`--max-old-space-size=4096`)
- **WASM memory**: 4GB (`--wasm_max_mem_pages=65536`)

### Scaling Workers

Run multiple workers for higher throughput:

```bash
docker-compose up --scale worker=4 -d
```

## Usage

### Processing STL Files

1. **Upload File**: Drag and drop or select an STL file
2. **Configure Settings**:
   - **Max Dimensions**: Set maximum cube size (e.g., 200×200×200mm)
   - **Smart Boundaries**: Auto-adjust cuts to prevent floating parts
   - **Balanced Cutting**: Distribute pieces evenly
   - **Alignment Holes**: Add filament pin holes for assembly
3. **Process**: Click "Split STL" to start processing
4. **Monitor**: Watch progress and queue position in real-time
5. **Download**: Download individual parts or all parts as ZIP

### Admin Dashboard

Access at `/core/admin/login` with your `ADMIN_PASSWORD`.

**Features:**
- **System Health**: Monitor Redis, MinIO, and worker status
- **Queue Statistics**: View waiting, active, completed, and failed jobs
- **Processing Metrics**: Average processing time and success rate
- **Active Jobs**: See running jobs with progress and runtime
- **Job Management**: Cancel/kill stuck jobs
- **Worker Control**: Restart worker to clear stuck processes

**Auto-refresh**: Dashboard updates every 5 seconds automatically.


## Development

### Local Development Setup

1. **Install dependencies:**
   ```bash
   # Server
   cd server
   npm install

   # Client
   cd ../client
   npm install
   ```

2. **Start infrastructure:**
   ```bash
   docker-compose up redis minio -d
   ```

3. **Run development servers:**
   ```bash
   # Terminal 1: API Server
   cd server
   npm run dev

   # Terminal 2: Worker
   cd server
   npm run worker:dev

   # Terminal 3: Client
   cd client
   npm run dev
   ```

4. **Access development servers:**
   - Client: http://localhost:5173
   - API: http://localhost:3000
   - MinIO: http://localhost:9001

### Build for Production

```bash
# Build client
cd client
npm run build

# Build server (happens in Docker)
cd ../server
npm run build

# Build and deploy
docker-compose up --build -d
```

### Project Structure

```
PrintSplitWeb/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── context/       # Auth context
│   │   ├── pages/         # Page components
│   │   └── App.tsx        # Main app with router
│   └── dist/              # Built static files
├── server/                 # Node.js backend
│   ├── src/
│   │   ├── api/           # Express routes & middleware
│   │   ├── processing/    # STL processing (Manifold-3D)
│   │   ├── storage/       # MinIO client
│   │   ├── types/         # TypeScript types
│   │   └── worker/        # Bull worker & queue
│   └── dist/              # Compiled JavaScript
├── website/                # Landing page (static HTML)
├── data/                   # Persistent data (Redis, MinIO, Caddy)
├── Caddyfile              # Production Caddy config
├── Caddyfile.dev          # Development Caddy config
└── docker-compose.yml     # Container orchestration
```

## Troubleshooting

### Worker Running Out of Memory

**Symptoms:** "offset is out of bounds" or "RangeError" errors

**Solutions:**
1. Worker memory limits already increased to 4GB
2. Try disabling alignment holes for very large models
3. Use smaller cube dimensions to reduce processing complexity
4. Check if model has excessive triangle count (>1M triangles)

### Jobs Getting Stuck

**Symptoms:** Job shows "active" but no progress for >10 minutes

**Solutions:**
1. Use admin dashboard to kill the stuck job
2. Restart worker from admin dashboard (Redis-based, no Docker access needed)
3. Check worker logs: `docker logs printsplit-worker`

### Queue Stall Detection Errors

**Symptoms:** "Missing lock for job" or "job stalled" errors but job completes

**Solution:** This is now fixed with increased `lockDuration` (10 minutes). If you still see this, increase it further in `server/src/worker/queue.ts`.

### Upload Failures

**Symptoms:** "File too large" or upload hangs

**Solutions:**
1. Check `MAX_FILE_SIZE` environment variable
2. Increase Caddy timeout in Caddyfile if needed
3. Verify MinIO is healthy: `docker logs printsplit-minio`

### Admin Dashboard Won't Load

**Symptoms:** 401/403 errors or "Too many requests"

**Solutions:**
1. Verify `ADMIN_PASSWORD` is set correctly
2. Rate limiting is disabled by default now
3. Clear browser cache and try again
4. Check API logs: `docker logs printsplit-api`

### Worker Won't Restart

**Symptoms:** Restart button doesn't work or worker stays down

**Solutions:**
1. Check Docker restart policy: should be `unless-stopped`
2. View worker logs: `docker logs printsplit-worker`
3. Manually restart: `docker-compose restart worker`

## Performance Optimization

### Memory Management

The application implements comprehensive WASM memory cleanup:
- All Manifold objects are properly deleted after use
- Cylinders, cutting boxes, and intermediate results are freed immediately
- Part manifolds are cleaned up after STL export
- 4GB heap and 4GB WASM memory available for large files

### Queue Tuning

Bull queue settings optimized for long-running jobs:
- **Lock Duration**: 10 minutes (allows complex processing)
- **Lock Renewal**: Every 30 seconds (keeps job alive)
- **Stall Interval**: 60 seconds (reduces false alarms)
- **Max Stalled Count**: 2 (prevents infinite loops)

### Worker Scaling

Scale workers based on workload:
```bash
# Light workload (1-2 concurrent jobs)
docker-compose up --scale worker=1 -d

# Medium workload (3-4 concurrent jobs)
docker-compose up --scale worker=2 -d

# Heavy workload (5-8 concurrent jobs)
docker-compose up --scale worker=4 -d
```

**Note:** Each worker uses `WORKER_CONCURRENCY=2` by default, so 2 workers = 4 concurrent jobs.

## Deployment

### Production Deployment

1. **Update Caddyfile:**
   ```bash
   # Edit docker-compose.yml to use production Caddyfile
   volumes:
     - ./Caddyfile:/etc/caddy/Caddyfile:ro  # Production (auto-HTTPS)
   ```

2. **Set environment variables:**
   ```bash
   # Strong passwords
   ADMIN_PASSWORD=<strong-random-password>
   MINIO_ROOT_PASSWORD=<strong-random-password>

   # Enable rate limiting
   RATE_LIMIT_ENABLED=true
   ```

3. **Configure domain:**
   Edit `Caddyfile` with your domain:
   ```
   your-domain.com {
     # Caddy will automatically obtain SSL certificates
     # ...
   }
   ```

4. **Deploy:**
   ```bash
   docker-compose up -d --build
   ```

### Monitoring

**Check service health:**
```bash
docker-compose ps
docker-compose logs -f
```

## License

MIT

## Credits

- Built with [Manifold-3D](https://github.com/elalish/manifold) - Geometry library for topological robustness
- Queue system powered by [Bull](https://github.com/OptimalBits/bull)
- Object storage by [MinIO](https://min.io/)

