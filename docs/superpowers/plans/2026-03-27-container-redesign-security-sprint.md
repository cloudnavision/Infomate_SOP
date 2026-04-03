# Sprint Plan — Container Redesign + 5 Critical Security Fixes
**Date:** 2026-03-27
**Sprint Goal:** Destroy and rebuild all containers with correct separation of concerns, and close the 5 critical security/reliability gaps identified in the architecture review.
**Estimated total time:** 3-4 hours

---

## Target Architecture (After Sprint)

```
n8n (azuren8n.cloudnavision.com — self-hosted on Azure)
  │
  │  POST https://soptest.cloudnavision.com/api/extract
  │  Header: x-internal-key: <INTERNAL_API_KEY>
  ▼
Cloudflare Edge
  └─ WAF Rule: x-internal-key present → skip Bot Fight Mode (Phase 3 unblock)
  ▼
QUIC Tunnel
  ▼
┌──────────────────────── Azure VM ──────────────────────────────────┐
│  ┌─── sop-network (Docker bridge) ──────────────────────────────┐  │
│  │                                                               │  │
│  │  sop-tunnel :outbound   cloudflare/cloudflared               │  │
│  │    routes: soptest.cloudnavision.com → http://sop-api:8000   │  │
│  │                    ↓  (Docker DNS)                            │  │
│  │  sop-api    :8000   FastAPI                                   │  │
│  │    • validates x-internal-key                                 │  │
│  │    • proxies /api/extract → http://sop-extractor:8001        │  │
│  │                    ↓  (Docker DNS — internal only)            │  │
│  │  sop-extractor :8001   FFmpeg + PySceneDetect                 │  │
│  │    • Semaphore(1) guard                                       │  │
│  │    • downloads from Azure Blob, uploads frames to Azure Blob  │  │
│  │                                                               │  │
│  │  sop-frontend  :5173   React SPA                              │  │
│  └───────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘

External services:
  Supabase  — PostgreSQL :6543 + Auth/JWKS
  Azure Blob — infsop container (video + frames + exports)
  Gemini API — transcription + classification
  SharePoint — source recordings
```

---

## What This Sprint Fixes

| # | Gap | Fix |
|---|-----|-----|
| G1 | `/api/extract` unauthenticated (SSRF risk) | New `require_internal_key` dependency |
| G2 | CORS broken — wildcard + credentials rejected by browsers | Wire `settings.cors_origins` into middleware |
| G3 | cloudflared crashes silently, never starts in dev | Move to dedicated `sop-tunnel` container with `restart: always` |
| G4 | sop-extractor port 8001 exposed in production | Remove from prod compose, keep only in dev |
| G5 | No concurrency guard — 2 simultaneous jobs = OOM | `asyncio.Semaphore(1)` + HTTP 503 |

**Container changes:**
- `sop-api` — Remove LibreOffice (~500 MB), remove cloudflared, simplify CMD
- `sop-extractor` — Gate Chromium + Node.js behind `INSTALL_MERMAID=false` build arg (~500 MB savings)
- `sop-tunnel` — New dedicated container: cloudflared only, `restart: always`

---

## File Map

### Modified
| File | Change |
|------|--------|
| `sop-platform/docker-compose.yml` | Add `sop-tunnel` service, remove `8001:8001` from extractor, remove `TUNNEL_TOKEN` from sop-api env |
| `sop-platform/docker-compose.dev.yml` | Add `8001:8001` to extractor dev override, simplify sop-api override |
| `sop-platform/api/Dockerfile` | Remove LibreOffice + cloudflared, change CMD to direct uvicorn |
| `sop-platform/api/start.sh` | Delete (no longer needed) |
| `sop-platform/api/app/config.py` | Add `internal_api_key` field, remove hardcoded supabase_url default |
| `sop-platform/api/app/main.py` | Fix CORS (use `settings.cors_origins`), apply auth to `/api/extract` + diagnostics |
| `sop-platform/extractor/Dockerfile` | Gate Chromium/Node behind `ARG INSTALL_MERMAID=false` |
| `sop-platform/extractor/app/main.py` | Add `asyncio.Semaphore(1)`, return 503 when busy |
| `sop-platform/.env.example` | Add `INTERNAL_API_KEY` |
| `sop-platform/.env` | Add `INTERNAL_API_KEY=<generated-secret>` |

### Created
| File | Purpose |
|------|---------|
| `sop-platform/api/app/dependencies/pipeline_auth.py` | `require_internal_key` FastAPI dependency |

---

## Pre-Sprint: Bring Down Containers

```bash
cd "d:/CloudNavision/1. Projects/SOP/SOP Automation System/sop-platform"
docker compose down --rmi local
```

