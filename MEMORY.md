# SOP Automation Platform — Project Memory
## Last Updated: 2026-03-18 (Phase 1 complete)

---

## Project Context

**Client:** Starboard Hotels
**Goal:** Replace 4-6 hour manual SOP process with AI pipeline → draft SOP in ~4 minutes
**Pipeline:** Teams KT recording (MP4) → Gemini 2.5 Flash transcription → FFmpeg frame extraction → callout annotation → section generation → DOCX/PDF export

**Stack:**
- Frontend: React 18 + TypeScript + Vite + Tailwind + TanStack Router + TanStack Query + Zustand
- Backend: Python 3.11 + FastAPI + SQLAlchemy 2.0 async + Pydantic v2
- Database: PostgreSQL 16 on Supabase (transaction pooler port 6543)
- AI: Gemini 2.5 Flash (transcription, annotation, section generation)
- OCR: Google Cloud Vision (pixel-precise callout matching)
- Pipeline: n8n (externally hosted, 3 workflows via webhooks)
- Frame extraction: FFmpeg + PySceneDetect
- Export: python-docx + Pillow, LibreOffice headless for PDF
- Storage: Azure Blob Storage (video, images, DOCX/PDF)
- Auth/CDN: Cloudflare ZTNA

---

## Current State

### Phase 1: Foundation ✅ Complete

| Sub-Part | Description | Status |
|----------|-------------|--------|
| 1a | Docker Compose (3 containers) + Supabase schema + seed data + verify script | ✅ Complete |
| 1b | FastAPI CRUD routes: SOPs, steps, callouts, sections, transcript, watchlist | ✅ Complete |
| 1c | React scaffold: TanStack Router, SOP list page, step detail view | ✅ Complete |

**What was built in 1c:**
- `sop-platform/frontend/src/api/types.ts` — TypeScript interfaces matching all Pydantic schemas
- `sop-platform/frontend/src/api/client.ts` — fetch wrapper using `VITE_API_URL`, query key factories
- `sop-platform/frontend/src/hooks/useSOPStore.ts` — Zustand store (selectedStepId, editMode)
- 9 route files: `__root.tsx`, `index.tsx`, `dashboard.tsx`, `sop.$id.tsx`, `sop.$id.procedure.tsx`, `sop.$id.overview.tsx`, `sop.$id.matrices.tsx`, `sop.$id.history.tsx`, `sop.new.tsx`
- 6 components: `Layout.tsx`, `SOPCard.tsx`, `StepSidebar.tsx`, `StepDetail.tsx`, `CalloutList.tsx`, `DiscussionCard.tsx`
- `vite.config.ts` updated: TanStack Router Vite plugin added, old nginx proxy removed
- Build: `tsc && vite build` passes with 0 errors

**Key 1c implementation note:** Child routes (`procedure`, `overview`) use `useQuery` with the same key as the parent `sop.$id.tsx` — React Query cache means no extra network calls. Did not use `useRouteContext`/`useOutletContext` (unreliable in TanStack Router v1 for data passing).

### Phase 2: Video + Transcript ◀ Next
### Phase 3: Callout Editor ⬜
### Phase 4: Pipeline Integration ⬜
### Phase 5: Exports + Polish ⬜

---

## Architecture v2.0 (Post TL Feedback)

```
Docker Compose (3 local containers):
┌─────────────────────────────────────────────┐
│  sop-frontend    React (Vite/serve) :5173   │
│  sop-api         FastAPI            :8000   │
│  sop-extractor   FFmpeg+Python      :8001   │
│  Shared volume: ./data                      │
│  Network: sop-network                       │
└─────────────────────────────────────────────┘

External Services (not in Docker Compose):
- Supabase     PostgreSQL via transaction pooler, port 6543
- n8n          Hosted externally, webhook communication
- Cloudflare   Tunnel runs as host daemon (cloudflared tunnel run)
```

**Why 3 containers instead of 6:**
- Postgres → Supabase cloud (no local postgres container)
- nginx → removed (frontend calls API directly via VITE_API_URL, Cloudflare handles ingress)
- n8n → external hosted instance (no n8n container)
- Cloudflare Tunnel → host daemon, not a container

---

