# SOP Automation Platform — Master Implementation Plan

**Client:** Starboard Hotels | **Stack:** React + FastAPI + PostgreSQL + n8n + Gemini 2.5 Flash
**Goal:** KT meeting recording → structured SOP in ~4 minutes

---

## Phase Overview

| # | Phase | Deliverable | Status |
|---|-------|-------------|--------|
| 1 | **Foundation** | Docker infra, PostgreSQL schema, FastAPI CRUD, React scaffold | 🔵 In Progress |
| 2 | **Video + Transcript** | VideoPlayer, step sync, TranscriptPanel | ⬜ Pending |
| 3 | **Callout Editor** | Konva canvas, drag-drop annotations, confidence colours | ⬜ Pending |
| 4 | **Pipeline Integration** | Frame extractor, n8n Workflows 1+2, upload page | ⬜ Pending |
| 5 | **Exports + Polish** | n8n Workflow 3, DOCX/PDF, dashboard, Cloudflare ZTNA | ⬜ Pending |

---

## Docker Architecture (6 Containers)

```
                        ┌─────────────────────────────────────────┐
                        │            sop-network (bridge)          │
                        │                                          │
  Browser ──5173──► sop-frontend (React+Nginx)                    │
                         │  /api/* proxy ──────► sop-api :8000     │
                         │                           │             │
                         │                    sop-postgres :5432   │
                         │                    sop-n8n :5678        │
                         │                    sop-extractor :8001  │
                         │                                          │
                    [production only]                              │
                    sop-tunnel (Cloudflare ZTNA)                   │
                        └─────────────────────────────────────────┘
```

| Container | Image | Port | Role |
|-----------|-------|------|------|
| sop-frontend | Node 20 → Nginx | 5173:80 | React SPA + Nginx reverse proxy |
| sop-api | python:3.11-slim | 8000 | FastAPI, SQLAlchemy async |
| sop-postgres | postgres:16 | 5433:5432 | Primary database (shared with n8n) |
| sop-extractor | python:3.11-slim + FFmpeg | 8001 | Frame extraction, clip cutting, Mermaid render |
| sop-n8n | n8nio/n8n | 5678 | 3 automation workflows |
| sop-tunnel | cloudflare/cloudflared | — | Production-only ZTNA tunnel |

---

## Phase Dependency Graph

```
Phase 1: Foundation
  └─ 1a. Docker + DB schema       ✅ Done
  └─ 1b. FastAPI CRUD              ◀ Next
  └─ 1c. React scaffold + SOP page
         │
         ▼
Phase 2: Video + Transcript
  (VideoPlayer, useStepSync, TranscriptPanel)
         │
         ▼
Phase 3: Callout Editor
  (Konva.js canvas, drag-drop, confidence badges)
         │
         ▼
Phase 4: Pipeline Integration
  (n8n Workflow 1+2, frame extractor, upload UI)
         │
         ▼
Phase 5: Exports + Polish
  (n8n Workflow 3, DOCX/PDF, Cloudflare ZTNA)
```

---

## Phase 1 Sub-Parts

| Sub-Part | Description | Status |
|----------|-------------|--------|
| 1a | Docker Compose (6 containers) + PostgreSQL schema + seed data + verify script | ✅ Complete |
| 1b | FastAPI CRUD routes: SOPs, steps, callouts, sections, pipeline runs | ◀ Next |
| 1c | React scaffold: TanStack Router, SOP list page, step detail view | ⬜ After 1b |

---

## Reference Documents

| File | Purpose |
|------|---------|
| [docs/PROJECT_BLUEPRINT.md](../docs/PROJECT_BLUEPRINT.md) | Master architecture, stack decisions, full file tree |
| [docs/CONVERSATION_SUMMARY.md](../docs/CONVERSATION_SUMMARY.md) | Architecture rationale, cost analysis, annotation strategy |
| [docs/workflow_1_extraction.md](../docs/workflow_1_extraction.md) | n8n 14-node extraction pipeline — full JS node code |
| [docs/workflow_2_section_generation.md](../docs/workflow_2_section_generation.md) | n8n 6-node section generation — all 19 Gemini prompts |
| [docs/workflow_3_export.md](../docs/workflow_3_export.md) | n8n 7-node export pipeline — python-docx template code |
| [docs/reference/Transcript.md](../docs/reference/Transcript.md) | Aged Debtor KT session transcript (seed data source) |
| [sop-platform/schema/001_initial_schema.sql](../sop-platform/schema/001_initial_schema.sql) | PostgreSQL: 6 enums, 12 tables, triggers, pg_trgm |
| [sop-platform/schema/002_seed_aged_debtor.sql](../sop-platform/schema/002_seed_aged_debtor.sql) | Dev seed: 1 SOP, 8 steps, 5 callouts, 4 sections |

---

## Phase Plans

- [Phase 1 Plan](phase-1-foundation/PHASE_1_PLAN.md)
- [Phase 1 Issues](phase-1-foundation/PHASE_1_ISSUES.md)