Expected output:
```
[+] Running 3/3
 ✔ Container sop-extractor  Removed
 ✔ Container sop-api        Removed
 ✔ Container sop-frontend   Removed
 ✔ Network sop-network      Removed
```

`--rmi local` removes locally-built images so the next `docker compose up --build` starts clean.

---

## Task 1 — Add `INTERNAL_API_KEY` to config and env files
**Time:** 3 min | **Files:** `config.py`, `.env.example`, `.env`

### 1a. Generate a secret (run this once, save the output)
```bash
python -c "import secrets; print(secrets.token_hex(32))"
# Example output: a3f7c2e8d1b4a9f0e6c3d2b5a8f1e4c7d0b3a6f9e2c5b8a1d4e7f0c3b6a9d2e5
```
Copy this value — you will use it in the `.env` file and in n8n's HTTP node headers.

### 1b. Edit `sop-platform/api/app/config.py`

**Old (lines 4–19):**
```python
class Settings(BaseSettings):
    # Supabase transaction pooler — port 6543, not 5432
    database_url: str = "postgresql+asyncpg://postgres.xxxxx:password@aws-0-region.pooler.supabase.com:6543/postgres"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    azure_blob_base_url: str = ""
    extractor_url: str = "http://sop-extractor:8001"
    n8n_webhook_base_url: str = ""
    supabase_url: str = "https://hzluuqhbkiblmojxgbab.supabase.co"  # used to derive JWKS URL
    supabase_jwt_secret: str = ""  # kept for reference; verification now uses JWKS/ES256
```

**New:**
```python
class Settings(BaseSettings):
    # Database
    database_url: str = ""
    # CORS — comma-separated list, set via env var
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    # Azure
    azure_blob_base_url: str = ""
    azure_blob_sas_token: str = ""
    # Services
    extractor_url: str = "http://sop-extractor:8001"
    n8n_webhook_base_url: str = ""
    # Supabase auth — URL used to derive JWKS endpoint
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    # Pipeline security — shared secret between n8n and this API
    # n8n sends: x-internal-key: <this value>
    # Generate with: python -c "import secrets; print(secrets.token_hex(32))"
    internal_api_key: str = ""
```

### 1c. Add to `sop-platform/.env.example`

Add after the `N8N_WEBHOOK_BASE_URL` line:
```dotenv
# ── Pipeline Security ──────────────────────────────────────
# Shared secret between n8n and sop-api — prevents unauthorized extraction jobs
# Generate: python -c "import secrets; print(secrets.token_hex(32))"
# n8n HTTP node must send header: x-internal-key: <this value>
INTERNAL_API_KEY=
```

### 1d. Add to `sop-platform/.env`

Add the generated secret value:
```dotenv
INTERNAL_API_KEY=<paste-your-generated-secret-here>
```

### Verify
```bash
cd sop-platform/api
python -c "from app.config import settings; print('internal_api_key:', bool(settings.internal_api_key))"
# Expected: internal_api_key: True
```

---

## Task 2 — Create `require_internal_key` dependency (G1 fix)
**Time:** 5 min | **File:** `sop-platform/api/app/dependencies/pipeline_auth.py`

### Create new file:
```python
"""
Pipeline auth dependency — Phase 3+

Validates the x-internal-key header on pipeline endpoints called by n8n.
This is separate from user JWT auth — n8n is a service, not a user.

Usage:
    @app.post("/api/extract", dependencies=[Depends(require_internal_key)])
"""

import logging
from typing import Annotated

from fastapi import Depends, Header, HTTPException

from app.config import settings

logger = logging.getLogger(__name__)


async def require_internal_key(
    x_internal_key: Annotated[str | None, Header()] = None,
) -> None:
    """
    Validates x-internal-key header against INTERNAL_API_KEY env var.
    Returns None on success. Raises 401 on missing/invalid key.
    Returns 500 if INTERNAL_API_KEY is not configured (misconfiguration guard).
    """
    if not settings.internal_api_key:
        logger.error("[PIPELINE_AUTH] INTERNAL_API_KEY is not configured — rejecting all pipeline requests")
        raise HTTPException(
            status_code=500,
            detail="Server misconfiguration: INTERNAL_API_KEY not set",
        )
    if x_internal_key != settings.internal_api_key:
        logger.warning("[PIPELINE_AUTH] Invalid or missing x-internal-key header")
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing x-internal-key header",
        )
```

### Manual verification (before wiring into routes):
```bash
cd sop-platform/api
python -c "from app.dependencies.pipeline_auth import require_internal_key; print('import ok')"
# Expected: import ok
```