## Key Architecture Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Supabase over local Postgres | Managed DB, connection pooling built-in, free tier adequate |
| 2 | Transaction pooler port 6543 | Required for Supabase pgBouncer; direct 5432 unreliable with async |
| 3 | No nginx proxy | Cloudflare Tunnel handles ingress; CORS middleware on FastAPI covers dev |
| 4 | n8n externally hosted | Reuses existing n8n instance; lighter local Docker footprint |
| 5 | Cloudflare as host daemon | More reliable than container; avoids Docker-in-Docker networking |
| 6 | Gemini 2.5 Flash for all AI | ~$0.43/SOP; best multimodal for video frames + long transcripts |
| 7 | Hybrid annotation (Gemini + Vision OCR) | Gemini ~60% spatial, Vision OCR pixel-precise; combined ~92% |
| 8 | SQLAlchemy 2.0 async ORM | Type-safe, Mapped[], async sessions compatible with Supabase pooler |
| 9 | TanStack Router file-based routing | Type-safe, colocated loaders, matches component file tree in blueprint |
| 10 | Zustand for UI state | Lightweight; avoids Redux boilerplate for step selection + editor mode |

---

## Environment

**Working directory:** `d:\CloudNavision\1. Projects\SOP\SOP Automation System\sop-platform\`

**Key env vars (.env):**
```
DATABASE_URL=postgresql+asyncpg://postgres.[PROJECT_REF]:[PASSWORD]@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres
VITE_API_URL=http://localhost:8000
N8N_WEBHOOK_BASE_URL=<to be filled>
GEMINI_API_KEY=<to be filled>
EXTRACTOR_URL=http://sop-extractor:8001
```

---

## Key File Locations

| File | Purpose |
|------|---------|
| `sop-platform/docker-compose.yml` | 3-service production compose |
| `sop-platform/docker-compose.dev.yml` | Dev compose (volume mounts for hot reload) |
| `sop-platform/.env` | Real credentials (never commit) |
| `sop-platform/.env.example` | Template for new devs |
| `sop-platform/schema/001_initial_schema.sql` | 6 enums, 12 tables, triggers, pg_trgm |
| `sop-platform/schema/002_seed_aged_debtor.sql` | Dev seed: 1 SOP, 8 steps, 5 callouts, 4 sections |
| `sop-platform/api/app/config.py` | pydantic-settings, Supabase URL, n8n URL |
| `sop-platform/api/app/database.py` | async engine, AsyncSessionLocal, get_db |
| `sop-platform/api/app/models.py` | 13 SQLAlchemy 2.0 models + 6 Python enums |
| `sop-platform/api/app/schemas.py` | 9 Pydantic v2 schemas (from_attributes=True) |
| `sop-platform/api/app/routes/sops.py` | GET /api/sops, GET /api/sops/{id} |
| `sop-platform/api/app/routes/steps.py` | GET /api/sops/{id}/steps, /{step_id} |
| `sop-platform/api/app/routes/sections.py` | /sections, /transcript, /watchlist |
| `sop-platform/scripts/verify_infrastructure.sh` | 11-check infra verification script |
| `plans/MASTER_PLAN.md` | Phase overview, architecture diagram |
| `plans/phase-1-foundation/PHASE_1_PLAN.md` | Phase 1 detailed checklist |
| `plans/phase-1-foundation/1c_react_scaffold.md` | Phase 1c build record (✅ complete) |
| `plans/phase-1-foundation/PHASE_1_ISSUES.md` | Troubleshooting log (13 issues) |
| `sop-platform/frontend/src/api/types.ts` | TypeScript interfaces (matches schemas.py) |
| `sop-platform/frontend/src/api/client.ts` | API fetch wrapper + sopKeys factories |
| `sop-platform/frontend/src/hooks/useSOPStore.ts` | Zustand store (selectedStepId, editMode) |
| `sop-platform/frontend/src/routes/` | 9 route files (TanStack Router file-based) |
| `sop-platform/frontend/src/components/` | 6 UI components |
| `CHECKLIST.md` | Master checklist across all 5 phases |
| `PROJECT_BLUEPRINT.md` | Master architecture + full file tree |
| `workflow_1_extraction.md` | n8n 14-node extraction pipeline (full JS) |
| `workflow_2_section_generation.md` | n8n 6-node section gen (all 19 Gemini prompts) |
| `workflow_3_export.md` | n8n 7-node export pipeline (python-docx code) |

---

## Seed Data IDs (Aged Debtor SOP)

| Entity | UUID |
|--------|------|
| Admin user | `00000000-0000-0000-0000-000000000001` |
| Aged Debtor SOP | `10000000-0000-0000-0000-000000000001` |
| Step 1 (Log in to Shared Folder) | `20000000-0000-0000-0000-000000000001` |
| Step 2 (Share Current Week Folder) | `20000000-0000-0000-0000-000000000002` |
| Step 3 (Verify Uploaded Reports) | `20000000-0000-0000-0000-000000000003` |
| Steps 4–8 | `20000000-0000-0000-0000-00000000000{4-8}` |

**Test URLs (when containers running):**
- `GET http://localhost:8000/api/sops` → list with step_count
- `GET http://localhost:8000/api/sops/10000000-0000-0000-0000-000000000001` → full SOP detail
- `GET http://localhost:8000/api/sops/10000000-0000-0000-0000-000000000001/steps`
- `GET http://localhost:8000/api/sops/10000000-0000-0000-0000-000000000001/transcript`

