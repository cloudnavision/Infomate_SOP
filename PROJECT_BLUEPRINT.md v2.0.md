# SOP Automation Platform — Project Blueprint
## Version 2.0 | Originally March 2026 | Last Updated: 06 May 2026

---

## Architecture Summary

This platform automates the creation of Standard Operating Procedures (SOPs)
from Microsoft Teams knowledge transfer (KT) meeting recordings. It replaces
a manual process that takes 4-6 hours per SOP with an AI-assisted pipeline
that produces a draft SOP in ~4 minutes, requiring ~20-30 minutes of human review.

### Core Components

| Component | Technology | Purpose |
|---|---|---|
| React SPA | React 18 + TypeScript + Vite + Tailwind + TanStack Router/Query | Interactive SOP viewer + editor |
| FastAPI Backend | Python 3.11 + FastAPI + SQLAlchemy | REST API + export generation |
| PostgreSQL | Supabase (transaction pooling, port 6543) | SOP data, transcripts, metadata |
| Frame Extractor | Python + FFmpeg + PySceneDetect + imagehash | Video processing microservice |
| n8n Workflows | n8n (externally hosted) | Pipeline orchestration via webhooks |
| Azure Blob Storage | Azure | Video, image, and document storage |
| Cloudflare | Cloudflare Tunnel + ZTNA | HTTPS exposure + Zero Trust access control |

### Infrastructure

```
Docker Compose (3 containers):
  sop-frontend    React (Vite)              :5173
  sop-api         FastAPI + Pillow + docx   :8000
  sop-extractor   FFmpeg + PySceneDetect    :8001

  Network: sop-network (bridge)
  cloudflared: network_mode: host (not inside sop-network)

External Services:
  Supabase        PostgreSQL via transaction pooler (port 6543)
  n8n             Externally hosted, webhook communication
  Cloudflare      soptest.cloudnavision.com → localhost:8001 (sop-extractor)
  Azure Blob      infsop container (video, frames, exports)

n8n Workflows:
  WF0   Smart Ingest & Auto-Split     SharePoint → Blob → Gemini → Supabase
  WF1   Transcription + Screen Detect Gemini File API (API key, NOT Vertex AI)
  WF2b  Frame Extraction (Sync)       sop-extractor:8001, 600s timeout
  WF3c  Full Hybrid Annotation        Vertex AI + Cloud Vision (GCP service account)
```

---

## Database Schema (14 tables, 6 migrations)

**Core:**
- `sops` — Master SOP record (title, status, video_url, project_code, is_merged, views, likes)
- `sop_steps` — Process steps (sequence, description, screenshot_url, timestamps)
- `step_callouts` — Annotation markers (x, y, original_x, original_y, confidence, label)
- `step_clips` — Short video clips per step
- `step_discussions` — Contextual Q&A from KT session

**Content:**
- `transcript_lines` — Full meeting transcript (speaker, text, start_time)
- `sop_sections` — AI-generated text sections (purpose, risks, SOW, 17 sections)
- `section_templates` — Standard SOP structure + AI prompts

**Operations:**
- `pipeline_runs` — Pipeline progress (status enum: queued/transcribing/detecting_screenshare/extracting_frames/deduplicating/classifying_frames/generating_annotations/extracting_clips/generating_sections/completed/failed)
- `sop_versions` — Version history snapshots
- `export_history` — Export records (format, blob URL, size)

**Merge system:**
- `sop_merge_sessions` — Merge session (source_sop_ids, merged_sop_id, status)
- `process_groups` — Group name, auto-generated code (GRP-001), source SOPs
- `users` — User accounts (email, role: viewer/editor/admin)

**Migrations:**
- `001_initial_schema.sql`
- `002_seed_aged_debtor.sql`
- `003_add_views_likes.sql`
- `004_sop_version_merge.sql`
- `005_is_merged.sql`
- `006_process_groups.sql`

---

## n8n Workflows (as built)