---

## Task 3 — Fix CORS and apply auth to routes (G1 + G2 fix)
**Time:** 5 min | **File:** `sop-platform/api/app/main.py`

### Replace the CORS block and update route decorators:

**Old CORS block (lines 27–35):**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**New CORS block:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,   # reads CORS_ORIGINS env var
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Add import at top of file** (after existing imports):
```python
from app.config import settings
from app.dependencies.pipeline_auth import require_internal_key
```

**Old `/api/extract` decorator (line 86):**
```python
@app.post("/api/extract", tags=["pipeline"])
async def proxy_extract(request: Request) -> Any:
```

**New `/api/extract` decorator:**
```python
@app.post("/api/extract", tags=["pipeline"], dependencies=[Depends(require_internal_key)])
async def proxy_extract(request: Request) -> Any:
```

**Old `/api/test-db` decorator (line 70):**
```python
@app.get("/api/test-db", tags=["diagnostics"])
async def test_db() -> dict[str, Any]:
```

**New:**
```python
@app.get("/api/test-db", tags=["diagnostics"], dependencies=[Depends(require_internal_key)])
async def test_db() -> dict[str, Any]:
```

**Old `/api/test-extractor` decorator (line 101):**
```python
@app.get("/api/test-extractor", tags=["diagnostics"])
async def test_extractor() -> dict[str, Any]:
```

**New:**
```python
@app.get("/api/test-extractor", tags=["diagnostics"], dependencies=[Depends(require_internal_key)])
async def test_extractor() -> dict[str, Any]:
```

**Add `Depends` to the imports line:**
```python
from fastapi import FastAPI, Request, Depends
```

### Verify (syntax check):
```bash
cd sop-platform/api
python -c "from app.main import app; print('routes:', len(app.routes))"
# Expected: routes: <some number, no ImportError>
```

---

## Task 4 — Add concurrency guard to extractor (G5 fix)
**Time:** 5 min | **File:** `sop-platform/extractor/app/main.py`

### Add semaphore at module level (after the `logger = ...` line, line 21):

```python
# ── Concurrency guard ─────────────────────────────────────────────────────────
# One extraction job at a time — a single 45-min recording can be 2-3 GB.
# Two simultaneous jobs risk OOM within the 4 GB container memory limit.
_extraction_semaphore = asyncio.Semaphore(1)
```

### Replace the `/extract` endpoint body:

**Old (lines 147–162):**
```python
@app.post("/extract", response_model=ExtractResponse, tags=["extraction"])
async def extract(req: ExtractRequest) -> ExtractResponse:
    """
    Full frame extraction pipeline:
      1. Download MP4 from Azure Blob
      2. For each screen_share_period: FFmpeg crop → PySceneDetect → frame capture
      3. imagehash phash deduplication
      4. Upload USEFUL frames to Azure Blob
      5. Return frame list + stats
    """
    try:
        result = await asyncio.to_thread(_run_extraction, req)
        return result
    except Exception as exc:
        logger.exception("Extraction failed for sop_id=%s", req.sop_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
```

**New:**
```python
@app.post("/extract", response_model=ExtractResponse, tags=["extraction"])
async def extract(req: ExtractRequest) -> ExtractResponse:
    """
    Full frame extraction pipeline:
      1. Download MP4 from Azure Blob
      2. For each screen_share_period: FFmpeg crop → PySceneDetect → frame capture
      3. imagehash phash deduplication
      4. Upload USEFUL frames to Azure Blob
      5. Return frame list + stats

    Concurrency: single-job semaphore. Returns 503 if already busy.
    """
    if _extraction_semaphore.locked():
        logger.warning("Extraction already in progress — rejecting sop_id=%s", req.sop_id)
        raise HTTPException(
            status_code=503,
            detail="Extractor busy — another extraction is in progress. Retry in 60 seconds.",
            headers={"Retry-After": "60"},
        )
    async with _extraction_semaphore:
        try:
            result = await asyncio.to_thread(_run_extraction, req)
            return result
        except Exception as exc:
            logger.exception("Extraction failed for sop_id=%s", req.sop_id)
            raise HTTPException(status_code=500, detail=str(exc)) from exc
```

### Verify (syntax check):
```bash
cd sop-platform/extractor
python -c "from app.main import app; print('extractor routes:', len(app.routes))"
# Expected: extractor routes: <number, no error>
```

---

## Task 5 — Slim the API Dockerfile (remove LibreOffice + cloudflared)
**Time:** 5 min | **File:** `sop-platform/api/Dockerfile`

