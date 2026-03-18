# Phase 1: Foundation

**Objective:** Establish the full local Docker infrastructure — 6 containers running, PostgreSQL schema applied with seed data, FastAPI CRUD routes for all entities, and a React scaffold that renders the SOP list and step detail pages.

---

## Sub-Parts

| Sub-Part | Description | Status |
|----------|-------------|--------|
| 1a | Docker Compose setup + DB schema + seed + verify script | ✅ Complete |
| 1b | FastAPI CRUD: SOPs, steps, callouts, sections, pipeline_runs | ✅ Complete |
| 1c | React scaffold: TanStack Router, SOP list, step detail | ◀ Next |

---

## Sub-Part 1a — Docker + Database ✅

### Checklist

- [x] `docker-compose.yml` — 6 services on `sop-network`
- [x] `docker-compose.dev.yml` — hot-reload overrides (volume mounts + `--reload`)
- [x] `.env` / `.env.example` — all environment variables documented
- [x] `.gitignore` / `.dockerignore`
- [x] `sop-postgres` — postgres:16, schema auto-applied on first start
- [x] `sop-api` — FastAPI with `/health`, `/api/test-db`, `/api/test-extractor`
- [x] `sop-extractor` — FFmpeg + mmdc installed, `/health`, `/test-ffmpeg`, `/test-data-volume`
- [x] `sop-frontend` — React + Nginx, health check fetches `/api/health`, SPA routing
- [x] `sop-n8n` — shares sop_platform database, auto-creates its own tables
- [x] `sop-tunnel` — production-only (behind `profiles: [production]`)
- [x] `schema/001_initial_schema.sql` — 6 enums, 12 tables, triggers, pg_trgm index
- [x] `schema/002_seed_aged_debtor.sql` — 1 SOP, 8 steps, 5 callouts, 4 sections, dev seed
- [x] `data/` volume — 4 subdirs: uploads, frames, exports, templates
- [x] `scripts/verify_infrastructure.sh` — 14 checks in 5 sections, coloured output
- [x] All 14 verify checks passing

---

## Sub-Part 1b — FastAPI CRUD ✅

### Checklist

- [x] `api/app/config.py` — Settings (pydantic-settings): DATABASE_URL, EXTRACTOR_URL, CORS, Azure
- [x] `api/app/database.py` — async engine, AsyncSessionLocal, Base, `get_db` dependency
- [x] `api/app/models.py` — SQLAlchemy 2.0 models for all 13 tables + 6 Python enums
- [x] `api/app/schemas.py` — Pydantic v2 schemas: SOPListItem, SOPDetail, StepSchema, CalloutSchema, SectionSchema, WatchlistSchema, TranscriptLineSchema, PipelineRunSchema
- [x] `api/app/routes/sops.py` — `GET /api/sops` (with step_count subquery), `GET /api/sops/{id}` (selectinload)
- [x] `api/app/routes/steps.py` — `GET /api/sops/{id}/steps`, `GET /api/sops/{id}/steps/{step_id}`
- [x] `api/app/routes/sections.py` — `GET /api/sops/{id}/sections`, `/transcript` (speaker filter), `/watchlist`
- [x] `api/app/routes/exports.py` — Phase 5 placeholder
- [x] `api/app/routes/media.py` — Phase 4 placeholder
- [x] `api/app/routes/pipeline.py` — Phase 4 placeholder
- [x] `api/app/routes/__init__.py` — updated with route module listing
- [x] `api/app/main.py` — routers registered: `sops`, `steps`, `sections`

---

## Sub-Part 1c — React Scaffold (After 1b)

### Checklist

- [ ] TanStack Router file-based routing (`routes/` directory)
- [ ] TanStack Query client setup in `main.tsx`
- [ ] Zustand store skeleton (`hooks/useStore.ts`)
- [ ] `api/client.ts` — typed API helpers (fetch wrapper)
- [ ] `routes/index.tsx` — SOP list page, fetches `GET /api/sops`
- [ ] `routes/sops/$sopId.tsx` — SOP detail page scaffold
- [ ] `components/SOPCard.tsx` — card for list view
- [ ] `components/Layout.tsx` — sidebar + main content area
- [ ] Tailwind typography + colour tokens applied
- [ ] Build passes: `npm run build` produces no TS errors

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| API dialect prefix | Strip `+asyncpg` via `re.sub` | asyncpg.connect() rejects SQLAlchemy format |
| nginx SSE block | `/api/pipeline/` BEFORE `/api/` | Longer-prefix match; buffering must be off for SSE |
| Konva.js loading | Lazy (edit mode only) | Saves ~140KB on read-only SOP views |
| n8n database | Shared `sop_platform` DB | Simplifies Docker setup; n8n tables are cosmetic |
| Cloudflare ZTNA | `profiles: [production]` | Not needed locally; one flag enables for prod |
| DOCX generation | python-docx template tokens | ~300 lines vs 1500+ from scratch |

---

## Key File Locations

```
sop-platform/
├── docker-compose.yml              # 6-service orchestration
├── docker-compose.dev.yml          # hot-reload overrides
├── .env                            # local environment (not committed)
├── .env.example                    # template for new devs
├── schema/
│   ├── 001_initial_schema.sql      # full DB schema (12 tables)
│   └── 002_seed_aged_debtor.sql    # dev seed data
├── api/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py                 # health + test endpoints (Phase 1a)
│       ├── config.py               # Settings — Phase 1b
│       ├── models.py               # SQLAlchemy models — Phase 1b
│       ├── schemas.py              # Pydantic schemas — Phase 1b
│       ├── routes/
│       │   └── __init__.py         # router registration — Phase 1b
│       └── services/
│           └── __init__.py         # Phase 5 placeholder
├── extractor/
│   ├── Dockerfile                  # FFmpeg + mmdc + Chromium
│   ├── requirements.txt
│   └── app/
│       ├── main.py                 # health + test endpoints
│       ├── scene_detector.py       # Phase 4 placeholder
│       ├── deduplicator.py         # Phase 4 placeholder
│       ├── clip_extractor.py       # Phase 4 placeholder
│       └── mermaid_renderer.py     # Phase 4 placeholder
├── frontend/
│   ├── Dockerfile                  # 3-stage: dev / build / prod
│   ├── nginx.conf                  # SPA routing + SSE proxy
│   ├── tailwind.config.ts
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx                 # health check display
│       ├── api/                    # Phase 1c — API client
│       ├── components/             # Phase 1c — shared components
│       ├── hooks/                  # Phase 1c — Zustand store
│       └── routes/                 # Phase 1c — TanStack Router pages
├── data/
│   ├── uploads/                    # raw video uploads
│   ├── frames/                     # extracted frames
│   ├── exports/                    # generated DOCX/PDF
│   └── templates/                  # Word .docx templates
├── templates/                      # n8n JSON workflow templates
├── workflows/                      # workflow docs (reference)
│   ├── workflow_1_extraction.md
│   ├── workflow_2_section_generation.md
│   └── workflow_3_export.md
└── scripts/
    └── verify_infrastructure.sh    # 14-check health script
```

---

## Issues

See [PHASE_1_ISSUES.md](PHASE_1_ISSUES.md) for all encountered issues and resolutions.
