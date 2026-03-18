# SOP Automation Platform — Project Blueprint
## Version 2.0 | March 2026

---

## Architecture Summary

This platform automates the creation of Standard Operating Procedures (SOPs)
from Microsoft Teams knowledge transfer (KT) meeting recordings. It replaces
a manual process that takes 4-6 hours per SOP with an AI-assisted pipeline
that produces a draft SOP in ~4 minutes, requiring ~20-30 minutes of human review.

### Core Components

| Component | Technology | Purpose |
|---|---|---|
| React SPA | React 18 + TypeScript + Vite | Interactive SOP viewer + editor |
| FastAPI Backend | Python 3.11 + FastAPI | REST API + export generation |
| PostgreSQL | Supabase (transaction pooling, port 6543) | SOP data, transcripts, metadata |
| Frame Extractor | Python + FFmpeg + PySceneDetect | Video processing microservice |
| n8n Workflows | n8n (externally hosted) | Pipeline orchestration via webhooks |
| Azure Blob Storage | Azure | Video, image, and document storage |
| Cloudflare | Cloudflare Tunnel (sideloaded on host) | HTTPS exposure + CDN |

### Infrastructure

Three Docker containers run via Docker Compose on a single Azure VM.
Supabase provides the PostgreSQL database via transaction pooling (port 6543).
n8n is hosted externally and communicates with the platform via HTTP webhooks.
Cloudflare Tunnel runs as a sideloaded `cloudflared` daemon on the host machine —
not inside Docker — transparently routing internet traffic to the local containers
over HTTPS. The container images stay clean and portable, working identically
with or without Cloudflare.

```
Docker Compose (3 containers):
  sop-frontend    React (Vite)              :5173
  sop-api         FastAPI + Pillow + docx   :8000
  sop-extractor   FFmpeg + PySceneDetect    :8001

  Network: sop-network (bridge)
  Shared volume: ./data (uploads, frames, exports, templates)

External Services:
  Supabase        PostgreSQL via transaction pooler (port 6543)
  n8n             Externally hosted, webhook communication
  Cloudflare      Sideloaded cloudflared daemon on host (HTTPS :443)
  Azure Blob      Video, image, and document storage

Traffic flow:
  Internet → https://sop.yourdomain.com → cloudflared (host) → localhost:5173
  Internet → https://api.sop.yourdomain.com → cloudflared (host) → localhost:8000
  sop-api → HTTP POST → https://n8n-host.com/webhook/* (trigger pipelines)
  n8n → HTTP POST → https://api.sop.yourdomain.com/api/* (callbacks)
```

---

## Database Schema

See: `schema/001_initial_schema.sql`

**Provider:** Supabase (transaction pooling, port 6543)

### Key Tables

- **sops** — Master SOP record (title, status, video URL, metadata)
- **sop_steps** — Process steps with screenshots and timestamps
- **step_callouts** — Annotation markers on screenshots (position, confidence)
- **step_clips** — Short video clips per step
- **step_discussions** — Contextual Q&A from the KT session
- **transcript_lines** — Full meeting transcript with speaker ID
- **sop_sections** — AI-generated text sections (purpose, risks, SOW, etc.)
- **section_templates** — Defines the standard SOP structure + AI prompts
- **pipeline_runs** — Pipeline progress tracking and cost monitoring
- **sop_versions** — Version history snapshots

---

## n8n Workflows

n8n is hosted externally. All workflows are triggered via HTTP webhooks
from the FastAPI backend and communicate back via webhook callbacks.

### Workflow 1: Extraction Pipeline
See: `workflows/workflow_1_extraction.md`

**Trigger**: Webhook POST from sop-api when admin uploads MP4
**Duration**: ~3-4 minutes for a 60-minute recording
**Stages**:
1. Gemini transcription (parallel with screen share detection)
2. Azure Blob upload of original video
3. Frame extractor service call (HTTP to sop-extractor:8001)
4. Annotation matching loop (Gemini semantic + Vision OCR per frame)
5. Video clip extraction (HTTP to sop-extractor)
6. Media upload to Azure Blob
7. Triggers Workflow 2

### Workflow 2: Section Generation
See: `workflows/workflow_2_section_generation.md`

**Trigger**: Called by Workflow 1
**Duration**: ~30-60 seconds
**Stages**:
1. Load full transcript + step data from Supabase
2. Generate 17 section prompts (one per SOP section)
3. Batch call Gemini (4 parallel at a time)
4. Parse responses, upsert into sop_sections via Supabase
5. Apply step titles/descriptions from AI
6. Insert discussion context per step
7. Render Mermaid process map to PNG

### Workflow 3: Export Generation
See: `workflows/workflow_3_export.md`

**Trigger**: Webhook POST from sop-api when user clicks Export
**Duration**: ~10-30 seconds
**Stages**:
1. Load full SOP data from Supabase
2. Render any modified callout annotations (HTTP to sop-api internal endpoint)
3. Route by format (DOCX / PDF / Markdown)
4. DOCX: Template-based assembly with python-docx
5. PDF: LibreOffice headless conversion
6. Markdown: Direct generation for Confluence/Notion
7. Upload to Azure Blob, record in export_history

