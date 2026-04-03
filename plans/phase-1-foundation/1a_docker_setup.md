# Phase 1a: Docker Infrastructure Setup ✅ Complete

### Objective
Set up all Docker containers locally with health checks, cross-container communication, shared volume, and external service connectivity.

### Architecture Evolution

**Initial setup (v1.0):** 6 Docker containers — frontend+nginx, postgres, API, extractor, n8n, cloudflare-tunnel

**Updated setup (v2.0) after TL feedback:** 3 Docker containers + 3 external services
- PostgreSQL → Supabase (transaction pooling, port 6543)
- Frontend nginx → Cloudflare sideloading (cloudflared daemon on host)
- n8n container → Externally hosted n8n (webhook communication)
- Cloudflare tunnel container → Sideloaded cloudflared daemon on host

### What Was Built

**3 Docker Containers:**

| Container | Image | Port | Purpose |
|---|---|---|---|
| sop-frontend | Node 20 (Vite dev / serve prod) | 5173 | React SPA — no nginx, Cloudflare handles HTTPS |
| sop-api | Python 3.11 + LibreOffice + Pillow | 8000 | FastAPI REST API, connects to Supabase |
| sop-extractor | Python 3.11 + FFmpeg + Node + Mermaid CLI | 8001 | Video processing service |

**External Services (not in Docker):**

| Service | Purpose | Connection |
|---|---|---|
| Supabase | PostgreSQL database | Transaction pooler, port 6543 |
| n8n | Pipeline orchestration | HTTP webhooks |
| Cloudflare Tunnel | HTTPS exposure | Sideloaded cloudflared daemon on host |
| Azure Blob Storage | File storage | REST API + SAS tokens |

**Files Created:**
- `docker-compose.yml` — 3 services on sop-network bridge
- `docker-compose.dev.yml` — hot reload overrides (volume mounts + --reload)
- `.env.example` — environment variables including Supabase connection string, n8n webhook URL, VITE_API_URL
- `.gitignore` / `.dockerignore`
- `frontend/Dockerfile` — 3-stage: dev / build / serve (no nginx)
- `api/Dockerfile` — Python 3.11 + build-essential + libpq-dev + fonts-dejavu + LibreOffice + curl
- `extractor/Dockerfile` — Python 3.11 + FFmpeg + OpenCV deps + Node.js 20 + Mermaid CLI
- `schema/001_initial_schema.sql` — 6 enums, 12 tables, triggers, pg_trgm index (applied to Supabase via SQL Editor)
- `scripts/verify_infrastructure.sh` — 11-point verification with coloured output
- `data/` — shared volume with uploads/, frames/, exports/, templates/

**Scaffolded Apps (health endpoints only):**
- Frontend: React app showing "SOP Automation Platform" + API health status
- API: /health, /api/health, /api/test-db (Supabase connectivity), /api/test-extractor
- Extractor: /health, /test-ffmpeg, /test-data-volume

### How to Run
```bash
cd sop-platform
cp .env.example .env
# Edit .env — fill in Supabase connection string and other values
sed -i 's/\r$//' .env    # Fix Windows line endings if needed
sudo docker compose up -d
sudo bash scripts/verify_infrastructure.sh   # 11/11 should pass
```

### How to Run in Dev Mode (hot reload)
```bash
sudo docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

### Verification Result
11/11 checks passing:
- 3 containers running (frontend, API, extractor)
- 3 health endpoints responding
- API → Supabase connection working
- API → Extractor cross-container connection working
- Frontend serves HTML at localhost:5173
- FFmpeg available in extractor
- Shared /data volume writable
- API reachable at localhost:8000

### Issues Encountered
| # | Issue | Fix |
|---|---|---|
| 1 | Docker not found in WSL | Enabled WSL integration in Docker Desktop settings |
| 2 | Permission denied on docker.sock | Used `sudo docker compose` |
| 3 | docker-compose.yml version warning | Removed obsolete `version` line |
| 4 | Windows line endings in scripts | `sed -i 's/\r$//' filename` |
| 5 | Windows line endings in .env | `sed -i 's/\r$//' .env` |
| 6 | Schema check false negative | Caused by .env line endings — fixed after sed |
| 7 | n8n tables in same database | Cosmetic — resolved when n8n container was removed |
| 8 | Architecture change (6→3 containers) | Removed sop-postgres, sop-n8n, sop-tunnel from docker-compose |
| 9 | npm ci missing package-lock.json | Ran `npm install` in frontend/ to generate it |
| 10 | Old containers lingering after compose update | `sudo docker stop` + `rm` then `docker compose up -d` |
| 11 | Frontend still running nginx after Dockerfile update | Rebuilt with `sudo docker compose up -d --build sop-frontend` |
