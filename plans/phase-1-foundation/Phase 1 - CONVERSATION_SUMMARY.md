# Chat Summary — SOP Automation Platform Build
## Phase 1 Foundation (Complete)

---

## Starting Point

Started with loose architecture documents from a brainstorming activity session shared by TL:
- PROJECT_BLUEPRINT.md, CONVERSATION_SUMMARY.md, VISUAL_INDEX.md
- 001_initial_schema.sql (PostgreSQL schema)
- workflow_1_extraction.md, workflow_2_section_generation.md, workflow_3_export.md
- Transcript.md, Aged Debtor Process.docx, Process Documentation Flow (SOP).pdf

Goal: Break down the entire project into phased implementation plans and start building.

---

## What Was Discussed & Decided

### Phase Structure
- Originally created 6 phases (matching activity blueprint), then aligned to the blueprint's 5 phases
- Each phase has sub-parts (1a, 1b, 1c, etc.) with separate plan files
- `plans/` folder holds documentation, `sop-platform/` holds all code
- Plan docs created before building each sub-part

### Architecture Evolution

**v1.0 (Initial — from blueprint):** 6 Docker containers
- sop-frontend (React + Nginx)
- sop-postgres (PostgreSQL 16)
- sop-api (FastAPI)
- sop-extractor (FFmpeg + PySceneDetect)
- sop-n8n (n8n orchestrator)
- sop-tunnel (Cloudflare tunnel)

**v2.0 (After TL feedback):** 3 Docker containers + 3 external services
- sop-frontend (React + Vite, no nginx)
- sop-api (FastAPI + Pillow + python-docx)
- sop-extractor (FFmpeg + PySceneDetect + Mermaid CLI)
- External: Supabase (PostgreSQL via transaction pooler, port 6543)
- External: n8n (hosted, webhook communication)
- External: Cloudflare (sideloaded cloudflared daemon on host)

### TL Feedback (mid-build)
1. Use Supabase instead of local PostgreSQL → removed sop-postgres container
2. Use Cloudflare site loading (sideload), not nginx → removed nginx from frontend, simplified Dockerfile
3. n8n is externally hosted, use webhooks → removed sop-n8n container
4. No separate Cloudflare tunnel container → runs as daemon on host
5. Maintain plan docs for each phase with checklists

### Key Technical Decisions
- Frame extractor kept as separate container from API (resource isolation — FFmpeg needs 2-4GB RAM)
- Frontend calls API directly via VITE_API_URL (no nginx proxy)
- Supabase transaction pooler on port 6543 with conservative pool size (5-10)
- TanStack Router v1 file-based routing — child routes use useParams + useQuery (not useRouteContext/useOutletContext due to v1 API limitations)
- Mermaid CLI is free/open source, runs inside extractor container for process map rendering

---

## What Was Built

### Phase 1a: Docker Infrastructure ✅
- docker-compose.yml with 3 services on sop-network
- docker-compose.dev.yml for hot reload
- .env.example with Supabase connection, n8n webhook URL, VITE_API_URL
- Frontend Dockerfile: 3-stage (dev / build / serve with `npx serve`, no nginx)
- API Dockerfile: Python 3.11 + LibreOffice + Pillow + fonts
- Extractor Dockerfile: Python 3.11 + FFmpeg + Node 20 + Mermaid CLI
- Health check endpoints in each container
- verify_infrastructure.sh — 11-point verification script
- Shared data volume (uploads, frames, exports, templates)

### Phase 1b: FastAPI CRUD ✅
- api/app/config.py — pydantic-settings (Supabase connection)
- api/app/database.py — async SQLAlchemy engine + session
- api/app/models.py — 12 SQLAlchemy 2.0 models + 6 Python enums + relationships
- api/app/schemas.py — Pydantic v2 response schemas
- api/app/routes/sops.py — GET /api/sops, GET /api/sops/{id}
- api/app/routes/steps.py — steps with callouts, discussions
- api/app/routes/sections.py — sections, transcript, watchlist
- Placeholder routes: exports.py, media.py, pipeline.py
- Schema applied to Supabase via SQL Editor
- Seed data (002_seed_aged_debtor.sql) loaded to Supabase

