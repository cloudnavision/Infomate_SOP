# SOP Automation Platform — Architecture Review & Gap Analysis
**Date:** 2026-03-27
**Scope:** Full project — all phases, focus on container design and current architectural state
**Status:** Design document (no code changes yet — awaiting approval)

---

## 1. Current Architecture Map (As-Is)

```
┌─────────────────────────── INTERNET ──────────────────────────────────┐
│  Cloudflare Edge (soptest.cloudnavision.com)                            │
│    ⚠ Bot Fight Mode — BLOCKS n8n Phase 3 currently                    │
└──────────────────────────────┬────────────────────────────────────────┘
                               │ QUIC Tunnel
┌──────────────────────────────▼────────────────────────────────────────┐
│  Azure VM (single host)                                                 │
│                                                                         │
│  ┌── sop-network (Docker bridge) ──────────────────────────────────┐   │
│  │                                                                   │   │
│  │  sop-frontend   :5173  React + Vite (serve static in prod)      │   │
│  │  sop-api        :8000  FastAPI + cloudflared (sideloaded in CMD) │   │
│  │  sop-extractor  :8001  FFmpeg + PySceneDetect + mmdc + Chromium  │   │
│  │                                                                   │   │
│  │  Shared bind-mount: ./data → /data (uploads/frames/exports/tmpl) │   │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  cloudflared (host daemon config says so; actual impl is in-container)  │
└─────────────────────────────────────────────────────────────────────────┘

EXTERNAL SERVICES
  Supabase      — PostgreSQL :6543 (transaction pooler) + Auth/JWKS (ES256)
  n8n (cloud)   — Workflow orchestration (Workflows 1, 2, 3)
  Azure Blob    — infsop container (video, frames, exports)
  Gemini API    — AI Studio key (NOT Vertex AI) — transcription + classification
  SharePoint    — Source KT recordings (Graph API, OAuth2 "Saara - Sharepoint")
```

### Container Summary

| Container | Port (host) | Port (internal) | Purpose | Image size (approx) |
|-----------|-------------|-----------------|---------|---------------------|
| sop-frontend | 5173 | 5173 | React SPA (Vite dev / serve prod) | ~400 MB |
| sop-api | 8000 | 8000 | FastAPI CRUD + pipeline proxy + cloudflared tunnel | ~900 MB (LibreOffice adds ~500 MB) |
| sop-extractor | **8001** ← exposed in prod | 8001 | FFmpeg + PySceneDetect + imagehash + Mermaid/Chromium | ~1.2 GB (Chromium/Node adds ~500 MB) |

### Data Flow (Phase 2, operational)

```
SharePoint recording
  → n8n Workflow 1
  → Azure Blob PUT (infsop container)
  → Gemini File API (polling until ACTIVE)
  → Gemini transcription
  → Supabase: transcript_lines + sops + pipeline_runs
```

### Data Flow (Phase 3, blocked)

```
n8n Workflow 2
  → POST soptest.cloudnavision.com/api/extract   ← BLOCKED (Bot Fight Mode 403)
  → cloudflared tunnel → FastAPI /api/extract (no auth)
  → proxy → sop-extractor:8001/extract
  → FFmpeg crop + PySceneDetect + phash dedup
  → Azure Blob frames upload
  → return frame list
  → n8n: INSERT sop_steps
```

---

## 2. Database Schema Overview

13 tables. Core entity hierarchy:

```
users
  └── sops (master record — title, status, video_url, screen_share_periods)
        ├── sop_steps         (sequence, screenshot_url, timestamp, review_status)
        │     ├── step_callouts   (x/y coordinates, confidence, match_method)
        │     ├── step_clips      (Azure Blob MP4 URL, duration)
        │     └── step_discussions (AI-summarised Q&A from transcript)
        ├── transcript_lines  (speaker, timestamp, content → linked_step_id)
        ├── sop_sections      (AI-generated text/table/diagram per section_key)
        ├── pipeline_runs     (status enum, stage_results JSONB, cost tracking)
        ├── sop_versions      (full JSON snapshot per publish)
        ├── property_watchlist (Starboard Hotels-specific entity tracking)
        └── export_history    (DOCX/PDF/Markdown, Azure Blob URL)

section_templates  (17 predefined section keys — lookup table)
```

