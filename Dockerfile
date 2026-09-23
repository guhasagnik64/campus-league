FROM node:20-slim

# Install Python & system dependencies for OpenCV / FFmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    libsm6 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm install

# Install Python dependencies safely
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt || true

# Copy source code
COPY . .

# Build the Vite frontend static bundle into the 'dist' folder
RUN npm run build

EXPOSE 10000

CMD ["node", "server.js"]