---

## Cost Estimates

### Per 60-minute meeting (Gemini 2.5 Flash):
- Transcription: ~$0.30
- Frame annotation: ~$0.03
- Section generation: ~$0.07
- Cloud Vision OCR: Free (under 1K units/month)
- Azure compute: ~$0.02
- **Total: ~$0.43 per SOP**

### Monthly (10 SOPs):
- Gemini API: ~$4.00
- Supabase: Free tier or ~$25/month (Pro plan)
- Azure VM (shared): already provisioned
- Azure Blob Storage: ~$1-2 (video + images)
- n8n hosted: depends on hosting plan
- Cloudflare: Free tier
- **Total incremental: ~$6-30/month**

---

## Build Plan

### Phase 1: Foundation (Week 1-2)
- [x] Docker Compose setup (3 containers)
- [x] Supabase PostgreSQL schema deployment
- [x] FastAPI skeleton with basic CRUD endpoints
- [ ] React project scaffolding
- [ ] StepSidebar + StepDetail components (read-only)
- [ ] Basic SOP page layout

### Phase 2: Video + Transcript (Week 2-3)
- [ ] VideoPlayer component (Video.js)
- [ ] useStepSync hook (video-step synchronisation)
- [ ] TranscriptPanel (virtualised, searchable)
- [ ] Video-to-step navigation
- [ ] Short clip mode toggle

### Phase 3: Callout Editor (Week 3-4)
- [ ] Konva canvas setup with layer architecture
- [ ] Drag-and-drop callout positioning
- [ ] Add/delete callout interactions
- [ ] Confidence colour coding (green/amber/red)
- [ ] Optimistic updates via TanStack Query
- [ ] Read mode fallback (image map, no Konva)

### Phase 4: Pipeline Integration (Week 4-5)
- [ ] Frame extractor Docker service
- [ ] n8n Workflow 1: Extraction Pipeline (webhook integration)
- [ ] n8n Workflow 2: Section Generation (webhook integration)
- [ ] Upload page with SSE progress
- [ ] Annotation hint → callout editor data flow

### Phase 5: Exports + Polish (Week 5-6)
- [ ] n8n Workflow 3: Export Generation (webhook integration)
- [ ] DOCX template creation
- [ ] PDF export via LibreOffice
- [ ] Dashboard page
- [ ] Cloudflare Tunnel configuration (sideload setup)
- [ ] Role-based access control
- [ ] Testing with real recordings

---

## File Structure

```
sop-platform/
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
├── schema/
│   ├── 001_initial_schema.sql
│   └── 002_seed_aged_debtor.sql
├── workflows/
│   ├── workflow_1_extraction.md
│   ├── workflow_2_section_generation.md
│   └── workflow_3_export.md
├── frontend/                        # React SPA
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── src/
│       ├── main.tsx
│       ├── routes/
│       │   ├── dashboard.tsx
│       │   ├── sop.$id.tsx         # Main SOP page
│       │   ├── sop.$id.procedure.tsx
│       │   ├── sop.$id.overview.tsx
│       │   ├── sop.$id.matrices.tsx
│       │   ├── sop.$id.history.tsx
│       │   └── sop.new.tsx         # Upload page
│       ├── components/
│       │   ├── VideoPlayer.tsx
│       │   ├── StepSidebar.tsx
│       │   ├── StepDetail.tsx
│       │   ├── CalloutEditor.tsx   # Konva canvas (lazy loaded)
│       │   ├── ScreenshotReadView.tsx
│       │   ├── TranscriptPanel.tsx
│       │   ├── EditToolbar.tsx
│       │   ├── PipelineProgress.tsx
│       │   └── ExportButtons.tsx
│       ├── hooks/
│       │   ├── useStepSync.ts
│       │   ├── useSOPStore.ts      # Zustand store
│       │   └── useCurrentUser.ts
│       └── api/
│           ├── client.ts           # TanStack Query + fetch wrapper
│           └── types.ts
├── api/                             # FastAPI backend
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── database.py
│       ├── models.py               # SQLAlchemy models
│       ├── schemas.py              # Pydantic schemas
│       ├── routes/
│       │   ├── sops.py
│       │   ├── steps.py
│       │   ├── sections.py
│       │   ├── exports.py
│       │   ├── media.py
│       │   └── pipeline.py
│       └── services/
│           ├── docx_generator.py
│           ├── annotation_renderer.py
│           └── mermaid_renderer.py
├── extractor/                       # Frame extraction service
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── scene_detector.py
│       ├── deduplicator.py
│       ├── clip_extractor.py
│       └── mermaid_renderer.py
├── templates/
│   └── default_sop_template.docx    # Master DOCX template
├── data/
│   ├── uploads/
│   ├── frames/
│   ├── exports/
│   └── templates/
└── scripts/
    └── verify_infrastructure.sh
```
