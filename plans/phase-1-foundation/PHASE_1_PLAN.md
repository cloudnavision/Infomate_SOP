# Phase 1: Foundation

**Objective:** Establish the Docker infrastructure (3 containers + external services), FastAPI CRUD endpoints connected to Supabase, and a React scaffold that renders the SOP list and step detail pages.

---

## Sub-Parts

| Sub-Part | Description | Status |
|----------|-------------|--------|
| 1a | Docker Compose (3 containers) + Supabase schema + verify script | ✅ Complete |
| 1b | FastAPI CRUD: SOPs, steps, callouts, sections, transcript, watchlist | ✅ Complete |
| 1c | React scaffold: TanStack Router, SOP list, step detail page | ⬜ Next |

---

## Architecture (v2.0)

**3 Docker Containers:**
| Container | Port | Purpose |
|---|---|---|
| sop-frontend | 5173 | React SPA (Vite dev / serve prod) |
| sop-api | 8000 | FastAPI + Pillow + python-docx |
| sop-extractor | 8001 | FFmpeg + PySceneDetect + Mermaid CLI |

**External Services:**
| Service | Purpose |
|---|---|
| Supabase | PostgreSQL via transaction pooler (port 6543) |
| n8n | Externally hosted, webhook communication |
| Cloudflare | Sideloaded cloudflared daemon on host (HTTPS) |
| Azure Blob | Video, image, document storage |

---

## Sub-Part 1a — Docker + Database ✅

See: [1a_docker_setup.md](1a_docker_setup.md)

- 3 Docker containers running and healthy
- Supabase schema applied (001_initial_schema.sql)
- Seed data loaded (002_seed_aged_debtor.sql)
- Verification: 11/11 checks passing
- Architecture updated from 6 → 3 containers after TL feedback

---

## Sub-Part 1b — FastAPI CRUD ✅

See: [1b_fastapi_crud.md](1b_fastapi_crud.md)

- SQLAlchemy models for all 12 tables + 6 enums
- Pydantic v2 response schemas
- 7 read-only API endpoints working
- Connected to Supabase via transaction pooler
- Seed data returns correctly from all endpoints

---

## Sub-Part 1c — React Scaffold (Next)

See: [1c_react_scaffold.md](1c_react_scaffold.md)

**Goal:** React app renders SOP data from the API with step sidebar and detail panel.

**What to build:**
- Install TanStack Router, TanStack Query, Zustand, lucide-react
- TypeScript types matching Pydantic schemas
- API client with query key factories
- Zustand store (selectedStepId, editMode)
- Route files: dashboard, sop.$id, procedure, overview, matrices, history
- Components: Layout, StepSidebar, StepDetail, CalloutList, DiscussionCard, SOPCard
- Frontend calls API at VITE_API_URL (http://localhost:8000 for local dev)

**Note:** No nginx proxy — frontend calls the API directly. In production, Cloudflare handles routing.

---

## Checklist

```
1a: Docker Infrastructure
- [x] docker-compose.yml — 3 containers (frontend, API, extractor)
- [x] docker-compose.dev.yml — hot reload overrides
- [x] .env.example — Supabase URL, n8n webhook URL, VITE_API_URL
- [x] Frontend Dockerfile — Node 20 (dev / build / serve, no nginx)
- [x] API Dockerfile — Python 3.11 + LibreOffice + Pillow
- [x] Extractor Dockerfile — FFmpeg + Node + Mermaid CLI
- [x] Scaffold apps with health endpoints
- [x] Supabase schema applied via SQL Editor
- [x] Seed data loaded via SQL Editor
- [x] Verification: 11/11 passing

1b: FastAPI CRUD
- [x] api/app/config.py — pydantic-settings (Supabase connection)
- [x] api/app/database.py — async SQLAlchemy (conservative pool size)
- [x] api/app/models.py — all 12 tables + 6 enums + relationships
- [x] api/app/schemas.py — Pydantic v2 response schemas
- [x] api/app/routes/sops.py — GET /api/sops, GET /api/sops/{id}
- [x] api/app/routes/steps.py — steps with callouts, discussions
- [x] api/app/routes/sections.py — sections, transcript, watchlist
- [x] Routes registered in main.py
- [x] All endpoints tested and returning data from Supabase

1c: React Scaffold
- [ ] Install TanStack Router + Query + Zustand + lucide-react
- [ ] src/api/types.ts — TypeScript interfaces
- [ ] src/api/client.ts — fetch wrapper + query keys
- [ ] src/hooks/useSOPStore.ts — Zustand store
- [ ] Route files — dashboard, sop.$id, procedure, overview, etc.
- [ ] Layout.tsx — header + navigation
- [ ] StepSidebar.tsx — clickable step list
- [ ] StepDetail.tsx — step info + callouts + discussions
- [ ] CalloutList.tsx — confidence colour dots
- [ ] DiscussionCard.tsx — type icons + speakers
- [ ] SOPCard.tsx — dashboard card
- [ ] Procedure page renders with API data
- [ ] Build passes with no TypeScript errors
```

---

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Database | Supabase (transaction pooler, port 6543) | TL decision — hosted, no local container |
| Frontend serving | Cloudflare sideloading | TL decision — no nginx, clean images |
| n8n | Externally hosted, webhooks | TL decision — separate instance exists |
| Docker containers | 3 (frontend, API, extractor) | Reduced from 6 after TL feedback |
| Frame extractor | Separate from API | Resource isolation — FFmpeg needs 2-4GB |
| Frontend API calls | Direct to localhost:8000 (VITE_API_URL) | No nginx proxy — Cloudflare handles production routing |

---

## Issues

See: [PHASE_1_ISSUES.md](PHASE_1_ISSUES.md)
