# SOP Automation Platform — Master Plan

## Overview

Automate the creation of Standard Operating Procedures from Teams KT recordings.
Target: 4-6 hour manual process → ~4 min pipeline + ~20-30 min human review.
Client: Starboard Hotels (BPO company, 5-15 SOPs/month)

---

## Phase Status

| Phase | Name | Status |
|-------|------|--------|
| 1 | Foundation (schema, FastAPI CRUD, Docker, React scaffold) | ✅ Complete |
| 1.5 | Auth (Supabase JWT, RBAC, user routes) | ✅ Complete |
| 2 | Ingestion (SharePoint → Azure Blob → Gemini transcription → DB) | ✅ Complete |
| 3 | Frame Extraction (sop-extractor, n8n frame nodes) | ⏳ Next — BLOCKED |
| 4 | Annotation (Gemini semantic + Vision OCR + matching algorithm) | 🔲 Pending |
| 5 | Clips + Section Generation (video clips, n8n Workflow 2) | 🔲 Pending |
| 6 | Frontend Viewer (VideoPlayer, StepSync, TranscriptPanel) | 🔲 Pending |
| 7 | Editor & Review (Konva editor, review workflow, read mode) | 🔲 Pending |
| 8 | Exports + Polish (DOCX/PDF/Markdown, dashboard, production) | 🔲 Pending |

---

## Architecture (Current)

```
Internet
  ↓
Cloudflare Edge (soptest.cloudnavision.com)
  ⚠ Bot Fight Mode — BLOCKED for n8n (awaiting TL fix)
  ↓ QUIC tunnel
sop-api container (port 8000)
  ├── cloudflared (sideloaded in start.sh)
  └── FastAPI
        └── POST /api/extract → proxy to sop-extractor:8001
                                        ↓
                              sop-extractor container (port 8001)
                                        ├── FFmpeg
                                        ├── PySceneDetect
                                        └── OpenCV + imagehash

sop-frontend container (port 5173)
  └── React + Vite

Network: sop-network (Docker bridge)
External DNS: soptest.cloudnavision.com → Cloudflare tunnel → sop-api:8000
```

### Container Summary

| Container | Port | Purpose |
|-----------|------|---------|
| sop-api | 8000 (internal) | FastAPI — all public HTTP routes, cloudflared sideloaded |
| sop-extractor | 8001 (Docker DNS only) | FFmpeg + PySceneDetect + OpenCV — never exposed publicly |
| sop-frontend | 5173 | React Vite dev server |

---

## Current Blocker

**Cloudflare Bot Fight Mode** is blocking n8n's POST to `/api/extract`.

- Error: HTTP 403, `cType: managed`, "Enable JavaScript and cookies to continue"
- Root cause: n8n does not execute JavaScript, so Cloudflare's Bot Fight Mode challenge cannot be satisfied
- Fix required: TL must add a WAF Skip Rule in Cloudflare dashboard to bypass Bot Fight Mode for requests containing the `x-internal-key: sop-pipeline-2024` header
- See `BLOCKERS.md` in repo root for full details and fix options

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `sops` | Top-level SOP record (title, client, status) |
| `sop_steps` | Individual steps with screenshot, timestamp, review_status |
| `step_callouts` | Annotation hotspots per step (x, y, label, confidence) |
| `step_clips` | Short MP4 clips per step |
| `step_discussions` | Review comments per step |
| `transcript_lines` | Raw transcript from Gemini with speaker + timestamp |
| `sop_sections` | AI-generated content sections (17 section types) |
| `section_templates` | Prompt templates for section generation |
| `pipeline_runs` | Ingestion pipeline job tracking |
| `sop_versions` | Published version history |
| `export_history` | DOCX/PDF/Markdown export records |
| `users` | User accounts with roles |
| `property_watchlist` | Starboard Hotels property assignments |

---

## n8n Pipeline Status Enums

Valid values for `pipeline_runs.pipeline_status`:

```
queued → transcribing → detecting_screenshare → extracting_frames
→ deduplicating → classifying_frames → generating_annotations
→ extracting_clips → generating_sections → completed | failed
```

---

## Sub-Plans

- [Phase 3 — Frame Extraction](phase-3-frame-extraction/PHASE_3_PLAN.md)
- [Phase 4 — Annotation](phase-4-annotation/PHASE_4_PLAN.md)
- [Phase 5 — Clips + Section Generation](phase-5-clips-sections/PHASE_5_PLAN.md)
- [Phase 6 — Frontend Viewer](phase-6-frontend-viewer/PHASE_6_PLAN.md)
- [Phase 7 — Editor & Review](phase-7-editor-review/PHASE_7_PLAN.md)
- [Phase 8 — Exports + Polish](phase-8-exports-polish/PHASE_8_PLAN.md)

---

## Key Decisions (Do Not Re-Debate)

1. **Gemini auth**: API key via AI Studio, not Vertex AI service account. (Vertex AI scopes incompatible with Gemini File API at `generativelanguage.googleapis.com`)
2. **n8n re-import**: DELETE old workflow first, then import fresh — avoids "1" suffix renaming on all nodes
3. **Cloudflare tunnel**: `cloudflared` sideloaded inside `sop-api` container via `start.sh` (not separate container)
4. **sop-extractor network**: Docker bridge (`sop-network`), accessed via internal DNS `http://sop-extractor:8001`. NOT `network_mode: host`.
5. **Gemini File API polling**: `Wait(10s) → GET file status → IF state==ACTIVE` loop. Use `$json.uri` not nested path after node renaming.
6. **Mark file processed BEFORE Gemini**: prevents duplicate uploads on pipeline retry

---

_Last updated: 2026-03-27_
