# SOP Automation Platform — Master Implementation Plan

**Client:** Starboard Hotels | **Stack:** React + FastAPI + Supabase + n8n + Gemini 2.5 Flash
**Goal:** KT meeting recording → structured SOP in ~4 minutes

---

## Phase Overview

| # | Phase | Deliverable | Status |
|---|-------|-------------|--------|
| 1 | **Foundation** | Docker infra, PostgreSQL schema, FastAPI CRUD, React scaffold | ✅ Complete |
| 1.5 | **Authentication** | Supabase Auth + Azure AD SSO, role-based access, user management | ✅ Complete |
| 2 | **Ingestion + Transcription** | n8n pipeline: SharePoint → Azure Blob → Gemini → Supabase | ✅ Complete |
| 3 | **Frame Extraction** | sop-extractor: FFmpeg + PySceneDetect, n8n trigger, frame metadata to Supabase | ◀ Next |
| 4 | **Gemini Classification** | n8n Workflow 3: Gemini Vision per-frame → gemini_description + step_callouts | ⬜ Pending |
| 5 | **Video + Transcript UI** | VideoPlayer, step sync, TranscriptPanel | ⬜ Pending |
| 6 | **Exports + Polish** | n8n Workflow 3, DOCX/PDF, dashboard, Cloudflare ZTNA | ⬜ Pending |

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
Phase 1: Foundation                         ✅ Complete
  └─ 1a. Docker + DB schema
  └─ 1b. FastAPI CRUD
  └─ 1c. React scaffold + SOP page
         │
         ▼
Phase 1.5: Authentication                   ✅ Complete
  └─ Supabase Auth + Azure AD SSO
  └─ Role-based access (Viewer/Editor/Admin)
  └─ Admin user management
         │
         ▼
Phase 2: Ingestion + Transcription          ✅ Complete
  └─ n8n: SharePoint → Azure Blob → Gemini → Supabase
  └─ Cloudflare Tunnel (soptest.cloudnavision.com)
         │
         ▼
Phase 3: Frame Extraction                   ◀ Next
  └─ sop-extractor: FFmpeg + PySceneDetect
  └─ n8n workflow polls extracting_frames records
  └─ Frame metadata written to Supabase
         │
         ▼
Phase 4: Gemini Classification
  (n8n Workflow 3: Vision → gemini_description + step_callouts per frame)
         │
         ▼
Phase 5: Video + Transcript UI
  (VideoPlayer, useStepSync, TranscriptPanel)
         │
         ▼
Phase 6: Exports + Polish
  (n8n Workflow 3, DOCX/PDF, Cloudflare ZTNA)
```

---

## Phase 1 Sub-Parts

| Sub-Part | Description | Status |
|----------|-------------|--------|
| 1a | Docker Compose (3 containers) + Supabase schema + seed data + verify script | ✅ Complete |
| 1b | FastAPI CRUD routes: SOPs, steps, callouts, sections, pipeline runs | ✅ Complete |
| 1c | React scaffold: TanStack Router, SOP list page, step detail view | ✅ Complete |

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
- [Phase 1 Conversation Summary](Phase%201%20-%20CONVERSATION_SUMMARY.md)
- [Phase 1.5 Plan](phase-1.5-auth/PHASE_1.5_PLAN.md)
- [Phase 1.5 Issues](phase-1.5-auth/PHASE_1.5_ISSUES.md)
- [Phase 1.5 Conversation Summary](Phase%201.5%20-%20CONVERSATION_SUMMARY.md)
- [Phase 2 Plan](phase-2-ingestion-transcription/PHASE_2_PLAN.md)
- [Phase 2 Conversation Summary](phase-2-ingestion-transcription/Phase%202%20-%20CONVERSATION_SUMMARY.md)
- [Phase 3 Plan](phase-3-frame-extraction/PHASE_3_PLAN.md)
- [Phase 4 Plan](phase-4-gemini-classification/PHASE_4_PLAN.md)