### Phase 1c: React Scaffold ✅
- TanStack Router + TanStack Query + Zustand + lucide-react + clsx installed
- src/api/types.ts — TypeScript interfaces matching Pydantic schemas
- src/api/client.ts — fetch wrapper using VITE_API_URL + query key factories
- src/hooks/useSOPStore.ts — Zustand store (selectedStepId, editMode)
- 9 route files: __root, index, dashboard, sop.$id, procedure, overview, matrices, history, sop.new
- 6 components: Layout, SOPCard, StepSidebar, StepDetail, CalloutList, DiscussionCard
- routeTree.gen.ts stub for TanStack Router
- vite-env.d.ts for import.meta.env types
- Build passes: 0 TypeScript errors, production build succeeds

---

## Issues Encountered (13 total)

| # | Issue | Fix |
|---|---|---|
| 1 | Docker not found in WSL | Enable WSL integration in Docker Desktop |
| 2 | Permission denied on docker.sock | Use sudo docker compose |
| 3 | docker-compose.yml version warning | Removed obsolete version line |
| 4 | Windows line endings in scripts | sed -i 's/\r$//' |
| 5 | Windows line endings in .env | sed -i 's/\r$//' |
| 6 | Schema check false negative | .env line ending fix resolved it |
| 7 | n8n tables in same database | Resolved when n8n container removed |
| 8 | Architecture change (6→3 containers) | Updated docker-compose, Dockerfiles, env config |
| 9 | npm ci missing package-lock.json | npm install to generate it |
| 10 | Old containers lingering | docker stop + rm, then compose up |
| 11 | Frontend still running nginx | Rebuilt with --build flag |
| 12 | API routes "Not Found" | API container running old code — rebuilt |
| 13 | Supabase tables empty | Re-applied schema + seed via SQL Editor |

---

## Documentation Created

| File | Location | Purpose |
|---|---|---|
| PROJECT_BLUEPRINT.md | Root | Architecture v2.0 (updated) |
| MEMORY.md | Root | Current state + context for Claude Code |
| CHECKLIST.md | Root | Master checklist all phases |
| MASTER_PLAN.md | plans/ | Phase overview + dependency graph |
| PHASE_1_PLAN.md | plans/phase-1-foundation/ | Phase 1 execution plan + checklist |
| PHASE_1_ISSUES.md | plans/phase-1-foundation/ | 13 issues logged |
| 1a_docker_setup.md | plans/phase-1-foundation/ | Docker sub-plan (complete) |
| 1b_fastapi_crud.md | plans/phase-1-foundation/ | FastAPI sub-plan (complete) |
| 1c_react_scaffold.md | plans/phase-1-foundation/ | React sub-plan (complete) |

---

## Environment Details

- Dev machine: Windows + WSL Ubuntu (Docker Desktop with WSL integration)
- Claude Code: Running in Antigravity
- Project path: /mnt/d/CloudNavision/1. Projects/SOP/SOP Automation System/sop-platform
- Database: Supabase (transaction pooler, port 6543)
- Containers: 3 (frontend :5173, API :8000, extractor :8001)

---

## Seed Data IDs

| Entity | UUID |
|---|---|
| Admin user | 00000000-0000-0000-0000-000000000001 |
| Aged Debtor SOP | 10000000-0000-0000-0000-000000000001 |
| Steps 1-8 | 20000000-0000-0000-0000-00000000000[1-8] |

---

## Daily Commands

```bash
cd "/mnt/d/CloudNavision/1. Projects/SOP/SOP Automation System/sop-platform"
sudo docker compose up -d
sudo docker compose ps
sudo bash scripts/verify_infrastructure.sh
curl http://localhost:8000/api/sops
sudo docker compose down
```

---

## Next Steps

- Phase 2: Video + Transcript (Video.js, useStepSync, TranscriptPanel, keyboard shortcuts)
- Videos stored in Azure Blob Storage, referenced by sops.video_url
- Real videos only available after Phase 4 pipeline — use sample video or placeholder for Phase 2 development