**Pipeline status flow:**
`queued → transcribing → detecting_screenshare → extracting_frames → deduplicating → classifying_frames → generating_annotations → extracting_clips → generating_sections → completed | failed`

---

## 3. Gap Analysis

Gaps are categorised by **severity** and **phase impact**.

---

### 🔴 CRITICAL — Fix Before Phase 3 Ships

#### G1 — `/api/extract` is unauthenticated (Security / SSRF risk)
- **Location:** [api/app/main.py:86-98](../../../sop-platform/api/app/main.py)
- **Problem:** No `Depends(require_*)` on the endpoint. Any internet request can POST arbitrary `video_url` values, triggering a 600-second download from any URL (SSRF). The caller also supplies `azure_sas_token` → frames can be exfiltrated to an attacker-controlled Azure container.
- **The x-internal-key header is NOT validated by FastAPI** — it only exists for the Cloudflare WAF Skip Rule, a different security boundary that can be bypassed by hitting port 8000 directly.
- **Fix:** Add a static secret check (`x-internal-key` validated against an env var) as a FastAPI dependency on this route. The Cloudflare WAF rule becomes defence-in-depth, not the primary control.

#### G2 — CORS wildcard + credentials is browser-rejected AND env var is wired wrong
- **Location:** [api/app/main.py:29-35](../../../sop-platform/api/app/main.py)
- **Problem:** `allow_origins=["*"]` with `allow_credentials=True` violates W3C CORS spec — browsers reject this combination. The `CORS_ORIGINS` env var is declared in docker-compose and read by `config.py`, but **never consumed in `main.py`**. The wiring is broken.
- **Fix:** Replace `allow_origins=["*"]` with `allow_origins=settings.cors_origins` (one line change).

#### G3 — cloudflared crashes silently; dev mode never starts tunnel
- **Location:** [api/start.sh:11](../../../sop-platform/api/start.sh), [docker-compose.dev.yml:22](../../../sop-platform/docker-compose.dev.yml)
- **Problem:** `cloudflared ... &` runs unsupervised as a bash background process. If it crashes, Docker healthcheck (which only tests `/health` → FastAPI) reports the container healthy while the tunnel is dead. In dev mode, `docker-compose.dev.yml` overrides CMD with direct `uvicorn --reload`, bypassing start.sh entirely → the tunnel never starts in dev. Dev and prod have fundamentally different process trees.
- **Fix:** Move cloudflared to a host-level systemd service (as the docker-compose.yml comment at line 6 already suggests). This gives it independent restart logic, logs, and health status.

#### G4 — sop-extractor port 8001 is host-mapped in the production compose file
- **Location:** [docker-compose.yml:91-92](../../../sop-platform/docker-compose.yml)
- **Problem:** The comment says "local development testing only" but the `8001:8001` binding is in the main production compose file. The extractor has no auth. Anyone who can reach the VM on port 8001 (if Azure NSG allows it) bypasses sop-api entirely.
- **Fix:** Remove `ports:` from sop-extractor in `docker-compose.yml`. Keep it only in `docker-compose.dev.yml`. The `sop-network` bridge gives sop-api access to `sop-extractor:8001` without host binding.

#### G5 — Extractor has no concurrency guard (OOM risk on simultaneous jobs)
- **Location:** [extractor/app/main.py:158](../../../sop-platform/extractor/app/main.py)
- **Problem:** `asyncio.to_thread(_run_extraction, req)` runs without a semaphore. Two simultaneous requests both download their videos to tempdir before processing. A 45-min Teams recording can be 2-3 GB. The container has a 4 GB memory limit. Two simultaneous extractions will OOM-kill the container with no graceful degradation.
- **Fix:** Add `asyncio.Semaphore(1)` at module level. Return HTTP 503 with `Retry-After` if semaphore cannot be acquired immediately.

---

### 🟠 HIGH — Address Before Phase 4 Begins

#### G6 — Extractor never writes pipeline_runs status (no observability)
- **Location:** [extractor/app/main.py:165-236](../../../sop-platform/extractor/app/main.py)
- **Problem:** The extractor does not update `pipeline_runs.status` on start, success, or failure. If extraction fails mid-job, n8n receives a 500 after 600 seconds, but the database still shows `status = extracting_frames`. A retry from n8n will re-extract and re-upload frames, overwriting Azure Blob objects silently. The `pipeline_runs` table exists specifically to track this — it's unused by the extractor.
- **Fix:** Have sop-api update `pipeline_runs.status = extracting_frames` when job starts, and call back (or have extractor call FastAPI) to set `completed` or `failed` with `error_message`.

