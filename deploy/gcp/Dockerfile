# Stage 1: Build the React frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
RUN npm install -g pnpm@9
COPY saas-platform/frontend/package.json saas-platform/frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY saas-platform/frontend/ ./
ENV CI=false
RUN pnpm run build

# Stage 2: Final image with FastAPI, Celery, Redis, and built frontend
FROM python:3.11-slim

# Install system dependencies: redis-server and supervisor
RUN apt-get update && apt-get install -y redis-server supervisor && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY saas-platform/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY saas-platform/backend/ ./backend/

# Copy built frontend from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy startup script
COPY deploy/gcp/start.sh /app/start.sh

# Expose the port Cloud Run will use
ENV PORT=8080
EXPOSE 8080

WORKDIR /app

# Run bash script to manage all processes
CMD ["/app/start.sh"]
