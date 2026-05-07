# SOP Automation Platform — Conversation Summary
## Original Brainstorm: 15 March 2026 | Last Updated: 06 May 2026
## Participants: Saara (CloudNavision) + Claude Code

---

## 1. Problem Statement

Starboard Hotels manually creates Standard Operating Procedures from Microsoft Teams knowledge transfer meeting recordings. The process took **4-6 hours per SOP** and involved:
- Watching the full recording
- Manually taking screenshots with Snipping Tool at every screen change
- Adding numbered callout annotations to each screenshot
- Writing process steps in infinitive language
- Building supplementary sections (risk tables, communication matrices, quality parameters, SOW, etc.)
- Assembling everything into a branded DOCX template

They produce **5-15 SOPs per month**. Existing tooling: Gemini for transcription (Teams' built-in transcript is inaccurate), everything else manual.

**Reference files reviewed at project start:**
- `Transcript.md` — Example KT session transcript (Aged Debtor Report, Starboard Hotels)
- `Aged_Debtor_Process.docx` — Example finished SOP document (14 sections, ~20 pages)
- `Process_Documentation_Flow_SOP.pdf` — Meta-process flowchart defining how SOPs are made

---

## 2. Key Architecture Decisions (original + what actually shipped)

### Decision 1: Dynamic web platform, not just DOCX generation ✅ Shipped
Built an interactive React web application as the primary SOP delivery format. DOCX/PDF as secondary exports. Same app serves editors (review) and viewers (delivery). Video context preserved — click a step, watch the trainer demonstrate it.

### Decision 2: n8n for orchestration ✅ Shipped
n8n handles pipeline orchestration. Custom Docker services (sop-api, sop-extractor) fill gaps n8n can't handle natively.

**Actual workflow chain shipped (different from original plan):**
- **WF0** — Smart Ingest & Auto-Split: SharePoint → Azure Blob → Gemini File API → Supabase (handles long videos by splitting at 55 min, timestamps offset for Part 2)
- **WF1** — Transcription & Screen Detection (v2): Gemini transcription with `thinkingLevel: minimal`, `maxOutputTokens: 100000`
- **WF2** — Frame Extraction (WF2b Sync): Calls sop-extractor synchronously with 600s timeout
- **WF3c** — Full Hybrid Annotation (Service Account v3): GCP service account, Vertex AI Gemini Vision + Cloud Vision OCR, base64 inlineData (not fileURI)

### Decision 3: Gemini for AI tasks ✅ Shipped
Gemini 2.5 Flash across the pipeline. WF1 uses Gemini File API with API key. WF3c uses Vertex AI via GCP service account.

**Hard constraint discovered:** Workflow 1 must stay on Gemini File API (API key). The File API endpoint (`generativelanguage.googleapis.com/upload/v1beta/files`) does not exist on Vertex AI. Cannot migrate without a GCS-based rearchitecture.

### Decision 4: Hybrid annotation (Gemini + OCR) ✅ Shipped
Gemini Vision identifies elements → Cloud Vision OCR provides pixel-precise bounding boxes → matching algorithm connects them. Confidence color coding: green (OCR exact), amber (fuzzy match), red (Gemini estimate). Annotation editor (Konva.js) for drag-and-drop correction.

**Service account migration (Phase 4b):** Replaced separate API keys for Gemini and OCR with a single GCP service account. Fixed double-encoding bug in WF3c v3 (`JSON.stringify()` + `specifyBody: "json"` = double-encoded string). Vertex AI requires raw base64 `inlineData`, not `fileData.fileUri` (Azure Blob URLs rejected).

### Decision 5: Template-based DOCX assembly ✅ Shipped
Pre-formatted Word template + docxtpl token injection. ~300 lines Python. Client can modify formatting in Word without code changes.

---

## 3. Technical Architecture (as shipped)

### Stack
| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind + TanStack Router/Query |
| Video Player | Video.js (programmatic seek, clip mode) |
| Annotation Editor | Konva.js (react-konva) — lazy loaded, edit mode only |
| Backend API | FastAPI (Python 3.11) + SQLAlchemy + Pydantic |
| Database | PostgreSQL 16 via Supabase (port 6543, transaction pooling) |
| Pipeline Orchestration | n8n (4 workflows: WF0, WF1, WF2b, WF3c) |
| Frame Extraction | Custom Docker service (FFmpeg + PySceneDetect + OpenCV + imagehash) |
| AI | Gemini 2.5 Flash — File API (WF1) + Vertex AI (WF3c) + Google Cloud Vision OCR (WF3c) |
| Storage | Azure Blob Storage (video, frames, clips, exports) |
| Auth | Cloudflare ZTNA (Zero Trust Network Access) |
| Hosting | Docker Compose on Azure VM |

### Database (as of Phase 10 — 14 tables)
**Core:** `sops`, `sop_steps`, `step_callouts`, `step_clips`, `step_discussions`
**Content:** `transcript_lines`, `sop_sections`, `section_templates`
**Operations:** `pipeline_runs`, `sop_versions`, `export_history`
**Merge system:** `sop_merge_sessions`, `process_groups`
**Flags:** `is_merged` column on sops, `project_code` column for group linking
**Migrations run:** `001_initial_schema`, `002_seed_aged_debtor`, `003_add_views_likes`, `004_sop_version_merge`, `005_is_merged`, `006_process_groups`

---

## 4. Frame Extraction Pipeline

Teams recordings are harder than screen recordings — webcam feeds, Teams UI chrome, and layout changes trigger false scene detections.

### 5-stage pipeline (as shipped):
1. **Gemini crop detection** — Sample at 0.5 FPS, identify screen-share region bounding box
2. **FFmpeg crop + PySceneDetect adaptive** — Crop to screen-share, adaptive scene detection
3. **Perceptual deduplication** — imagehash phash threshold 8 removes near-identical frames
4. **Transition frame filtering** — Capture at T+1.5s to skip half-rendered windows
5. **Gemini classification** — Label each frame USEFUL / TRANSITIONAL / DUPLICATE

**Known limitation:** PySceneDetect finds only ~22 raw scenes in 72-min static-screen recordings. Time-based fallback (extract every ~2 min if no scene change) is a pending improvement (Task 6 in project_pending_tasks.md).

**Teams UI crop issue:** Two-layer problem:
- Webcam strip at top/bottom: fixed via crop adjustment (`y += 30, h -= 60` in WF1 Fix Screen Periods node — pending permanent fix)
- Presenter name overlays ON shared content: require backend processing in `scene_detector.py`

---

## 5. Annotation Accuracy

| Confidence | Source | Accuracy | Review time |
|---|---|---|---|
| Green | OCR exact match | ~65-70% | Glance only |
| Amber | OCR fuzzy match | ~20% | 5-10 sec |
| Red | Gemini estimate | ~10-15% | Drag to correct |
| **Net** | | ~92% auto | ~15-30 sec/screenshot |

---

## 6. React App — Routes (as shipped)

- `/dashboard` — SOP listing with status badges, search, pipeline progress
- `/sop/:id/procedure` — Main SOP page: VideoPlayer + StepSidebar + StepCard + TranscriptPanel
- `/sop/:id/overview` — Stats strip, approval progress bar, stacked avatars, SOPDetailsCard
- `/sop/:id/processmap` — Mermaid process map wizard (editor/admin) or read-only preview (viewer)
- `/sop/:id/history` — Date-grouped audit trail, show-more pagination
- `/sop/:id/metrics` — Views/likes (viewer), full stats + approval bar (editor), who-liked list (admin)
- `/sop/new` — Upload page with real-time pipeline SSE progress
- `/settings` — User management (UserManagementTable with stats cards, search, filter pills, invite panel) + Role permissions sidebar
- `/merge` — SOP version merge: Merged SOPs tab + Source Groups tab, group management, diff + preview

---

## 7. Phase Completion Status

| Phase | Deliverable | Status | Completed |
|---|---|---|---|
| 1 | Foundation (Docker, schema, FastAPI, React scaffold) | ✅ Complete | March 2026 |
| 1.5 | Auth (Cloudflare ZTNA, role-based access) | ✅ Complete | March 2026 |
| 2 | n8n Ingestion Pipeline (SharePoint → Blob → Gemini → Supabase) | ✅ Complete | March 2026 |
| 3 | Frame Extraction (PySceneDetect, dedup, classification) | ✅ Complete | March 2026 |
| 4 | Annotation (Gemini + OCR hybrid, callouts, confidence system) | ✅ Complete | April 2026 |
| 4b | WF3c Service Account Migration (fix double-encoding, Vertex AI) | ✅ Built, pending n8n activation | May 2026 |
| 5 | Clip Extraction (FFmpeg, step_clips, video clip toggle) | ✅ Complete | April 2026 |
| 6 | Video + Transcript UI (Video.js, TranscriptPanel, useStepSync) | ✅ Complete | April 2026 |
| 7 | Exports + Polish (DOCX/PDF, dashboard search, status badges) | ✅ Complete | April 2026 |
| 8 | Annotation Editor (Konva.js drag-drop, PATCH callouts endpoint) | ✅ Complete | April 2026 |
| 9 | Role-Based UI + UX Polish (status dropdown, tab role gates, likes) | ✅ Complete | April 2026 |
| 10 | SOP Version Merge (/merge page, process groups, diff + preview) | ✅ Complete | April 2026 |
| 11 | UX Polish II (Settings redesign, Overview redesign, History redesign, Merge redesign) | ✅ Complete | May 2026 |

---

## 8. Pipeline Duration (actual vs. original estimate)

| Stage | Original Estimate | Actual |
|---|---|---|
| Full pipeline (60-min meeting) | ~4 minutes | ~4-6 minutes |
| Transcription (WF1) | Included above | ~2-3 min |
| Frame extraction (WF2b) | Included above | ~1-2 min |
| Annotation (WF3c per frame) | Included above | ~30-60 sec total |
| Human review | 20-30 min | ~15-25 min |

---

## 9. Cost Analysis (actual)

### Per 60-minute meeting (Gemini 2.5 Flash):
- Transcription (File API): ~$0.30
- Frame annotation (Vertex AI): ~$0.06
- SOP section generation: ~$0.05
- Cloud Vision OCR: Free (under 1K units/month)
- Azure compute: ~$0.02
- **Total: ~$0.43 per SOP**

### ROI: ~85-90% time reduction per SOP (4-6 hours → 20-30 min human review)

---

## 10. Open Items (as of May 2026)

1. **Activate WF3c v3** — Delete old WF3c → import v3 JSON → set service account credential
2. **Fix WF2 EXTRACTOR_URL** — Change from `https://soptest.cloudnavision.com` to `http://sop-extractor:8001` (bypass Cloudflare 100s timeout)
3. **Fix WF2 duplicate inserts** — Remove `supabase_url` + `supabase_service_key` from Build Extract Request payload
4. **Import WF1 v2 + WF2b v2** — Delete old versions, import new JSONs, test
5. **Time-based frame fallback** — Add every-2-min forced extraction in `scene_detector.py`
6. **Teams UI crop permanent fix** — Apply `y += 30, h -= 60` to all Fix Screen Periods node coordinates in WF1
7. **Resume parked pipeline run** — `UPDATE pipeline_runs SET status='extracting_frames', current_stage='transcription_complete' WHERE id='0029ccd6-6ff9-4b0d-8cb0-5933030dca9'`
8. **Re-import WF0 in n8n** — Updated prompts filter Teams UI elements (webcam tiles, controls bar)
