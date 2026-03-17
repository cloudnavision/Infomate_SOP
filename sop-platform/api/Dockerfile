# ============================================================
# SOP Platform — API Dockerfile
# FastAPI + SQLAlchemy + python-docx + Pillow + LibreOffice
# ============================================================
FROM python:3.11-slim

WORKDIR /app

# System dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    fonts-dejavu-core \
    libreoffice-writer \
    libreoffice-common \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
