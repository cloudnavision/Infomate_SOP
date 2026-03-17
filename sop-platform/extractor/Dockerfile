# ============================================================
# SOP Platform — Frame Extractor Dockerfile
# FFmpeg + PySceneDetect + OpenCV + imagehash + Mermaid CLI
# Memory limit: 4G (enforced via docker-compose.yml deploy.resources)
# ============================================================
FROM python:3.11-slim

WORKDIR /app

# System dependencies
# Note: libgl1 replaces libgl1-mesa-glx on Debian bookworm (python:3.11-slim base)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    curl \
    gnupg \
    chromium \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20 via NodeSource
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Configure Puppeteer to use system Chromium (no extra download)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install Mermaid CLI globally
RUN npm install -g @mermaid-js/mermaid-cli

# Puppeteer config required for headless Chrome in Docker (no sandbox)
RUN echo '{"executablePath":"/usr/bin/chromium","args":["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage"]}' \
    > /app/puppeteer.config.json

# Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY . .

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
