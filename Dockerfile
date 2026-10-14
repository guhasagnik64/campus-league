# Stage 1: Build the React Frontend using modern Node.js
FROM node:20-slim AS frontend-build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Run the Python FastAPI Backend & serve the frontend
FROM python:3.10-slim

WORKDIR /app

# Install system dependencies (FFmpeg and OpenCV/Ultralytics required libs)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsm6 \
    libxext6 \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip to ensure smooth installation of heavy packages (torch, ultralytics)
RUN pip3 install --no-cache-dir --upgrade pip

# Install Python backend dependencies
COPY requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy backend server code
COPY *.py ./

# Copy the compiled React frontend from Stage 1
COPY --from=frontend-build /app/dist ./dist

# Start FastAPI via Uvicorn on Render's assigned port
CMD sh -c "python3 -m uvicorn server:app_asgi --host 0.0.0.0 --port ${PORT:-10000}"