#!/bin/bash
# SuperShaker SaaS Prototype Launcher

echo "Starting SuperShaker SaaS Prototype..."

# Get the absolute path to the script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Start Redis via docker-compose
echo "-> Starting Redis (Docker)..."
cd "$DIR" || exit 1
docker-compose up -d redis

# Start the backend in the background
echo "-> Starting FastAPI Backend (Port 8000)..."
cd "$DIR/saas-platform/backend" || exit 1
# Use the virtual environment Python if available
if [ -f "$DIR/.venv/bin/python" ]; then
    "$DIR/.venv/bin/python" main.py &
else
    python3 main.py &
fi
BACKEND_PID=$!

echo "-> Starting Celery Worker..."
if [ -f "$DIR/.venv/bin/celery" ]; then
    "$DIR/.venv/bin/celery" -A worker.celery_app worker --loglevel=info &
else
    python3 -m celery -A worker.celery_app worker --loglevel=info &
fi
CELERY_PID=$!

# Start the frontend in the background
echo "-> Starting React Frontend (Vite)..."
cd "$DIR/saas-platform/frontend" || exit 1
# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    pnpm install
fi
pnpm run dev &
FRONTEND_PID=$!

# Function to clean up background processes on exit
cleanup() {
    echo ""
    echo "Shutting down SuperShaker SaaS Prototype..."
    kill $BACKEND_PID 2>/dev/null
    kill $CELERY_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    wait $BACKEND_PID 2>/dev/null
    wait $CELERY_PID 2>/dev/null
    wait $FRONTEND_PID 2>/dev/null
    echo "Shutdown complete."
    exit
}

# Catch termination signals to clean up processes
trap cleanup SIGINT SIGTERM

echo ""
echo "============================================================"
echo "SuperShaker SaaS is running!"
echo "Backend API: http://localhost:8000"
echo "Frontend UI: http://localhost:5173"
echo "Press Ctrl+C to stop both servers."
echo "============================================================"
echo ""

# Keep script running to listen for Ctrl+C
wait
