#!/bin/bash

# PrintSplit Web - Backup Script
# Backs up MinIO data and Redis data

set -e

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/printsplit_backup_${TIMESTAMP}.tar.gz"

echo "📦 Creating backup..."

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Create temporary directory for backup
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Copy data
echo "📁 Copying MinIO data..."
cp -r data/minio "$TEMP_DIR/"

echo "📁 Copying Redis data..."
cp -r data/redis "$TEMP_DIR/"

# Create tarball
echo "🗜️  Creating archive..."
tar -czf "$BACKUP_FILE" -C "$TEMP_DIR" .

# Get file size
SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

echo "✅ Backup completed!"
echo "   File: $BACKUP_FILE"
echo "   Size: $SIZE"
echo ""
echo "💡 To restore:"
echo "   1. Stop services: docker-compose down"
echo "   2. Extract: tar -xzf $BACKUP_FILE -C data/"
echo "   3. Start services: ./scripts/startup.sh"