**Replace entire file with:**
```dockerfile
# ============================================================
# SOP Platform — API Dockerfile
# FastAPI + SQLAlchemy + Pillow
# Lean image — no LibreOffice (Phase 8), no cloudflared (sop-tunnel container)
# ============================================================
FROM python:3.11-slim

WORKDIR /app

# System dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Also delete start.sh (no longer needed):
```bash
rm "sop-platform/api/start.sh"
```

### Add SUPABASE_URL alias to `.env` and `.env.example`

pydantic-settings reads `SUPABASE_URL` from env (field name = `supabase_url`), but the existing `.env` only has `VITE_SUPABASE_URL`. Add an alias so both local verification and Docker work:

In `.env`, add:
```dotenv
# Alias for sop-api — pydantic-settings reads SUPABASE_URL (not VITE_SUPABASE_URL)
SUPABASE_URL=https://hzluuqhbkiblmojxgbab.supabase.co
```

In `.env.example`, add after `VITE_SUPABASE_URL=`:
```dotenv
# Backend alias — must match VITE_SUPABASE_URL value
SUPABASE_URL=${VITE_SUPABASE_URL}
```

### Update api/requirements.txt — remove python-docx (Phase 8, not needed yet):

**Remove this line from requirements.txt:**
```
python-docx==1.1.2
```

The file should now be:
```
fastapi==0.115.0
uvicorn[standard]==0.30.0
sqlalchemy[asyncio]==2.0.35
asyncpg==0.30.0
pydantic==2.9.0
pydantic-settings==2.5.0
Pillow==10.4.0
python-multipart==0.0.9
httpx==0.27.0
PyJWT[crypto]==2.9.0
cryptography==43.0.3
```

---

## Task 6 — Gate Chromium/Node in extractor Dockerfile (remove Phase 5 bloat)
**Time:** 5 min | **File:** `sop-platform/extractor/Dockerfile`

**Replace entire file with:**
```dockerfile
# ============================================================
# SOP Platform — Frame Extractor Dockerfile
# FFmpeg + PySceneDetect + OpenCV + imagehash
#
# Phase 5 (Mermaid + Chromium): build with INSTALL_MERMAID=true
#   docker build --build-arg INSTALL_MERMAID=true ...
#
# Memory limit: 4G (enforced via docker-compose.yml deploy.resources)
# ============================================================
FROM python:3.11-slim

ARG INSTALL_MERMAID=false

WORKDIR /app

