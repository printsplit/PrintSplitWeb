#!/bin/bash
docker compose down
cd client
npm ci
export NODE_OPTIONS="--max-old-space-size=4096"
npm run build
cd ..
docker compose build
./scripts/startup.sh