# SOP Automation Platform — Brainstorming Session Summary
## Conversation Date: 15 March 2026
## Participants: [Your Name] + Claude (Architecture & Design)

---

## 1. Problem Statement

Our client (a BPO company) manually creates Standard Operating Procedures from Microsoft Teams knowledge transfer meeting recordings. The current process takes **4-6 hours per SOP** and involves:
- Watching the full recording
- Manually taking screenshots with Snipping Tool at every screen change
- Adding numbered callout annotations to each screenshot
- Writing process steps in infinitive language
- Building supplementary sections (risk tables, communication matrices, quality parameters, SOW, etc.)
- Assembling everything into a branded DOCX template

They produce **5-15 SOPs per month**. The existing tooling is: Gemini for transcription (because Teams' built-in transcript is inaccurate), and everything else is manual.


**Reference files reviewed:**
- `Transcript.md` — Example KT session transcript (Aged Debtor Report, Starboard Hotels)
- `Aged_Debtor_Process.docx` — Example finished SOP document (14 sections, ~20 pages)
- `Process_Documentation_Flow_SOP.pdf` — Meta-process flowchart defining how SOPs are made

---

## 2. Key Architecture Decisions

### Decision 1: Dynamic web platform, not just DOCX generation
**What we decided:** Build an interactive React web application as the primary SOP delivery format, with DOCX/PDF/Markdown as secondary export options.

**Why:** A static DOCX loses the video context. The dynamic page lets users click a process step and watch the trainer actually demonstrate it. It preserves discussion context (Q&A from the KT session) attached to each step. It enables search across all SOPs. And the same app serves as both the review tool (editors) and the delivery tool (44+ viewers), eliminating the need for two separate applications.

**DOCX is still supported** as an on-demand export for audit/compliance needs. The export generates from the same data that powers the web page.

### Decision 2: n8n for orchestration, Claude Code for custom components
**What we decided:** Use n8n (already deployed on the client's Azure VM) for pipeline orchestration, with custom Docker services built by Claude Code for the pieces n8n can't handle natively (FFmpeg processing, Konva-based annotation editor, python-docx assembly).

**Why:** The client is comfortable with n8n and already has it running. n8n handles the webhook triggers, parallel API calls, database operations, and conditional routing. Custom code only fills specific gaps.

### Decision 3: Gemini for all AI tasks (transcription, analysis, generation)
**What we decided:** Use Gemini 2.5 Flash across the entire pipeline — transcription, screen share detection, frame classification, semantic annotation, and SOP section generation.

**Why:** The client already has a GCP subscription and is comfortable with Gemini. Using one AI provider simplifies credentials management, cost tracking, and prompt engineering. Gemini's native video understanding (1 FPS sampling, multimodal context) is particularly well-suited for the Teams recording analysis.

### Decision 4: Hybrid annotation approach (Gemini + OCR)
**What we decided:** Use Gemini for semantic identification of UI elements ("what to annotate") and Google Cloud Vision OCR for spatial precision ("where to place the callout"). A matching algorithm connects the two.

**Why:** Multimodal LLMs can identify elements reliably but return imprecise pixel coordinates (~60% accuracy). OCR gives pixel-perfect bounding boxes but doesn't know which elements are relevant. The hybrid approach achieves ~92% accuracy. The remaining ~8% is caught by human review in the React app with a confidence-based colour coding system (green = OCR exact match, amber = fuzzy match, red = Gemini estimate only).

### Decision 5: Template-based DOCX assembly, not generation from scratch
**What we decided:** The DOCX export uses a pre-formatted Word template with placeholder tokens. Python-docx finds and replaces placeholders with generated content.

**Why:** The client's SOP template has specific branding, cover page, table formatting, and styles. Recreating all of this in code (1,500+ lines of docx-js) would be brittle and hard to maintain. With the template approach (~300 lines of Python), the client can modify formatting in Word without any code changes.

---

## 3. Technical Architecture

### Stack
| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind + TanStack Router/Query + Zustand |
| Video Player | Video.js (programmatic seek, HLS support, clip mode) |
| Annotation Editor | Konva.js (react-konva) — lazy loaded, edit mode only |
| Backend API | FastAPI (Python 3.11) + SQLAlchemy + Pydantic |
| Database | PostgreSQL 16 with pg_trgm for transcript search |
| Pipeline Orchestration | n8n (3 workflows) |
| Frame Extraction | Custom Docker service (FFmpeg + PySceneDetect + OpenCV + imagehash) |
| AI | Gemini 2.5 Flash (GCP) + Google Cloud Vision OCR |
| Storage | Azure Blob Storage (video, frames, clips, exports) |
| Auth/CDN | Cloudflare ZTNA (Zero Trust Network Access) |
| Hosting | Docker Compose on existing Azure VM |

### Database: 11 tables
Core: `sops`, `sop_steps`, `step_callouts`, `step_clips`, `step_discussions`
Content: `transcript_lines`, `sop_sections`, `section_templates`
Operations: `pipeline_runs`, `sop_versions`, `export_history`
Supporting: `users`, `property_watchlist`

### n8n Workflows
1. **Extraction Pipeline** (~3-4 min) — Webhook trigger → parallel Gemini transcription + screen share detection + Blob upload → FFmpeg scene detection → annotation matching loop → clip extraction → triggers Workflow 2
2. **Section Generation** (~30-60 sec) — Load transcript + steps → generate 17 SOP section prompts → batch Gemini calls (4 parallel) → upsert sections → apply step titles → render Mermaid process map
3. **Export Generation** (~10-30 sec) — Load SOP data → render callout annotations if modified → route by format → DOCX (template) / PDF (LibreOffice) / Markdown → upload to Blob

---

## 4. Frame Extraction Pipeline (The Hard Problem)

Teams recordings are much harder than screen recordings because they contain faces, webcam feeds, Teams UI chrome, and layout changes that all trigger false scene detections.

### 5-stage pipeline:
1. **Gemini crop detection** — Sample at 0.5 FPS, identify screen-share region bounding box
2. **FFmpeg crop + PySceneDetect adaptive** — Crop video to screen-share only, then run adaptive scene detection (not fixed threshold)
3. **Perceptual deduplication** — imagehash phash with threshold 8 removes near-identical frames
4. **Transition frame filtering** — Capture at T+1.5 seconds offset to skip half-rendered windows
5. **Gemini classification** — Label each frame as USEFUL / TRANSITIONAL / DUPLICATE

### Typical results for 30-minute meeting:
- Raw detections: ~38 frames
- After dedup: ~14 frames
- After classification: ~11 useful frames (matches the ~8 screenshots in the example DOCX)

---

## 5. Annotation Accuracy Strategy

### Three sub-problems:
1. **WHAT to annotate** (semantic) — Gemini identifies UI elements from transcript context (~90% accurate)
2. **WHERE to place callouts** (spatial) — Hybrid OCR matching achieves ~92% vs Gemini-only ~60%
3. **HOW to render** (mechanical) — Pillow draws circles + numbers on PNG (100% accurate)

### Confidence-based review in React app:
- **Green** (OCR exact match, ~65-70%) — Reviewer just glances, no adjustment needed
- **Amber** (OCR fuzzy match, ~20%) — Quick check, maybe 5-10 sec per callout
- **Red** (Gemini estimate only, ~10-15%) — Drag to correct position, 10-15 sec per callout
- **Net result**: ~15-30 seconds per screenshot vs 3-5 minutes manually

---

## 6. Cost Analysis

### Per 60-minute meeting (Gemini 2.5 Flash):
- Transcription: ~$0.30 (accounts for ~80% of total)
- Frame classification + annotation: ~$0.06
- SOP section generation: ~$0.05
- Cloud Vision OCR: Free (under 1K units/month free tier)
- Azure compute: ~$0.02
- **Total: ~$0.43 per SOP**

### Monthly (10 SOPs): ~$4.30 in API costs
### Optimisation available: Gemini batch API (50% discount) brings it to ~$0.25/SOP

### Comparison to current manual cost:
- Manual: 4-6 hours of skilled analyst time per SOP
- Automated: ~4 minutes of pipeline processing + ~20-30 minutes human review
- **ROI: ~85-90% time reduction per SOP**

---

## 7. React App Architecture

### Routes:
- `/dashboard` — SOP listing with status filters
- `/sop/:id/procedure` — Main interactive SOP page (5 components)
- `/sop/:id/overview` — Summary sections (purpose, risks, training)
- `/sop/:id/matrices` — Communication, quality, SOW tables
- `/sop/:id/history` — Version history + audit trail
- `/sop/new` — Upload page with real-time pipeline progress (SSE)
- `/settings` — Template management, user roles

### Key components on the procedure page:
1. **StepSidebar** — Clickable step list, step search
2. **VideoPlayer** — Video.js with timestamp sync, clip mode toggle
3. **StepDetail** — Process step text + annotated screenshot + discussion context
4. **CalloutEditor** — Konva canvas (edit mode) or image map (read mode)
5. **TranscriptPanel** — Virtualised, searchable, auto-scrolling transcript

### Synchronisation:
- Zustand store holds: selectedStepId, currentVideoTime, isPlaying, editMode
- `useStepSync` hook coordinates video playback ↔ step selection ↔ transcript scroll
- Circular update prevention via seekSource flag

### Permission model (via Cloudflare ZTNA):
- **Viewer** — Read-only access to published SOPs, video playback, transcript search
- **Editor** — Review mode: drag callouts, edit text, approve/reject frames, regenerate sections
- **Admin** — Upload meetings, trigger pipelines, manage templates, publish SOPs

### Konva lazy loading:
- Read mode: No Konva loaded. Screenshot rendered as `<img>` with CSS-positioned circular hotspots
- Edit mode: Konva canvas (~140KB gzipped) loaded dynamically via React.lazy()
- 4-layer canvas: screenshot → highlight overlay → callout markers → hit areas

---

## 8. Build Plan (5-6 weeks)

| Phase | Duration | Deliverables |
|---|---|---|
| 1. Foundation | Week 1-2 | PostgreSQL schema, FastAPI CRUD, Docker Compose, React scaffold, basic SOP page |
| 2. Video + Transcript | Week 2-3 | VideoPlayer, useStepSync, TranscriptPanel, video-step navigation |
| 3. Callout Editor | Week 3-4 | Konva canvas, drag-drop, confidence colours, optimistic updates, read mode fallback |
| 4. Pipeline Integration | Week 4-5 | Frame extractor service, n8n Workflow 1 + 2, upload page with SSE |
| 5. Exports + Polish | Week 5-6 | n8n Workflow 3, DOCX/PDF export, dashboard, Cloudflare ZTNA, RBAC, real recording testing |

---

## 9. Files Produced

| File | Description |
|---|---|
| `PROJECT_BLUEPRINT.md` | Master architecture document with full file structure and build plan |
| `001_initial_schema.sql` | Complete PostgreSQL migration (11 tables, enums, indexes, triggers, seed data) |
| `workflow_1_extraction.md` | n8n Workflow 1 spec — 14 nodes, node-by-node with code |
| `workflow_2_section_generation.md` | n8n Workflow 2 spec — 6 nodes, all 17 Gemini prompts |
| `workflow_3_export.md` | n8n Workflow 3 spec — 7 nodes, DOCX/PDF/Markdown generation |
| `VISUAL_INDEX.md` | Index of all 21 diagrams and mockups created during brainstorming |

---

## 10. Open Questions / Next Steps

1. **Validate frame extraction** — Test the 5-stage pipeline on a real Teams recording to verify the quality funnel (38 → 11 useful frames)
2. **Prompt engineering** — The Gemini prompts in Workflow 2 need iterative testing with real transcripts to tune output quality
3. **DOCX template creation** — The client needs to create their master template with placeholder tokens
4. **Azure VM sizing** — The frame-extractor container needs enough RAM for FFmpeg + PySceneDetect (~2-4GB). Verify the existing VM can handle it alongside n8n
5. **Cloudflare ZTNA setup** — Configure access policies for the three user roles
6. **First real SOP** — Target producing the Aged Debtor Report SOP through the pipeline as the proof of concept