#### G7 — No database migration tooling
- **Location:** [schema/001_initial_schema.sql](../../../sop-platform/schema/001_initial_schema.sql)
- **Problem:** Schema changes are manual SQL. No Alembic, no version tracking. Phase 4+ will require `ALTER TABLE` statements with no rollback path and no way to verify schema drift between environments.
- **Fix:** Add Alembic now while schema is small. Initial migration = current schema. The Supabase transaction pooler with `asyncpg` is supported by Alembic via `--compare-type`.

#### G8 — pipeline.py is a 4-line stub; no async job pattern
- **Location:** [api/app/routes/pipeline.py](../../../sop-platform/api/app/routes/pipeline.py)
- **Problem:** The 600-second synchronous proxy is a stopgap. Phase 5 adds section generation (multiple parallel Gemini calls), Phase 6 adds the SSE progress stream (VISUAL_INDEX #19). No foundation exists for this. An n8n retry loop against a slow endpoint risks duplicate processing.
- **Fix (Phase 4 design):** `/api/extract` enqueues a job, returns `{job_id}` immediately. Extractor processes async. n8n polls `GET /api/pipeline/{job_id}/status`. Frontend SSE connects to `GET /api/pipeline/{run_id}/progress`. PostgreSQL `pipeline_runs` is the job store (no Redis needed at this scale).

#### G9 — Dual user store with no sync mechanism
- **Location:** [api/app/dependencies/auth.py:94](../../../sop-platform/api/app/dependencies/auth.py)
- **Problem:** Supabase manages auth.users (authentication), local `users` table manages app roles (authorisation). No trigger or webhook syncs them. A new Supabase user gets `403 Access denied — user not registered` until an admin manually inserts a row into the local table. The error message gives no hint to the user about what happened.
- **Fix:** Document the provisioning procedure explicitly. Optionally: add a Supabase `auth.users` → `public.users` trigger via Supabase Edge Functions or a webhook. Or: allow auto-provisioning with `viewer` role on first login (security vs UX tradeoff to decide).

#### G10 — Diagnostic endpoints are unauthenticated and public
- **Location:** [api/app/main.py:70-115](../../../sop-platform/api/app/main.py)
- **Problem:** `/api/test-db`, `/api/test-extractor` have no auth. `/api/test-db` returns SOP count, leaking business data existence. `/api/test-extractor` confirms internal service topology.
- **Fix:** Add `Depends(require_admin)` to both diagnostic endpoints.

---

### 🟡 MEDIUM — Technical Debt, Fix Before Phase 6

#### G11 — LibreOffice in sop-api container is premature (~500 MB bloat)
- **Location:** [api/Dockerfile:15-16](../../../sop-platform/api/Dockerfile)
- **Problem:** Installed for Phase 8 (DOCX → PDF conversion). Not used until Phase 8. Makes the API image ~900 MB. Increases attack surface and build time for every Phase 3-7 iteration.
- **Fix:** Remove from api/Dockerfile. Re-add as a separate `sop-exporter` container in Phase 8, or use a Lambda/Function for PDF conversion.

#### G12 — Chromium + Node.js in sop-extractor is premature (~500 MB bloat)
- **Location:** [extractor/Dockerfile:14-32](../../../sop-platform/extractor/Dockerfile)
- **Problem:** Installed for Mermaid CLI (Phase 5 diagrams). `mermaid_renderer.py` and `clip_extractor.py` exist but have no connected endpoints. Phase 3 extractor only does FFmpeg + PySceneDetect + imagehash.
- **Fix:** Gate behind a build arg `ARG INSTALL_MERMAID=false`. Only pay the image cost when Phase 5 features activate.

#### G13 — Shared bind-mount volume not production-safe
- **Location:** [docker-compose.yml:70,93](../../../sop-platform/docker-compose.yml)
- **Problem:** `./data:/data` is a host bind-mount (not a named Docker volume). Not portable across hosts, no lifecycle management, no backup hook. If VM is replaced or containers are scaled, data is lost.
- **Fix:** Convert to named Docker volume (`sop-data`) for portability. Define a backup strategy (Azure Blob sync for `/data/exports`, `/data/templates`).

#### G14 — sop-frontend has no external routing path
- **Location:** [docker-compose.yml:27](../../../sop-platform/docker-compose.yml)
- **Problem:** Comment says "Cloudflare Tunnel sideloads this to the internet" but the actual tunnel routes only to `localhost:8000` (sop-api). `VITE_API_URL` defaults to `http://localhost:8000` — browser-relative, breaks if frontend is served from a different origin.
- **Fix:** Either add a second Cloudflare tunnel route (`sop.cloudnavision.com → localhost:5173`) or serve the static frontend through sop-api at `/` (nginx reverse proxy pattern). Clarify the production URL strategy.

#### G15 — `verify_aud: False` in JWT decoding
- **Location:** [api/app/dependencies/auth.py:60](../../../sop-platform/api/app/dependencies/auth.py)
- **Problem:** A JWT from any Supabase project would pass validation. Acceptable now (single project), but risks cross-project token reuse if external integrations are added in Phase 5+.
- **Fix:** Add `audience=["authenticated"]` before Phase 5.

#### G16 — `scene_score` always written as 0.0 in Phase 3
- **Location:** [extractor/app/scene_detector.py](../../../sop-platform/extractor/app/scene_detector.py)
- **Problem:** Placeholder value. Every `sop_steps` row written in Phase 3 will have `scene_score = 0.0`. When Phase 4 adds real scoring, existing records cannot be back-filled without knowing original scene detection metadata.
- **Fix:** Track this as a known data quality gap. Consider storing PySceneDetect's raw `ContentDetector` score (already available during detection) rather than a hardcoded 0.0.

#### G17 — No rate limiting on /api/extract
- **Problem:** A misconfigured n8n retry loop could flood the extractor with duplicate extraction requests. No Cloudflare rate limiting rule exists for this endpoint.
- **Fix:** Add a Cloudflare Rate Limiting rule: `/api/extract` → max 5 requests/minute/IP.

#### G18 — No per-SOP path isolation convention enforced in /data volume
- **Problem:** Frames written to Azure Blob use `{sop_id}/frames/frame_NNN.png` (correct), but nothing enforces this convention in `/data`. A future writer could pollute the shared namespace.
- **Fix:** Document and enforce the path convention before Phase 4 adds more writers.

---

## 4. Architecture Approaches

### Approach A — Targeted Security Patches (Minimal scope)

Fix only critical security and reliability issues without structural changes:
- Add `x-internal-key` validation middleware on `/api/extract`
- Apply `settings.cors_origins` to CORS middleware
- Remove port 8001 host binding from production compose
- Add `asyncio.Semaphore(1)` to extractor
- Add `require_admin` to diagnostic endpoints

**Scope:** ~4-6 targeted edits, no architectural disruption
**Risk:** Low
**Downside:** Doesn't address the synchronous proxy timeout (G8), LibreOffice/Chromium bloat (G11/G12), or the migration gap (G7). Sets up rework at Phase 5.

---

### Approach B — Container Design Refactor + Security Patches (Recommended)

Restructure containers for correct separation of concerns while fixing all criticals:

```
BEFORE (3 containers, bloated):
  sop-api       = FastAPI + cloudflared + LibreOffice (900 MB)
  sop-extractor = FFmpeg + PySceneDetect + Chromium + Node (1.2 GB)
  sop-frontend  = React (400 MB)

AFTER (4 containers, right-sized):
  sop-tunnel    = cloudflared only (~50 MB, separate restart policy)
  sop-api       = FastAPI only, no LibreOffice (~300 MB)
  sop-extractor = FFmpeg + PySceneDetect + imagehash only (~400 MB)
                  [Chromium/Node behind INSTALL_MERMAID=true build arg]
  sop-frontend  = React static (400 MB)
  [sop-exporter = Phase 8 only, not yet created]
```

Additional changes:
- cloudflared as host systemd service OR sop-tunnel container with `restart: always`
- Named Docker volume `sop-data` replacing bind-mount
- Add Alembic with initial migration
- Fix CORS, fix `/api/extract` auth, fix port 8001 exposure, fix diagnostics auth
- Add n8n to `docker-compose.dev.yml` for local workflow testing

**Scope:** 1-2 focused sessions
**Risk:** Medium (container restructure requires rebuild and redeploy)
**Upside:** All phases 4-8 build on a correct foundation. Image sizes halved.

---

### Approach C — Add Async Job Pattern (Forward-looking)

Replace the synchronous 600s proxy with a proper async job system:

```
n8n → POST /api/pipeline/extract
  → INSERT pipeline_runs (status=queued)
  → return {run_id}
  → background task starts extraction

n8n polls GET /api/pipeline/{run_id}/status
  → returns {status, progress_pct, frames_found}

Frontend SSE: GET /api/pipeline/{run_id}/progress
  → streams stage events as they complete
```

**Scope:** Medium (design the job model, implement background task with FastAPI `BackgroundTasks` or APScheduler)
**Risk:** Medium
**Upside:** Eliminates the 600s timeout risk, enables Phase 5-6 progress UI (VISUAL_INDEX #19), makes the system production-grade for multi-SOP workloads. Correctly uses `pipeline_runs` table which was designed for this.

---

## 5. Recommended Sequencing

### Immediate (before Phase 3 goes live)
1. **G1** — Add `x-internal-key` validation to `/api/extract`
2. **G2** — Wire `settings.cors_origins` into CORS middleware
3. **G4** — Remove `8001:8001` from production compose (keep in dev only)
4. **G5** — Add `asyncio.Semaphore(1)` to extractor
5. **G10** — Add `require_admin` to diagnostic endpoints

### Before Phase 4 begins
6. **G3** — Move cloudflared to host systemd service
7. **G6** — Extractor writes `pipeline_runs.status` on start/success/fail
8. **G7** — Add Alembic, generate initial migration
9. **G11** — Remove LibreOffice from sop-api Dockerfile
10. **G12** — Gate Chromium/Node behind `INSTALL_MERMAID=false` build arg

### Before Phase 5/6
11. **G8** — Design async job pattern for `/api/extract` (enables SSE progress stream)
12. **G9** — Decide and document user provisioning procedure
13. **G13** — Convert `./data` to named Docker volume
14. **G14** — Clarify frontend external routing strategy
15. **G15** — Add `audience=["authenticated"]` to JWT decode

---

## 6. Container Design Pattern (Target State)

```yaml
# Target docker-compose.yml (after Approach B)

services:
  sop-frontend:     # nginx serving /dist — no tunnel concern
  sop-api:          # FastAPI only — no LibreOffice, no cloudflared
  sop-extractor:    # FFmpeg + PySceneDetect only — no Chromium/Node by default
  # cloudflared → systemd on host, not a container

# docker-compose.dev.yml additions:
  n8n:              # local n8n for workflow testing
  # sop-extractor with INSTALL_MERMAID=true for Phase 5 testing

# Phase 8 addition:
  sop-exporter:     # LibreOffice + python-docx — only when export work begins
```

### Tunnel Architecture (Target)

```
Option 1 (recommended): Host systemd service
  systemctl start cloudflared
  → routes soptest.cloudnavision.com → localhost:8000 (sop-api)
  → routes sop.cloudnavision.com    → localhost:5173 (sop-frontend)

Option 2: Separate container with restart: always
  sop-tunnel:
    image: cloudflare/cloudflared:latest
    restart: always
    command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
    # No dependency on FastAPI lifecycle
```

---

## 7. Decisions Required

Before writing the implementation plan, decisions are needed on:

| # | Decision | Options |
|---|----------|---------|
| D1 | Approach scope | A (patches only) / B (container refactor) / C (add job queue) |
| D2 | cloudflared placement | Host systemd (recommended) / separate sop-tunnel container |
| D3 | Frontend routing | Second tunnel route / nginx in sop-api / sub-path routing |
| D4 | User provisioning | Manual admin step (document only) / auto-provision viewer on first login |
| D5 | Phase 3 job pattern | Keep 600s sync proxy for now (Phase 3) / start async pattern now (Phase C) |

---

_Review by: Claude Code + superpowers:code-reviewer_
_Next step: user approves approach → invoke `writing-plans` skill_