### WF0: Smart Ingest & Auto-Split
**File:** `n8n-workflows/Saara - SOP_WF0 - Smart Ingest & Auto-Split 2.json`
**Trigger:** Watches SharePoint folder for new MP4 files
**Flow:** SharePoint → Azure Blob upload → Gemini screen detection prompt → split if > 55 min → create sop + pipeline_run → trigger WF1
**Long video handling:** ONE sop record, original video URL; Part 2 timestamps offset by `actual_split_sec` → absolute positions

### WF1: Transcription + Screen Detection
**File:** `n8n-workflows/Saara - SOP_Workflow 1 - Complete Workflow v2.json`
**Auth:** Gemini File API with API key (NOT Vertex AI — File API not on Vertex AI)
**Key settings:** `thinkingLevel: "minimal"`, `maxOutputTokens: 100000` (fixes transcript cutoff)
**Nodes:** Upload video → Poll for ACTIVE → Transcribe → Detect screen periods → Fix Screen Periods (crop: `y += 30, h -= 60`) → upsert transcript_lines + sop_steps

### WF2b: Frame Extraction (Synchronous)
**File:** `n8n-workflows/Saara - SOP_Workflow 2b - Frame Extraction v2 (Sync).json`
**Flow:** Poll pipeline_runs for `extracting_frames` → POST to sop-extractor → wait 600s → update status
**EXTRACTOR_URL:** Must be `http://sop-extractor:8001` (not Cloudflare URL — 100s timeout kills long extractions)
**Known issue:** Remove `supabase_url` + `supabase_service_key` from Build Extract Request payload (causes duplicate step inserts)

