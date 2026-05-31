#!/bin/bash
set -e

echo "Starting Redis server..."
redis-server --daemonize yes

echo "Waiting for Redis to start..."
sleep 2

echo "Starting Celery worker..."
cd /app/backend
celery -A worker:celery_app worker --loglevel=info &

echo "Starting FastAPI server..."
exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1
