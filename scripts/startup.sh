#!/bin/bash

# PrintSplit Web - Startup Script
# This script starts all Docker services

set -e

echo "🚀 Starting PrintSplit Web..."
export NODE_OPTIONS="--max-old-space-size=4096"
# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from .env.example..."
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "✅ Created .env file. Please edit it with your configuration."
        echo "   Run this script again after updating .env"
        exit 1
    else
        echo "❌ .env.example not found. Cannot create .env file."
        exit 1
    fi
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Build frontend if needed
if [ ! -d "client/dist" ]; then
    echo "📦 Building frontend..."
    cd client
    npm install
    npm run build
    cd ..
    echo "✅ Frontend built"
fi

# Create data directories
echo "📁 Creating data directories..."
mkdir -p data/minio data/redis temp/uploads temp/processing
chmod -R 777 temp/

# Start Docker services
echo "🐳 Starting Docker services..."
docker compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
sleep 5

# Check MinIO
echo "🔍 Checking MinIO..."
until docker compose exec -T minio mc alias ls > /dev/null 2>&1; do
    echo "   Waiting for MinIO..."
    sleep 2
done
echo "✅ MinIO is ready"

# Check Redis
echo "🔍 Checking Redis..."
until docker compose exec -T redis redis-cli ping > /dev/null 2>&1; do
    echo "   Waiting for Redis..."
    sleep 2
done
echo "✅ Redis is ready"

# Check API
echo "🔍 Checking API..."
until curl -f http://localhost:3000/api/health > /dev/null 2>&1; do
    echo "   Waiting for API..."
    sleep 2
done
echo "✅ API is ready"

echo ""
echo "✅ PrintSplit Web is running!"
echo ""
echo "📊 Service URLs:"
echo "   - Web App:      http://localhost"
echo "   - API:          http://localhost:3000/api"
echo "   - MinIO Console: http://localhost:9001"
echo ""
echo "🔧 Useful commands:"
echo "   - View logs:    docker-compose logs -f"
echo "   - Stop:         docker-compose stop"
echo "   - Restart:      docker-compose restart"
echo "   - Shutdown:     docker-compose down"
echo ""
