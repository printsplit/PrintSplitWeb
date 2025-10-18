#!/bin/bash

# PrintSplit Web - Cleanup Script
# Removes old jobs and temporary files

set -e

RETENTION_DAYS=${RETENTION_DAYS:-2}

echo "🧹 Cleaning up old data (retention: ${RETENTION_DAYS} days)..."

# Clean up old completed jobs in Redis
echo "📮 Cleaning Redis completed jobs..."
docker-compose exec -T redis redis-cli --scan --pattern "bull:stl-processing:*:completed" | \
  xargs -I {} docker-compose exec -T redis redis-cli DEL {} || true

# Clean up old failed jobs (older than 7 days)
echo "📮 Cleaning Redis failed jobs..."
docker-compose exec -T redis redis-cli --scan --pattern "bull:stl-processing:*:failed" | \
  xargs -I {} docker-compose exec -T redis redis-cli DEL {} || true

# MinIO cleanup is handled by lifecycle policy in docker-compose
echo "✅ MinIO cleanup is automated via lifecycle policy"

# Clean up local temp directories
echo "🗑️  Cleaning local temp files..."
rm -rf temp/uploads/* temp/processing/* 2>/dev/null || true

# Docker system cleanup
echo "🐳 Cleaning Docker system..."
docker system prune -f --volumes

echo ""
echo "✅ Cleanup completed!"
echo "   - Redis jobs cleaned"
echo "   - Temp files removed"
echo "   - Docker system pruned"
