# Stage 1: Build the React frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
# Install pnpm according to memory note
RUN npm install -g pnpm
COPY saas-platform/frontend/package.json saas-platform/frontend/pnpm-lock.yaml ./
RUN pnpm install
COPY saas-platform/frontend/ ./
RUN pnpm run build

# Stage 2: Final image with FastAPI and built frontend
FROM python:3.11-slim
WORKDIR /app

# Install dependencies
COPY saas-platform/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY saas-platform/backend/ ./backend/

# Copy built frontend from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose the port Cloud Run will use
ENV PORT=8080
EXPOSE 8080

WORKDIR /app/backend

# Run the application using Uvicorn directly
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1"]