### WF3c: Full Hybrid Annotation (Service Account)
**File:** `n8n-workflows/v2-service-account/Saara - SOP_Workflow 3c - Full Hybrid (Service Account) v3.json`
**Auth:** GCP service account "Saara - Google Service Account account" (covers both Gemini Vision + OCR)
**Vertex AI flow:** Download frame from Azure Blob → Convert to base64 → Build Gemini request with `inlineData.data` (raw base64, no `data:image/png;base64,` prefix) → Call Vertex AI
**v3 fix:** Removed `JSON.stringify()` from all 4 jsonBody nodes (n8n's `specifyBody: "json"` already serialises — double-encoding caused `URL_REJECTED`)

---

## Build Plan — All Phases Complete

### Phase 1: Foundation ✅ Complete (March 2026)
- [x] Docker Compose setup (3 containers + cloudflared host daemon)
- [x] Supabase PostgreSQL schema deployment
- [x] FastAPI skeleton with CRUD endpoints
- [x] React project scaffolding (Vite + TanStack Router + TanStack Query + Tailwind)
- [x] Basic SOP page layout

### Phase 1.5: Auth ✅ Complete (March 2026)
- [x] Cloudflare ZTNA role-based access (viewer/editor/admin)
- [x] useCurrentUser hook, role gates in components

### Phase 2: n8n Ingestion Pipeline ✅ Complete (March 2026)
- [x] WF0 Smart Ingest (SharePoint → Blob → Gemini → Supabase)
- [x] WF1 Transcription + Screen Detection (Gemini File API)
- [x] pipeline_runs status tracking
- [x] Upload page with SSE pipeline progress

### Phase 3: Frame Extraction ✅ Complete (March 2026)
- [x] sop-extractor Docker service (FFmpeg + PySceneDetect + imagehash)
- [x] WF2b Synchronous Frame Extraction
- [x] scene_detector.py, deduplicator.py, clip_extractor.py

### Phase 4: Annotation ✅ Complete (April 2026)
- [x] WF3c Full Hybrid (Gemini Vision + Cloud Vision OCR)
- [x] Confidence color coding (green/amber/red)
- [x] step_callouts with original_x/y for first-reposition tracking
- [x] PATCH /api/steps/{id}/callouts bulk update
- [x] POST /api/steps/{id}/render-annotated (Pillow → Azure Blob)

### Phase 4b: Service Account Migration ✅ Built / ⏳ Pending n8n activation
- [x] WF3c v3 JSON with double-encoding fix
- [x] Base64 inlineData (no data URL prefix)
- [ ] Delete old WF3c in n8n → import v3 → select service account credential → activate

### Phase 5: Clip Extraction ✅ Complete (April 2026)
- [x] clip_extractor.py (FFmpeg trim + Azure Blob upload)
- [x] step_clips table
- [x] VideoPlayer clip mode toggle

### Phase 6: Video + Transcript UI ✅ Complete (April 2026)
- [x] VideoPlayer (Video.js, timestamp sync, clip mode)
- [x] TranscriptPanel (virtualised, searchable, speaker filter, auto-scroll)
- [x] useStepSync hook (3-way sync: video ↔ step ↔ transcript, seekSource guard)
- [x] StepCard (description, screenshot lightbox, KT quote, Play from timestamp, callouts, discussions)
- [x] SOPPageHeader (title, metadata, export buttons)
- [x] StepSidebar with SECTIONS block

### Phase 7: Exports + Dashboard Polish ✅ Complete (April 2026)
- [x] DOCX/PDF export (docxtpl template + LibreOffice headless)
- [x] export_history table + GET /api/sops/{id}/exports
- [x] Dashboard search bar, pipeline status badges on SOPCard
- [x] "Open →" + "Export PDF" card buttons
- [ ] 7c: Cloudflare ZTNA configuration (deferred — pure dashboard config, no code)

### Phase 8: Annotation Editor ✅ Complete (April 2026)
- [x] AnnotationEditorModal (full-screen Konva canvas)
- [x] Drag dots to reposition, delete callouts
- [x] Color coding: green=OCR, amber=gemini_only, blue=repositioned
- [x] PATCH /api/steps/{id}/callouts bulk update
- [x] "✎ Edit Callouts" button in StepCard (editor/admin only)

### Phase 9: Role-Based UI + UX Polish ✅ Complete (April 2026)
- [x] Compact SOPPageHeader with clickable status dropdown (editor/admin)
- [x] Views + like count + interactive like button (all roles)
- [x] Tab role gates: History=editor+, Metrics=editor+, Process Map edit=editor+
- [x] Metrics tab: 3 views (viewer/editor/admin)
- [x] Step deletion with sequence re-numbering (DELETE /api/steps/{id})
- [x] SOP status change (PATCH /api/sops/{id}/status)
- [x] Process Map: read-only preview for viewers

### Phase 10: SOP Version Merge ✅ Complete (April 2026)
- [x] /merge page: stats row, Merged SOPs tab, Source Groups tab
- [x] Process Groups: auto-generated GRP-001 codes, group name as primary label
- [x] Merge flow: Compare → diff review → preview → finalize (copies steps + clips)
- [x] Merged SOPs: separate from dashboard, titled `{group name} (Updated)`
- [x] Delete group: removes merged SOPs + clears source project_codes
- [x] DB migrations: 004, 005, 006
- [x] API routes: /api/merge/*, /api/process-groups/*

### Phase 11: UX Polish II ✅ Complete (May 2026)
- [x] Settings/Users page: UserManagementTable rewrite (avatar gradients, stats cards, search, role filter pills, invite panel, always-visible Edit+X buttons)
- [x] Role Permissions sidebar: left border accent, no duplicate role name, plain SVG icons
- [x] Overview page: SOPDetailsCard, stats strip, approval progress bar, stacked avatars, animated status badge
- [x] History tab: date grouping, timeline connector fix, show-more pagination
- [x] Merge page: clickable stat cards, animated Ready badge, numbered recording circles, Merged Output divider, gradient Compare & Merge button, modal redesign

---

## File Structure (actual — as of May 2026)

```
sop-platform/
├── docker-compose.yml
├── .env.example
├── schema/
│   ├── 001_initial_schema.sql
│   ├── 002_seed_aged_debtor.sql
│   ├── 003_add_views_likes.sql
│   ├── 004_sop_version_merge.sql
│   ├── 005_is_merged.sql
│   └── 006_process_groups.sql
├── n8n-workflows/
│   ├── Saara - SOP_WF0 - Smart Ingest & Auto-Split 2.json
│   ├── Saara - SOP_Workflow 1 - Complete Workflow v2.json
│   ├── Saara - SOP_Workflow 2b - Frame Extraction v2 (Sync).json
│   └── v2-service-account/
│       └── Saara - SOP_Workflow 3c - Full Hybrid (Service Account) v3.json
├── docs/
│   └── superpowers/
│       ├── specs/
│       └── plans/
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── src/
│       ├── main.tsx
│       ├── routeTree.gen.ts          # Auto-generated by TanStack Router
│       ├── routes/
│       │   ├── __root.tsx
│       │   ├── dashboard.tsx
│       │   ├── settings.tsx          # User management + role permissions
│       │   ├── sop.new.tsx           # Upload + SSE pipeline progress
│       │   ├── sop.$id.tsx           # SOP shell (tabs layout)
│       │   ├── sop.$id.procedure.tsx # 3-col grid: sidebar + video + stepcard
│       │   ├── sop.$id.overview.tsx  # SOPDetailsCard + stats + approval bar
│       │   ├── sop.$id.processmap.tsx
│       │   ├── sop.$id.history.tsx   # Date-grouped audit trail
│       │   ├── sop.$id.metrics.tsx   # Views/likes/approval stats
│       │   ├── merge.tsx             # Merge shell
│       │   ├── merge.index.tsx       # Merged SOPs + Source Groups tabs
│       │   ├── merge.$sessionId.tsx
│       │   ├── merge.$sessionId.index.tsx
│       │   └── merge.$sessionId.preview.tsx
│       ├── components/
│       │   ├── VideoPlayer.tsx
│       │   ├── StepSidebar.tsx
│       │   ├── StepCard.tsx
│       │   ├── AnnotationEditorModal.tsx  # Konva canvas (lazy loaded)
│       │   ├── TranscriptPanel.tsx
│       │   ├── SOPPageHeader.tsx
│       │   ├── PipelineProgress.tsx
│       │   └── UserManagementTable.tsx    # Phase 11 full rewrite
│       ├── hooks/
│       │   ├── useStepSync.ts
│       │   └── useCurrentUser.ts
│       └── api/
│           ├── client.ts
│           └── types.ts
├── api/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── database.py
│       ├── models.py
│       ├── schemas.py
│       └── routes/
│           ├── sops.py
│           ├── steps.py
│           ├── sections.py
│           ├── exports.py
│           ├── media.py
│           ├── pipeline.py
│           └── merge.py              # Phase 10
├── extractor/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── scene_detector.py         # PySceneDetect + imagehash
│       ├── deduplicator.py
│       ├── clip_extractor.py
│       ├── doc_renderer.py
│       ├── sop_comparator.py         # Phase 10 merge diff
│       └── annotator.py              # Pillow callout rendering
└── templates/
    └── default_sop_template.docx
```

---

## Pending Improvements

| # | Task | File | Priority |
|---|---|---|---|
| 1 | Activate WF3c v3 in n8n | n8n UI (manual) | High |
| 2 | Fix WF2 EXTRACTOR_URL to `http://sop-extractor:8001` | n8n UI (manual) | High |
| 3 | Fix WF2 duplicate inserts (remove supabase keys from payload) | n8n UI (manual) | High |
| 4 | Import WF1 v2 + test | n8n UI | High |
| 5 | Import WF2b v2 + test | n8n UI | High |
| 6 | Time-based frame fallback (force frame every ~2 min) | `extractor/app/scene_detector.py` | Medium |
| 7 | Fix Screen Periods permanent crop fix (`y += 30, h -= 60`) | WF1 JSON Fix Screen Periods node | Medium |
| 8 | Resume parked pipeline run `0029ccd6` | Supabase SQL | Low (when ready) |
| 9 | Re-import WF0 with updated Teams UI filtering prompts | n8n UI | Low |