# Core system dependencies (always installed)
# Note: libgl1 replaces libgl1-mesa-glx on Debian bookworm
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Phase 5 only: Chromium + Node.js + Mermaid CLI
# Install only when INSTALL_MERMAID=true
RUN if [ "$INSTALL_MERMAID" = "true" ]; then \
    apt-get update && apt-get install -y gnupg chromium && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g @mermaid-js/mermaid-cli && \
    echo '{"executablePath":"/usr/bin/chromium","args":["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage"]}' > /app/puppeteer.config.json && \
    rm -rf /var/lib/apt/lists/*; \
fi

# Configure Puppeteer paths (no-op if Chromium not installed)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY . .

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
```

---

## Task 7 — Rebuild docker-compose.yml (G3 + G4 fix)
**Time:** 10 min | **File:** `sop-platform/docker-compose.yml`

**Replace entire file with:**
```yaml
# ============================================================
# SOP Automation Platform — Docker Compose (Production)
#
# 4 containers:
#   sop-frontend   — React SPA (static files, port 5173)
#   sop-api        — FastAPI REST API (port 8000)
#   sop-extractor  — FFmpeg + PySceneDetect (internal only, NO host port)
#   sop-tunnel     — Cloudflare Tunnel (connects soptest.cloudnavision.com → sop-api:8000)
#
# External services (not containerised):
#   Supabase   — PostgreSQL :6543 (transaction pooler) + Auth
#   n8n        — Cloud-hosted workflow orchestration
#   Azure Blob — Video + frame + export storage
#
# Run:  docker compose up --build
# Dev:  docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
# ============================================================

services:

  # ──────────────────────────────────────────────────────────
  # Cloudflare Tunnel
  # Dedicated container — independent lifecycle from the API.
  # Routes (configured in Cloudflare Zero Trust dashboard):
  #   soptest.cloudnavision.com  → http://sop-api:8000
  #   sop-ui.cloudnavision.com   → http://sop-frontend:5173  (optional)
  #
  # Only starts when profile "tunnel" is active:
  #   Production: docker compose --profile tunnel up -d
  #   Dev:        docker compose up -d   (no --profile tunnel → skipped)
  #
  # This prevents crash-loop on dev machines without a tunnel token.
  # ──────────────────────────────────────────────────────────
  sop-tunnel:
    image: cloudflare/cloudflared:latest
    container_name: sop-tunnel
    restart: always
    profiles: ["tunnel"]
    command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
    networks:
      - sop-network
    depends_on:
      sop-api:
        condition: service_healthy

  # ──────────────────────────────────────────────────────────
  # React SPA — Vite dev server (dev) / serve static (prod)
  # ──────────────────────────────────────────────────────────
  sop-frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      target: prod
      args:
        VITE_API_URL: ${VITE_API_URL:-http://localhost:8000}
        VITE_SUPABASE_URL: ${VITE_SUPABASE_URL}
        VITE_SUPABASE_ANON_KEY: ${VITE_SUPABASE_ANON_KEY}
    container_name: sop-frontend
    environment:
      VITE_API_URL: ${VITE_API_URL:-http://localhost:8000}
      VITE_SUPABASE_URL: ${VITE_SUPABASE_URL}
      VITE_SUPABASE_ANON_KEY: ${VITE_SUPABASE_ANON_KEY}
    ports:
      - "5173:5173"
    networks:
      - sop-network

  # ──────────────────────────────────────────────────────────
  # FastAPI — Backend REST API
  # Lean image — no LibreOffice, no cloudflared.
  # Connects to Supabase (external PostgreSQL :6543).
  # ──────────────────────────────────────────────────────────
  sop-api:
    build:
      context: ./api
      dockerfile: Dockerfile
    container_name: sop-api
    environment:
      DATABASE_URL: ${DATABASE_URL}
      CORS_ORIGINS: ${CORS_ORIGINS}
      SUPABASE_URL: ${VITE_SUPABASE_URL}
      SUPABASE_JWT_SECRET: ${SUPABASE_JWT_SECRET}
      AZURE_BLOB_BASE_URL: ${AZURE_BLOB_BASE_URL:-}
      AZURE_BLOB_SAS_TOKEN: ${AZURE_BLOB_SAS_TOKEN:-}
      N8N_WEBHOOK_BASE_URL: ${N8N_WEBHOOK_BASE_URL:-}
      GEMINI_API_KEY: ${GEMINI_API_KEY:-}
      GOOGLE_VISION_API_KEY: ${GOOGLE_VISION_API_KEY:-}
      INTERNAL_API_KEY: ${INTERNAL_API_KEY}
    ports:
      - "8000:8000"
    volumes:
      - ./data:/data
    healthcheck:
      test: [ "CMD", "curl", "-f", "http://localhost:8000/health" ]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
    networks:
      - sop-network

  # ──────────────────────────────────────────────────────────
  # Frame Extractor — FFmpeg + PySceneDetect + imagehash
  # INTERNAL ONLY — no host port mapping in production.
  # Accessed by sop-api at http://sop-extractor:8001 (Docker DNS).
  # Chromium/Node (Phase 5 Mermaid) not installed by default.
  # ──────────────────────────────────────────────────────────
  sop-extractor:
    build:
      context: ./extractor
      dockerfile: Dockerfile
      args:
        INSTALL_MERMAID: "false"
    container_name: sop-extractor
    # No ports: section — internal only. Use docker-compose.dev.yml to expose 8001 locally.
    volumes:
      - ./data:/data
    deploy:
      resources:
        limits:
          memory: 4G
    healthcheck:
      test: [ "CMD", "curl", "-f", "http://localhost:8001/health" ]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    networks:
      - sop-network

# ──────────────────────────────────────────────────────────
networks:
  sop-network:
    driver: bridge
```

---

## Task 8 — Update docker-compose.dev.yml
**Time:** 5 min | **File:** `sop-platform/docker-compose.dev.yml`

**Replace entire file with:**
```yaml
# ============================================================
# Dev overrides — hot reload + local port access for testing
# Usage: docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
#
# Dev differences from prod:
#   - sop-tunnel: skipped if CLOUDFLARE_TUNNEL_TOKEN is empty (dev default)
#   - sop-api: hot reload via uvicorn --reload
#   - sop-extractor: port 8001 exposed for direct curl testing
#   - sop-frontend: hot reload via vite dev server
# ============================================================

services:

  sop-frontend:
    build:
      target: dev
    volumes:
      - ./frontend:/app
      - /app/node_modules
    command: npm run dev -- --host 0.0.0.0

  sop-api:
    volumes:
      - ./api:/app
      - ./data:/data
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  sop-extractor:
    ports:
      - "8001:8001"     # exposed for local testing only — NOT in production compose
    volumes:
      - ./extractor:/app
      - ./data:/data
    command: uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

---

## Task 9 — Add SUPABASE_URL to docker-compose environment pass-through
**Time:** 2 min

The `config.py` now uses `supabase_url` from env (no default). The API container must receive it.

In the new `docker-compose.yml` Task 7 above, `SUPABASE_URL: ${VITE_SUPABASE_URL}` is already included. **Verify `.env` has `VITE_SUPABASE_URL` set** — it should (it was already there for the frontend).

The `config.py` `supabase_url` field maps to env var `SUPABASE_URL` (pydantic-settings lowercases the env var name). Confirm the mapping works:

```bash
# In sop-api container after rebuild:
docker exec sop-api python -c "from app.config import settings; print(settings.supabase_url)"
# Expected: https://hzluuqhbkiblmojxgbab.supabase.co
```

---

## Task 10 — Build, Start, and Verify All Containers

### Step 1: Build from scratch
```bash
cd "d:/CloudNavision/1. Projects/SOP/SOP Automation System/sop-platform"
docker compose build --no-cache
```

Expected — all 4 build stages succeed:
```
[+] Building
 => sop-tunnel    — pulls cloudflare/cloudflared:latest
 => sop-frontend  — node:20-slim build
 => sop-api       — python:3.11-slim (NO libreoffice, NO cloudflared)
 => sop-extractor — python:3.11-slim + ffmpeg (NO chromium, NO node)
```

Watch for image sizes (extractor should now be ~400 MB, API ~300 MB):
```bash
docker images | grep sop
```

### Step 2: Start (production mode)
```bash
# With tunnel (production VM — CLOUDFLARE_TUNNEL_TOKEN must be set in .env):
docker compose --profile tunnel up -d

# Without tunnel (dev / local testing):
docker compose up -d
```

### Step 3: Verify all 4 containers are healthy
```bash
docker compose ps
```

Expected:
```
NAME            STATUS
sop-frontend    Up (healthy or running)
sop-api         Up (healthy)
sop-extractor   Up (healthy)
sop-tunnel      Up
```

### Step 4: Verify sop-api health
```bash
curl http://localhost:8000/health
# Expected: {"status":"ok","service":"sop-api"}
```

### Step 5: Verify CORS fix — check response headers
```bash
curl -I -H "Origin: http://localhost:5173" http://localhost:8000/health
# Expected header: Access-Control-Allow-Origin: http://localhost:5173
# NOT: Access-Control-Allow-Origin: *
```

### Step 6: Verify G1 fix — /api/extract rejects unauthenticated requests
```bash
curl -s -X POST http://localhost:8000/api/extract \
  -H "Content-Type: application/json" \
  -d '{"sop_id":"test","video_url":"http://example.com/test.mp4"}'
# Expected: HTTP 401 {"detail":"Invalid or missing x-internal-key header"}
```

### Step 7: Verify G1 fix — /api/extract accepts valid key
```bash
# Replace YOUR_KEY with the value from your .env INTERNAL_API_KEY
curl -s -X POST http://localhost:8000/api/extract \
  -H "Content-Type: application/json" \
  -H "x-internal-key: YOUR_KEY" \
  -d '{"sop_id":"test","video_url":"http://invalid.example.com/test.mp4","screen_share_periods":[],"azure_sas_token":"test","azure_account":"test","azure_container":"test"}'
# Expected: HTTP 500 (proxy reaches extractor, fails on invalid URL — that is correct)
# NOT: HTTP 401
```

### Step 8: Verify G4 fix — port 8001 NOT accessible from host in prod mode
```bash
curl http://localhost:8001/health
# Expected: Connection refused  (extractor not exposed to host)
```

### Step 9: Verify diagnostics require auth
```bash
curl http://localhost:8000/api/test-db
# Expected: HTTP 401 {"detail":"Invalid or missing x-internal-key header"}
```

### Step 10: Verify sop-extractor is reachable internally via sop-api
```bash
curl -H "x-internal-key: YOUR_KEY" http://localhost:8000/api/test-extractor
# Expected: {"status":"ok","extractor":{"status":"ok","service":"sop-extractor","ffmpeg":true,"mermaid_cli":false}}
# mermaid_cli: false is correct (INSTALL_MERMAID=false)
```

### Step 11: Verify tunnel (only if started with --profile tunnel)
```bash
docker logs sop-tunnel | head -20
# Expected: "Registered tunnel connection ..." (4 connections)

# If token not set / dev mode — tunnel container simply doesn't start (correct)
```

---

## Task 11 — Dev mode verification

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d

# Verify extractor IS accessible on port 8001 in dev mode:
curl http://localhost:8001/health
# Expected: {"status":"ok","service":"sop-extractor","ffmpeg":true,"mermaid_cli":false}

# Verify sop-api has hot reload:
docker logs sop-api | grep "Will watch"
# Expected: Watching for file changes...
```

---

## Task 12 — Configure Cloudflare Zero Trust for sop-tunnel container

This is the **most critical Cloudflare change** in the sprint. Moving cloudflared from inside
sop-api to a separate container changes what `localhost` means. The dashboard URL must be updated.

### Why this change is required

| | Before (cloudflared inside sop-api) | After (cloudflared in sop-tunnel container) |
|-|--------------------------------------|----------------------------------------------|
| Where cloudflared runs | Inside sop-api container | Its own container in sop-network |
| `localhost:8000` resolves to | sop-api (same container) | sop-tunnel itself (wrong!) |
| Correct target URL | `http://localhost:8000` | `http://sop-api:8000` (Docker DNS) |

**If you forget this step, the tunnel connects but all requests get "connection refused".**

### Full n8n → Cloudflare → containers traffic flow (after sprint)

```
n8n (azuren8n.cloudnavision.com — self-hosted on Azure)
  │
  │  POST https://soptest.cloudnavision.com/api/extract
  │  Header: x-internal-key: <INTERNAL_API_KEY>
  ▼
Cloudflare Edge
  │  WAF Custom Rule: if header x-internal-key exists → Skip Bot Fight Mode  ← Step 12b
  ▼
QUIC Tunnel (outbound from Azure VM)
  ▼
sop-tunnel container (cloudflare/cloudflared, in sop-network)
  │  Ingress rule: soptest.cloudnavision.com → http://sop-api:8000  ← Step 12a
  ▼
sop-api container :8000 (FastAPI)
  │  Validates: x-internal-key header == settings.internal_api_key  ← G1 fix (Task 3)
  │  Proxies to: http://sop-extractor:8001/extract  (Docker internal DNS)
  ▼
sop-extractor container :8001 (FFmpeg + PySceneDetect)
  │  Semaphore guard (G5 fix)
  │  Downloads video from Azure Blob, extracts frames, uploads to Azure Blob
  ▼
Returns ExtractResponse JSON → sop-api → Cloudflare → n8n
```

---

### Step 12a — Update tunnel ingress URL in Cloudflare Zero Trust dashboard

1. Go to [dash.teams.cloudflare.com](https://dash.teams.cloudflare.com)
2. Navigate to: **Networks → Tunnels → your tunnel → Configure → Public Hostnames**
3. Find the existing route:
   ```
   soptest.cloudnavision.com  →  http://localhost:8000
   ```
4. Edit it — change the Service URL to:
   ```
   soptest.cloudnavision.com  →  http://sop-api:8000
   ```
   (Docker DNS name, not localhost — cloudflared is now in sop-tunnel, not inside sop-api)

5. Save.

**Optional — add frontend route while you're here:**
Click "Add a public hostname":
```
Subdomain: sop-ui   Domain: cloudnavision.com   Service: http://sop-frontend:5173
```

---

### Step 12b — Add WAF Skip Rule to bypass Bot Fight Mode for n8n (Phase 3 unblock)

This is the fix for the Bot Fight Mode blocker documented in `BLOCKERS.md`.

1. Go to: **Websites → soptest.cloudnavision.com → Security → WAF → Custom Rules**
2. Click **Create Rule**
3. Configure:
   - **Rule name:** `Allow n8n pipeline calls`
   - **Field:** `Request Header`
   - **Header name:** `x-internal-key`
   - **Operator:** `is present`  ← simplest form; or use "equals" with your key value
   - **Action:** `Skip` → check **Bot Fight Mode**
4. Save and deploy.

After this rule is active, n8n requests with the `x-internal-key` header bypass Bot Fight Mode.
Without it, n8n still gets `HTTP 403 cType: managed`.

**Verify (from a machine that isn't you — or use n8n itself):**
```bash
# Simulates n8n — automated HTTP client, no JS execution
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://soptest.cloudnavision.com/api/extract \
  -H "x-internal-key: YOUR_INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"test":true}'
# Expected: 422 (FastAPI validation error — body wrong, but NOT 403 Bot Fight Mode)
# A 422 means the request got through Cloudflare and reached FastAPI ✅
```

---

### Step 12c — Update n8n Workflow 2 "Call Frame Extractor" node

The `x-internal-key` value must now match `INTERNAL_API_KEY` from `.env` (the secret generated in Task 1a). The old hardcoded value `sop-pipeline-2024` no longer works.

**n8n is self-hosted at `azuren8n.cloudnavision.com`** (confirmed from WAF rule expression).

In n8n (azuren8n.cloudnavision.com):
1. Open **Workflow 2 — Frame Extraction**
2. Find the **"Call Frame Extractor"** HTTP Request node
3. Update:
   - **URL:** `https://soptest.cloudnavision.com/api/extract` (unchanged)
   - **Header:** `x-internal-key` → **change value** to the secret from Task 1a
4. Save and activate the workflow.

**Verify end-to-end from n8n:**
Trigger a manual test run of Workflow 2 with a known `sop_id`.
Expected flow:
```
n8n executes HTTP node
  → 200 OK with ExtractResponse JSON (if video URL valid)
  → OR 422 (if test body malformed — still means tunnel + auth is working)
  → NOT 403 Bot Fight Mode
  → NOT 401 x-internal-key invalid
```

---

### Step 12d — Verify sop-tunnel logs show 4 registered connections

```bash
docker logs sop-tunnel --tail 20
```

Expected output:
```
INF Registered tunnel connection connIndex=0 ...
INF Registered tunnel connection connIndex=1 ...
INF Registered tunnel connection connIndex=2 ...
INF Registered tunnel connection connIndex=3 ...
```

4 connections = tunnel is healthy. If you see fewer, wait 30 seconds and check again.

---

## Task 13 — Commit

```bash
cd "d:/CloudNavision/1. Projects/SOP/SOP Automation System"
git add sop-platform/docker-compose.yml \
        sop-platform/docker-compose.dev.yml \
        sop-platform/api/Dockerfile \
        sop-platform/api/requirements.txt \
        sop-platform/api/app/config.py \
        sop-platform/api/app/main.py \
        sop-platform/api/app/dependencies/pipeline_auth.py \
        sop-platform/extractor/Dockerfile \
        sop-platform/extractor/app/main.py \
        sop-platform/.env.example \
        docs/superpowers/

# Confirm start.sh deletion:
git rm sop-platform/api/start.sh

git commit -m "sprint: container redesign + 5 critical security fixes

Container changes:
- sop-api: remove LibreOffice (~500MB), remove cloudflared sideloading
- sop-extractor: gate Chromium/Node behind INSTALL_MERMAID=false build arg
- sop-tunnel: new dedicated cloudflared container (restart: always)
- remove port 8001 host binding from production compose

Security fixes:
- G1: /api/extract now validates x-internal-key header (FastAPI, not just WAF)
- G2: CORS wired to settings.cors_origins (was hardcoded wildcard)
- G3: cloudflared in dedicated container with restart policy (was unsupervised bash &)
- G4: sop-extractor:8001 not exposed to host in production (only in dev override)
- G5: asyncio.Semaphore(1) in extractor — 503 Retry-After on concurrent requests"
```

---

## Post-Sprint Checklist

### Containers
- [ ] All 4 containers start and pass healthchecks (`docker compose ps`)
- [ ] `docker images | grep sop` — API image < 350 MB, extractor image < 450 MB
- [ ] Dev mode: port 8001 accessible, hot reload working

### Security fixes
- [ ] `curl /api/extract` without key → 401
- [ ] `curl /api/extract` with key → reaches extractor (500 on bad URL is correct)
- [ ] `curl localhost:8001` → connection refused (extractor not exposed in prod)
- [ ] CORS response header shows specific origin, not `*`
- [ ] `curl /api/test-db` without key → 401

### Cloudflare + n8n integration
- [ ] Cloudflare Zero Trust dashboard: tunnel URL updated to `http://sop-api:8000` (not localhost)
- [ ] Cloudflare WAF Skip Rule active for `x-internal-key` header → Bot Fight Mode bypassed
- [ ] `docker logs sop-tunnel` shows 4 registered connections
- [ ] n8n Workflow 2 `x-internal-key` header updated to new `INTERNAL_API_KEY` value
- [ ] n8n test run: HTTP node gets 200/422 (NOT 403 Bot Fight Mode, NOT 401 key invalid)

### Secrets hygiene
- [ ] `INTERNAL_API_KEY` added to `.env` with generated value
- [ ] `.env` is in `.gitignore` and NOT committed
- [ ] Old hardcoded key `sop-pipeline-2024` removed from n8n

---

## Rollback (if needed)

```bash
# Stop and remove new containers + images
docker compose down --rmi local

# Revert all file changes
git checkout HEAD -- sop-platform/

# Restore start.sh
git checkout HEAD -- sop-platform/api/start.sh

# Rebuild from last known good state
docker compose up --build -d
```

---

_Plan author: Claude Code + superpowers:code-reviewer_
_Next: dispatch subagent-driven-development or execute-plans_
