FROM python:3.10-slim

# Install system dependencies (Python, Node.js for frontend build, FFmpeg for analytics)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    nodejs \
    npm \
    ffmpeg \
    libsm6 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install frontend dependencies
COPY package*.json ./
RUN npm install

# Copy Python requirements and install backend dependencies
COPY requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy all project source code
COPY . .

# Build the React frontend into the 'dist' folder
RUN npm run build

# FORCE Uvicorn to run FastAPI (bypassing any Node/Express scripts)
CMD sh -c "uvicorn server:app_asgi --host 0.0.0.0 --port ${PORT:-10000}"