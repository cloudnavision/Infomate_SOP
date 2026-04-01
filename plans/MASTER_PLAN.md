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
| 3 | **Frame Extraction** | sop-extractor: FFmpeg + PySceneDetect, n8n trigger, frame metadata to Supabase | ✅ Complete |
| 4 | **Gemini Classification** | n8n Workflow 3b (Gemini Only): gemini_description + step_callouts per frame | ✅ Complete ⚠️ |
| 5 | **Extracting Clips** | n8n Workflow 4: FFmpeg clips per step → Azure Blob → step_clips rows | ◀ Next |
| 6 | **Video + Transcript UI** | VideoPlayer, step sync, TranscriptPanel | ⬜ Pending |
| 7 | **Exports + Polish** | DOCX/PDF generation, dashboard, Cloudflare ZTNA | ⬜ Pending |

> ⚠️ Phase 4 note: Running on **Workflow 3b (Gemini Only)** — ~60% coordinate accuracy. Full hybrid (Workflow 3) needs GCP Vision API billing enabled ($10 prepayment). `target_y` values unreliable for toolbar elements — all callouts have `confidence = 'gemini_only'`.

---

## Docker Architecture (3 Containers + 3 External Services)

> **Architecture updated based on TL feedback** — 3 containers only. cloudflared removed from Docker Compose.
> sop-api is the single external entry point. sop-extractor is internal only.

```
External traffic:
                                        Host daemon
n8n / browser → soptest.cloudnavision.com ──────────► localhost:8000 (sop-api)
                                                              │
                              ┌───────────────────────────────┘
                              │  Docker network: sop-network
                              ▼
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  sop-frontend   React (Vite/serve)  :5173  ◄─ browser   │
│  sop-api        FastAPI             :8000  ◄─ Cloudflare │
│  sop-extractor  FFmpeg+Python       :8001  (internal)    │
│                                                          │
│  sop-api → http://sop-extractor:8001  (Docker network)   │
│  Shared volume: ./data                                   │
│  Network: sop-network                                    │
└──────────────────────────────────────────────────────────┘
         │              │
         ▼              ▼
External Services (not in Docker Compose):
- Supabase     PostgreSQL via transaction pooler, port 6543
- n8n          Hosted externally — calls soptest.cloudnavision.com/api/extract
- Cloudflare   Host daemon (cloudflared tunnel run --token <TOKEN>)
               soptest.cloudnavision.com → localhost:8000 (sop-api ONLY)
```

| Container | Port | Exposed externally | Role |
|-----------|------|-------------------|------|
| sop-frontend | 5173 | Via Cloudflare (future) | React SPA |
| sop-api | 8000 | ✅ Via Cloudflare tunnel | FastAPI — CRUD, proxy to extractor |
| sop-extractor | 8001 | ❌ Internal only | FFmpeg + PySceneDetect + Mermaid |

| External Service | Where | How connected |
|-----------------|-------|---------------|
| Supabase | Supabase cloud | DATABASE_URL (transaction pooler, port 6543) |
| n8n | External hosted | Calls `soptest.cloudnavision.com/api/extract` |
| Cloudflare Tunnel | Host daemon | `cloudflared tunnel run --token <TOKEN>` → `:8000` |

**Request flow (n8n → extractor):**
```
n8n → POST soptest.cloudnavision.com/api/extract
    → Cloudflare tunnel → localhost:8000 (sop-api)
    → sop-api proxy → http://sop-extractor:8001/extract
    → response back through the same chain
```

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
Phase 3: Frame Extraction                   ✅ Complete
  └─ sop-extractor: FFmpeg + PySceneDetect
  └─ n8n Workflow 2 polls extracting_frames records
  └─ Frame metadata written to Supabase
         │
         ▼
Phase 4: Gemini Classification              ✅ Complete ⚠️
  └─ n8n Workflow 3b (Gemini Only) — gemini_description + step_callouts
  └─ 151 callouts for test SOP, all confidence = gemini_only
  └─ Full hybrid (Workflow 3) blocked on GCP Vision billing
         │
         ▼
Phase 5: Extracting Clips                   ◀ Next
  (n8n Workflow 4: FFmpeg clips per step → Azure Blob → step_clips rows)
         │
         ▼
Phase 6: Video + Transcript UI
  (VideoPlayer, useStepSync, TranscriptPanel)
         │
         ▼
Phase 7: Exports + Polish
  (DOCX/PDF, dashboard, Cloudflare ZTNA)
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

## Key Decisions (Do Not Re-Debate)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Gemini auth = API key (AI Studio), not Vertex AI | Vertex AI scopes incompatible with Gemini File API at `generativelanguage.googleapis.com` |
| 2 | n8n re-import: DELETE old workflow first | Avoids "1" suffix renaming on all nodes |
| 3 | Cloudflare tunnel: `cloudflared` as host daemon | More reliable than container; avoids Docker-in-Docker networking |
| 4 | sop-extractor: Docker bridge network only | Accessed via internal DNS `http://sop-extractor:8001`; NOT `network_mode: host` |
| 5 | Gemini File API polling loop | `Wait(10s) → GET file status → IF state==ACTIVE`; use `$json.uri` not nested path after node renaming |
| 6 | Mark file processed BEFORE Gemini | Prevents duplicate Azure uploads on pipeline retry |
| 7 | n8n Cloud binary data | Code nodes cannot access binary (filesystem-v2 refs). Upload via HTTP Request node → Gemini Files API → use `fileData.fileUri` in generateContent |
| 8 | Phase 4 running Gemini-only (Workflow 3b) | Vision OCR blocked on GCP billing ($10 prepayment). Switch to Workflow 3 when enabled. |

---

## Pipeline Status Flow

```
queued → transcribing → detecting_screenshare → extracting_frames
→ deduplicating → classifying_frames → generating_annotations
→ extracting_clips → generating_sections → completed | failed
```

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
- [Phase 3 Issues](phase-3-frame-extraction/PHASE_3_ISSUES.md)
- [Phase 3 Specs](phase-3-frame-extraction/3a_extractor_endpoints.md)
- [Phase 3 Conversation Summary](phase-3-frame-extraction/Phase%203%20-%20CONVERSATION_SUMMARY.md)
- [Phase 4 Plan](phase-4-annotation/PHASE_4_PLAN.md)
- [Phase 4 Conversation Summary](phase-4-annotation/Phase%204%20-%20CONVERSATION_SUMMARY.md)
- [Phase 5 Plan](phase-5-extracting-clips/PHASE_5_PLAN.md)
- [Phase 5 — 5a Extractor Clip Endpoint](phase-5-extracting-clips/5a_sop_extractor_clip_endpoint.md)
- [Phase 5 — 5b n8n Workflow 4](phase-5-extracting-clips/5b_n8n_workflow_4.md)
