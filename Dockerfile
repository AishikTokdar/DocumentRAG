# Stage 1: Build Frontend SPA
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ .
# The frontend build command generates static files into /app/frontend/dist
RUN npm run build


# Stage 2: Build Backend & Serve Full Stack
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies required for compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application source
COPY backend/ .

# Copy built frontend from Stage 1 into the backend's 'static' directory
# FastAPI will automatically mount and serve this directory at /
COPY --from=frontend-builder /app/frontend/dist /app/static

# Expose FastAPI port
EXPOSE 8000

# Run the Uvicorn ASGI server
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