---

## Known Quirks

1. **VITE_API_URL bake-time issue:** Vite bakes env vars at build time. The `prod` Docker stage
   builds static files — `VITE_API_URL` must be passed as `--build-arg` to docker compose build,
   not just as a runtime env var. In `dev` stage (Vite dev server), runtime env works.
   Mitigated in Phase 1c by fallback: `const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'`.

2. **Supabase transaction pooler:** Use port 6543, not 5432. Pool size should be ≤10.
   asyncpg connection string prefix: `postgresql+asyncpg://` not `postgresql://`.

3. **SQLAlchemy enum pattern:** Use `SAEnum(PythonEnum, name="enum_name", create_type=False)`
   to reference pre-existing DB enum types without trying to recreate them.

4. **n8n tables in Supabase:** If n8n is pointed at the same Supabase DB, it creates 60+ extra
   tables. Cosmetic only — verify script uses `10+` threshold not exact count.

5. **Windows line endings:** If `.env` was created on Windows, containers may fail with `\r`
   in env var values. Fix: `sed -i 's/\r$//' .env` in WSL.

6. **Write tool requires prior Read:** The Write tool will fail if the file wasn't read in the
   current context session. Always read before writing even if content is known.

7. **TanStack Router v1 outlet context:** `useRouteContext` does not cleanly pass data from parent
   to child routes via `<Outlet context={...} />`. Use `useQuery` with the same query key in child
   routes instead — React Query cache ensures no duplicate network requests.

8. **routeTree.gen.ts is auto-generated:** The TanStack Router Vite plugin regenerates this file
   on every `vite build` or `vite dev`. The stub file checked into source is overwritten on build.
   Never edit `routeTree.gen.ts` manually.

---

## TL Feedback Log

| Date | Feedback | Action Taken |
|------|----------|--------------|
| 2026-03 | 6-container setup too heavy for production | Reduced to 3 containers; DB→Supabase, n8n→external, nginx→removed, tunnel→host daemon |

---

## Daily Commands

```bash
# Start all containers
cd sop-platform && docker compose up -d

# Verify infrastructure (11 checks)
bash scripts/verify_infrastructure.sh

# View logs
docker compose logs -f sop-api
docker compose logs -f sop-frontend
docker compose logs -f sop-extractor

# Rebuild after code changes
docker compose build sop-api && docker compose up -d sop-api

# Stop all
docker compose down

# Apply schema to Supabase (run once, from Supabase SQL editor or psql)
# psql $DATABASE_URL -f schema/001_initial_schema.sql
# psql $DATABASE_URL -f schema/002_seed_aged_debtor.sql
```

---

## Next Steps — Phase 2

Phase 2: Video + Transcript — build on top of the existing procedure page.

1. Add `VideoPlayer.tsx` component (Video.js) to the step detail area
2. Implement `useStepSync.ts` hook — coordinates video time ↔ selected step ↔ transcript scroll
3. Add `TranscriptPanel.tsx` — virtualised list (react-virtual), speaker colours, search, click-to-seek
4. Navigation: clip mode toggle, "Watch this step" button, keyboard shortcuts (↑↓, Space, C)
5. Step timestamps visible in `StepSidebar.tsx`

**Install needed for Phase 2:**
- `video.js` + `@types/video.js`
- `react-virtual` (or `@tanstack/react-virtual`)

**Plan doc:** Create `plans/phase-2-video-transcript/PHASE_2_PLAN.md` before starting.
