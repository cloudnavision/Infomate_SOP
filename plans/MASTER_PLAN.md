# SOP Automation Platform — Master Implementation Plan

**Client:** Starboard Hotels | **Stack:** React + FastAPI + Supabase + n8n + Gemini 2.5 Flash
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

## Docker Architecture (3 Containers + 3 External Services)

> **Architecture updated based on TL feedback** — reduced from 6 containers to 3 local containers.
> Database moved to Supabase, n8n moved to external hosted, Cloudflare Tunnel runs on host.

```
Docker Compose (local / Azure VM):
┌─────────────────────────────────────────────┐
│                                             │
│  sop-frontend    React (Vite/serve) :5173   │
│  sop-api         FastAPI            :8000   │
│  sop-extractor   FFmpeg+Python      :8001   │
│                                             │
│  Shared volume: ./data                      │
│  Network: sop-network                       │
└─────────────────────────────────────────────┘
         │              │              │
         ▼              ▼              ▼
External Services (not in Docker Compose):
- Supabase     PostgreSQL via transaction pooler, port 6543
- n8n          Hosted externally, webhook communication
- Cloudflare   Tunnel runs as host daemon (cloudflared tunnel run)
               sop.yourdomain.com     → localhost:5173
               api.sop.yourdomain.com → localhost:8000
```

| Container | Image | Port | Role |
|-----------|-------|------|------|
| sop-frontend | node:20-slim (serve) | 5173:5173 | React SPA — calls API directly via VITE_API_URL |
| sop-api | python:3.11-slim | 8000:8000 | FastAPI, SQLAlchemy async → Supabase |
| sop-extractor | python:3.11-slim + FFmpeg | 8001:8001 | Frame extraction, clip cutting, Mermaid render |

| External Service | Where | How connected |
|-----------------|-------|---------------|
| Supabase | Supabase cloud | DATABASE_URL (transaction pooler, port 6543) |
| n8n | External hosted | N8N_WEBHOOK_BASE_URL (webhook calls) |
| Cloudflare Tunnel | Host daemon | `cloudflared tunnel run` on VM |

---

## Phase Dependency Graph

```
Phase 1: Foundation
  └─ 1a. Docker + DB schema       ✅ Done
  └─ 1b. FastAPI CRUD              ✅ Done
  └─ 1c. React scaffold + SOP page ◀ Next
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
| 1a | Docker Compose (3 containers) + Supabase schema + seed data + verify script | ✅ Complete |
| 1b | FastAPI CRUD routes: SOPs, steps, callouts, sections, pipeline runs | ✅ Complete |
| 1c | React scaffold: TanStack Router, SOP list page, step detail view | ◀ Next |

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
