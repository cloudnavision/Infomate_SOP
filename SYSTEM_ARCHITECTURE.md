# SOP Automation Platform — Complete System Architecture
## For: Technical Walkthrough | Last Updated: 06 May 2026

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Infrastructure & Containers](#2-infrastructure--containers)
3. [Database Schema](#3-database-schema)
4. [n8n Workflows — Step by Step](#4-n8n-workflows--step-by-step)
5. [FastAPI Backend — All Endpoints](#5-fastapi-backend--all-endpoints)
6. [Extractor Service — All Endpoints](#6-extractor-service--all-endpoints)
7. [Frontend Routes](#7-frontend-routes)
8. [End-to-End Process Flows](#8-end-to-end-process-flows)
   - [A. Video Upload → SOP Pipeline](#a-video-upload--sop-pipeline-full-flow)
   - [B. Word/PDF Export](#b-worddocx--pdf-export-flow)
   - [C. Annotation (Callouts)](#c-annotation--callout-flow)
   - [D. SOP Version Merge](#d-sop-version-merge-flow)
9. [Cross-Reference: Who Calls What](#9-cross-reference-who-calls-what)
10. [Security & Access Control](#10-security--access-control)

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         INTERNET / USER                                 │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ HTTPS
                               ▼
                    ┌──────────────────────┐
                    │  Cloudflare Tunnel   │  (sideloaded on Azure VM host)
                    │  soptest.cloudnav.com│
                    └──────┬───────────────┘
                           │
          ┌────────────────┼────────────────────┐
          ▼                ▼                    ▼
   ┌─────────────┐  ┌─────────────┐    ┌──────────────┐
   │sop-frontend │  │  sop-api    │    │n8n (external)│
   │React SPA    │  │ FastAPI     │    │Workflow engine│
   │port :5173   │  │ port :8000  │    │              │
   └─────┬───────┘  └──────┬──────┘    └──────┬───────┘
         │ API calls        │                  │ HTTP
         └──────────────────┘        ┌─────────┘
                                     ▼
                              ┌─────────────┐
                              │sop-extractor│  (internal-only, no Cloudflare)
                              │FFmpeg+Python│
                              │port :8001   │
                              └──────┬──────┘
                                     │
          ┌──────────────────────────┼────────────────────────┐
          ▼                          ▼                        ▼
   ┌─────────────┐           ┌──────────────┐         ┌──────────────┐
   │  Supabase   │           │ Azure Blob   │         │  Google APIs │
   │ PostgreSQL  │           │  Storage     │         │ Gemini+Vision│
   │ port :6543  │           │ infsop cont. │         │              │
   └─────────────┘           └──────────────┘         └──────────────┘
```

**Key principle:** The user (browser) only ever talks to `sop-frontend` and `sop-api`. The `sop-extractor` is internal — only `sop-api` and n8n call it. n8n is external (hosted separately) and calls back to `sop-api` via webhook callbacks.

---

## 2. Infrastructure & Containers

### Docker Compose — 3 containers + 1 optional

| Container | Image | Port | Role |
|---|---|---|---|
| `sop-frontend` | Node/Vite build | `:5173` | Serves React SPA (static files via Vite preview) |
| `sop-api` | Python 3.11 + FastAPI | `:8000` | REST API, all business logic, DB access |
| `sop-extractor` | Python + FFmpeg + LibreOffice | `:8001` | Video processing, frame extraction, DOCX/PDF rendering |
| `sop-tunnel` | cloudflared (optional) | — | Cloudflare Tunnel for public HTTPS (profile: `tunnel`) |

### Networking

- All 3 containers share `sop-network` (Docker bridge)
- `sop-api` reaches `sop-extractor` at `http://sop-extractor:8001` (Docker DNS)
- `sop-frontend` reaches `sop-api` at `http://sop-api:8000` (Docker DNS) or via Cloudflare tunnel
- `cloudflared` runs with `network_mode: host` — NOT inside `sop-network` — so it can reach `localhost:5173` and `localhost:8000`

### Shared Volume

```
./data/                   ← mounted into both sop-api and sop-extractor
  uploads/                ← temporary video uploads
  frames/                 ← extracted frames (temporary, then pushed to Azure Blob)
  exports/                ← DOCX/PDF outputs (then pushed to Azure Blob)
  templates/
    sop_template.docx     ← Word template for DOCX export
```

### External Services

| Service | Used by | Purpose |
|---|---|---|
| **Supabase** (PostgreSQL, port 6543) | `sop-api` | All relational data (SOPs, steps, callouts, transcript, etc.) |
| **Azure Blob Storage** (`infsop` container) | `sop-api`, `sop-extractor`, n8n | Videos, extracted frames, annotated screenshots, DOCX/PDF exports, clips |
| **n8n** (external host) | Calls `sop-api` + `sop-extractor` | Orchestrates the full AI pipeline (WF0, WF1, WF2b, WF3c) |
| **Gemini 2.5 Flash** (File API) | WF1 n8n directly | Video transcription + screen share detection |
| **Vertex AI / Gemini** (Gemini Vision) | WF3c n8n directly | Frame semantic annotation (what to label) |
| **Google Cloud Vision OCR** | WF3c n8n directly | Pixel-precise bounding boxes for callout placement |
| **Cloudflare Tunnel** | Host (not Docker) | HTTPS exposure: soptest.cloudnavision.com → localhost:8001 (extractor) and other subdomains |

---

## 3. Database Schema

**Provider:** Supabase (PostgreSQL 16, transaction pooling port 6543)
**Extensions:** `uuid-ossp`, `pg_trgm` (full-text search on transcripts)

### Tables and Their Purpose

```
┌─────────────────────────────────────────────────────────────────────┐
│                       CORE SOP DATA                                  │
├─────────────┬───────────────────────────────────────────────────────┤
│ sops        │ Master SOP record. One row per meeting recording.      │
│             │ Key cols: title, status (enum), video_url,            │
│             │ project_code (for grouping), is_merged,               │
│             │ screen_share_periods (JSONB: [{x,y,w,h,start,end}]),  │
│             │ view_count, meeting_participants (JSONB)               │
├─────────────┼───────────────────────────────────────────────────────┤
│ sop_steps   │ One row per extracted frame / process step.           │
│             │ Key cols: sequence, title, description,               │
│             │ screenshot_url, annotated_screenshot_url,             │
│             │ timestamp_start, timestamp_end, is_approved,          │
│             │ frame_classification (USEFUL/TRANSITIONAL/DUPLICATE)  │
├─────────────┼───────────────────────────────────────────────────────┤
│ step_callouts│ Annotation markers on a screenshot.                  │
│             │ Key cols: callout_number, label, element_type,        │
│             │ target_x, target_y (0.0–1.0 relative coords),        │
│             │ confidence (ocr_exact/ocr_fuzzy/gemini_only),        │
│             │ original_x/y (preserved on first reposition),        │
│             │ was_repositioned                                       │
├─────────────┼───────────────────────────────────────────────────────┤
│ step_clips  │ Short MP4 clip per step. Stored in Azure Blob.        │
│             │ Key cols: clip_url, duration_sec, file_size_bytes     │
├─────────────┼───────────────────────────────────────────────────────┤
│step_discussions│ Q&A / discussion moments from the KT recording.   │
│             │ Key cols: summary, discussion_type, transcript_refs   │
└─────────────┴───────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     CONTENT / AI OUTPUT                              │
├─────────────┬───────────────────────────────────────────────────────┤
│transcript   │ Every spoken line from the meeting.                   │
│_lines       │ Key cols: sequence, speaker, timestamp_sec, content   │
│             │ Has GIN trigram index for full-text search.           │
├─────────────┼───────────────────────────────────────────────────────┤
│ sop_sections│ AI-generated document sections (Purpose, Risks, etc.) │
│             │ 19 standard sections per SOP. Key cols: section_key,  │
│             │ content_text, content_json (tables), mermaid_syntax   │
├─────────────┼───────────────────────────────────────────────────────┤
│section      │ Master list of the 19 section types with their        │
│_templates   │ Gemini prompts. Drives section generation in WF1.     │
└─────────────┴───────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       OPERATIONS                                     │
├─────────────┬───────────────────────────────────────────────────────┤
│pipeline_runs│ Tracks pipeline progress for each SOP.               │
│             │ Status enum: queued → transcribing →                  │
│             │ detecting_screenshare → extracting_frames →           │
│             │ deduplicating → classifying_frames →                  │
│             │ generating_annotations → extracting_clips →           │
│             │ generating_sections → completed / failed              │
│             │ Also tracks: API cost, token counts, timings          │
├─────────────┼───────────────────────────────────────────────────────┤
│ sop_versions│ Snapshot of SOP at a point in time (JSON blob).      │
├─────────────┼───────────────────────────────────────────────────────┤
│export_history│ Record of every DOCX/PDF export. file_url stored    │
│             │ without SAS (SAS appended at read time).              │
└─────────────┴───────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     MERGE SYSTEM (Phase 10)                          │
├─────────────┬───────────────────────────────────────────────────────┤
│sop_merge    │ One row per merge operation.                          │
│_sessions    │ Key cols: base_sop_id, updated_sop_id, merged_sop_id,│
│             │ status (reviewing/merged/abandoned),                  │
│             │ diff_result (JSONB), approved_changes (JSONB)        │
├─────────────┼───────────────────────────────────────────────────────┤
│process_groups│ Named groups of related SOPs (e.g. "Aged Debtor").  │
│             │ Auto-generates code like GRP-001.                    │
│             │ Linked to sops via sops.project_code column.         │
└─────────────┴───────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     USERS & ENGAGEMENT                               │
├─────────────┬───────────────────────────────────────────────────────┤
│ users       │ Platform users. Role: viewer / editor / admin.        │
├─────────────┼───────────────────────────────────────────────────────┤
│ sop_likes   │ Junction table: user ↔ SOP like. Composite PK.        │
├─────────────┼───────────────────────────────────────────────────────┤
│sop_activity │ Audit log. Every edit, approval, export, pipeline     │
│_log         │ event writes a row here (event_type, label, detail). │
└─────────────┴───────────────────────────────────────────────────────┘
```

### SOP Status Flow

```
processing → draft → in_review → published → archived
    ↑ (pipeline running)
```

---

## 4. n8n Workflows — Step by Step

n8n is hosted externally. It talks to the platform over HTTP. All four workflows form a sequential chain.

```
SharePoint Folder
      │
      ▼
   WF0: Smart Ingest
      │
      ▼
   WF1: Transcription + Screen Detection
      │
      ▼
   WF2b: Frame Extraction
      │
      ▼
   WF3c: Annotation (Gemini Vision + OCR)
      │
      ▼
   SOP Complete (status = completed)
```

---

### WF0 — Smart Ingest & Auto-Split

**File:** `Saara - SOP_WF0 - Smart Ingest & Auto-Split 2.json`
**Trigger:** Scheduled poll of a SharePoint folder (looks for new MP4 files)
**What it does:** Moves the raw video into the pipeline, creates the database records, splits very long videos if needed.

| Step | Node | What happens |
|---|---|---|
| 1 | **SharePoint Poll** | Lists files in configured folder, finds MP4s not yet processed |
| 2 | **Download from SharePoint** | Downloads the MP4 to n8n memory |
| 3 | **Upload to Azure Blob** | Uploads raw MP4 to `infsop` container. Returns `video_url` (the permanent Azure Blob URL) |
| 4 | **Probe Video** | Calls `sop-extractor POST /api/probe-video` → gets `duration_sec` and video dimensions |
| 5 | **Long Video Check** | IF `duration_sec > 3300` (55 min) → split path; ELSE → direct path |
| 6a | **Split Video** (long path) | Calls `sop-extractor POST /api/split-video` → finds nearest keyframe at 55 min, uploads Part 1 + Part 2 to Azure Blob, returns `actual_split_sec` |
| 6b | **Create SOP + Pipeline Run** | Calls `sop-api POST /api/sops` → creates `sops` row + `pipeline_runs` row with `status=queued`. Stores original full video URL (not the split URLs). |
| 7 | **Setup Config** | Sets all variables: `sop_id`, `video_url`, `part2_url`, `actual_split_sec`, Supabase credentials, Azure credentials |
| 8 | **Trigger WF1** | HTTP POST to WF1's webhook URL, passing the full config |

**Important architecture note — long videos:**
- WF0 creates **ONE** `sops` row with the **original full video URL**
- The split into Part 1 + Part 2 is only for Gemini's benefit (Gemini File API has ~2hr upload limit, processing works better in segments)
- Part 2 timestamps returned by WF1 are automatically offset by `actual_split_sec` so they become **absolute positions** in the original video
- WF2b and WF3c always use the **original full video URL** — no split video reference after WF1

---

### WF1 — Transcription & Screen Share Detection

**File:** `Saara - SOP_Workflow 1 - Complete Workflow v2.json`
**Trigger:** Webhook POST from WF0 (or manual)
**Auth:** Gemini File API with API key (NOT Vertex AI — the File API endpoint does not exist on Vertex AI)
**What it does:** Transcribes the meeting, identifies which time periods show a shared screen, extracts process steps from the transcript.

| Step | Node | What happens |
|---|---|---|
| 1 | **Receive Webhook** | Gets `sop_id`, `video_url`, `part2_url`, `actual_split_sec`, all credentials |
| 2 | **Setup Config** | Stores all vars, sets `thinkingLevel: "minimal"`, `maxOutputTokens: 100000` |
| 3 | **Upload Video to Gemini** | Calls Gemini File API (`POST .../upload/v1beta/files`) to upload the MP4. Returns a `file_uri` (e.g. `files/abc123`) |
| 4 | **Poll Until ACTIVE** | Loops: `GET .../v1beta/{file_uri}` until `state == "ACTIVE"` (Gemini processing complete) |
| 5 | **Transcribe** | `POST .../v1beta/models/gemini-2.5-flash:generateContent` with the file_uri. Prompt asks for: speaker identification, timestamps, verbatim content. Response is structured JSON array of transcript lines. |
| 6 | **Detect Screen Periods** | Second Gemini call on the same video. Prompt asks: at which timestamps does someone start/stop sharing their screen? Returns array of `{start_sec, end_sec, x, y, w, h}` crop boxes. |
| 7 | **Fix Screen Periods** | Code node: adjusts crop coordinates (`y += 30, h -= 60`) to trim Teams toolbar at top and presenter sharing badge at bottom. Removes Teams UI chrome from the crop box. |
| 8 | **Part 2 Offset** (if long video) | If `actual_split_sec > 0`: processes Part 2 separately (upload → poll → transcribe → detect), then adds `actual_split_sec` to all Part 2 timestamps, merges with Part 1 results |
| 9 | **Generate Step Descriptions** | Third Gemini call: given transcript + screen periods, extract the process steps (what the presenter is demonstrating at each screen change). Returns array of step objects with title, description, timestamp range. |
| 10 | **Generate SOP Sections** | Fourth Gemini call: generate the 19 standard document sections (Purpose, Risks, SOW, Communication Matrix, etc.) from the full transcript + step list. |
| 11 | **Upsert Transcript Lines** | Supabase INSERT: all transcript lines → `transcript_lines` table |
| 12 | **Upsert Steps** | Supabase INSERT: all steps → `sop_steps` table (with `screenshot_url=null` — frames come from WF2b) |
| 13 | **Upsert Sections** | Supabase INSERT: all sections → `sop_sections` table |
| 14 | **Update Pipeline Run** | `UPDATE pipeline_runs SET status='extracting_frames', current_stage='transcription_complete'` |
| 15 | **Trigger WF2b** | HTTP POST to WF2b webhook, passing `sop_id` |

**Gemini auth note:** File API uses `?key=API_KEY` query param. This is different from Vertex AI which uses service account OAuth. WF1 must ALWAYS use the File API approach.

---

### WF2b — Frame Extraction (Synchronous)

**File:** `Saara - SOP_Workflow 2b - Frame Extraction v2 (Sync).json`
**Trigger:** Webhook POST from WF1, OR scheduled poll of `pipeline_runs` table
**What it does:** Calls the `sop-extractor` service to extract, deduplicate, and classify frames from the video, then saves them as steps with screenshots in Supabase.

| Step | Node | What happens |
|---|---|---|
| 1 | **Poll / Webhook** | Either triggered by WF1 webhook, OR polls `pipeline_runs WHERE status='extracting_frames'` on a schedule |
| 2 | **Load SOP Data** | Supabase SELECT: gets `sop_id`, `video_url`, `screen_share_periods` from the `sops` + `pipeline_runs` tables |
| 3 | **Build Extract Request** | Assembles payload: `{ sop_id, video_url, screen_share_periods, azure_blob_base_url, azure_sas_token, pyscene_threshold, frame_offset_sec, phash_threshold }` |
| 4 | **Call Extractor** | `POST http://sop-extractor:8001/api/extract` with 600-second timeout. This is the long-running step (1-5 minutes). |
| 5 | **Process Results** | Extractor returns array of frames: `[{ frame_num, azure_url, timestamp_sec, classification, scene_score, width, height }]` |
| 6 | **Upsert Steps** | For each USEFUL frame: INSERT into `sop_steps` with `screenshot_url = azure_url`, `timestamp_start`, `timestamp_end` |
| 7 | **Update Pipeline Run** | `UPDATE pipeline_runs SET status='generating_annotations', current_stage='frames_extracted'` |
| 8 | **Trigger WF3c** | HTTP POST to WF3c webhook, passing `sop_id` |

**Critical URL note:** `EXTRACTOR_URL` in Setup Config must be `http://sop-extractor:8001` (Docker internal DNS). If set to `https://soptest.cloudnavision.com`, Cloudflare Tunnel enforces a 100-second timeout and kills long extractions.

**What the extractor actually does for `/api/extract`:**
1. Downloads video from Azure Blob URL
2. For each screen_share_period: crops the video to the detected screen region using FFmpeg (`crop=w:h:x:y`)
3. Runs PySceneDetect `AdaptiveDetector` on the cropped segment
4. Falls back to time-based extraction (every ~2 min) if no scenes detected in a window
5. For each detected scene: extracts a PNG at `scene_start + 1.5 seconds` (skips transition frames)
6. Computes `imagehash.phash` for each frame; removes duplicates (Hamming distance ≤ 8)
7. Uploads each unique PNG to Azure Blob: `{blob_base}/{sop_id}/frames/frame_{n}.png`
8. Returns array of frame metadata

---

### WF3c — Full Hybrid Annotation (Service Account)

**File:** `v2-service-account/Saara - SOP_Workflow 3c - Full Hybrid (Service Account) v3.json`
**Trigger:** Webhook POST from WF2b
**Auth:** GCP Service Account (`cloud-platform` scope) — covers both Vertex AI Gemini Vision and Cloud Vision OCR in one credential
**What it does:** For each extracted frame, uses AI to identify what to annotate and OCR to find precisely where to place the numbered callout markers.

This workflow loops over every step/frame in the SOP:

| Step | Node | What happens |
|---|---|---|
| 1 | **Receive Webhook** | Gets `sop_id` |
| 2 | **Load Steps** | Supabase SELECT: all steps for this SOP where `screenshot_url IS NOT NULL` |
| 3 | **Loop Over Steps** | Split in Batches (1 at a time, to respect Vertex AI rate limits) |
| 4 | **Download Frame Image** | HTTP GET the `screenshot_url` from Azure Blob. Gets binary image data. |
| 5 | **Convert to Base64** | Code node: `binary.data.data` → strip `data:image/png;base64,` prefix (if present) → raw base64 string |
| 6 | **Build Gemini Request** | Assembles Vertex AI payload: `{ contents: [{ parts: [{ inlineData: { mimeType: "image/png", data: "<base64>" } }, { text: "<prompt>" }] }] }`. Prompt asks: which UI elements should be annotated as steps (numbered 1, 2, 3...)? What is each element? Return JSON: `[{ callout_number, label, element_type, region_hint }]` |
| 7 | **Call Gemini Vision** | `POST https://us-central1-aiplatform.googleapis.com/.../gemini-2.5-flash:generateContent` with service account OAuth token. Returns semantic callout list. |
| 8 | **Build OCR Request** | Assembles Cloud Vision payload: `{ requests: [{ image: { content: "<base64>" }, features: [{ type: "TEXT_DETECTION" }] }] }`. Sends same image to OCR. |
| 9 | **Call Vision OCR** | `POST https://vision.googleapis.com/v1/images:annotate`. Returns all text bounding boxes found in the image with pixel coordinates. |
| 10 | **Run Matching Algorithm** | Code node: matches each Gemini callout's `label` text against OCR bounding boxes using exact then fuzzy string matching. Result: `{ callouts: [{ callout_number, label, target_x, target_y, confidence, match_method }] }` where target_x/y are 0.0–1.0 relative coordinates. |
| 11 | **Insert Step Callouts** | Supabase INSERT: all callouts → `step_callouts` table for this step |
| 12 | **Update Step** | Supabase PATCH: `gemini_description` saved on the step |
| 13 | **Render Annotated Screenshot** | Calls `sop-api POST /api/steps/{step_id}/render-annotated` → which proxies to `sop-extractor POST /api/render-annotated` → Pillow draws numbered circles on the PNG → uploads to Azure Blob → returns `annotated_screenshot_url` |
| 14 | **Update step.annotated_screenshot_url** | Supabase PATCH: saves the annotated URL on the step |
| 15 | **(Next step in loop)** | Repeats from step 4 for next frame |
| 16 | **Final Update** | After all steps processed: `UPDATE pipeline_runs SET status='completed'` |
| 17 | **Update SOP Status** | Supabase PATCH: `sops.status = 'draft'` (ready for human review) |

**v3 critical fix:** Previous versions had `JSON.stringify($json.body)` with `specifyBody: "json"`. n8n's `specifyBody: "json"` already serialises the expression result to JSON. Wrapping in `JSON.stringify()` produced a JSON-encoded *string* instead of a JSON *object*, which Vertex AI rejected with `URL_REJECTED`. v3 uses plain expressions: `={{ $json.geminiBody }}`.

**Why inlineData, not fileData.fileUri?** Vertex AI cannot fetch arbitrary HTTPS URLs (including Azure Blob URLs). The image must be downloaded first (step 4), converted to base64 (step 5), and sent as `inlineData.data`. This is different from Gemini File API (used in WF1) which accepts an uploaded file URI.

---

## 5. FastAPI Backend — All Endpoints

Base URL: `http://sop-api:8000` (internal) or via Cloudflare tunnel

### SOPs

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/sops` | viewer+ | List SOPs. Viewers see only `published`; editors see draft/in_review/published; admins see all. |
| `GET` | `/api/sops/{sop_id}` | viewer+ | Full SOP with all steps, sections, callouts, clips, discussions, watchlist. Appends SAS tokens to all Azure URLs. |
| `PATCH` | `/api/sops/{sop_id}/status` | editor+ | Change SOP status (draft → in_review → published, etc.) |
| `PATCH` | `/api/sops/{sop_id}/tags` | editor+ | Update tag list |
| `PATCH` | `/api/sops/{sop_id}/rename` | editor+ | Rename SOP title |
| `DELETE` | `/api/sops/{sop_id}` | admin | Delete SOP + cascade all related rows + best-effort Azure Blob cleanup |
| `POST` | `/api/sops/{sop_id}/view` | viewer+ | Increment view_count |
| `POST` | `/api/sops/{sop_id}/like` | viewer+ | Toggle like. Returns `{ liked: bool, total_likes: int }` |
| `GET` | `/api/sops/{sop_id}/metrics` | viewer+ | View count, like count, approval %. Admins also get list of who liked. |
| `GET` | `/api/sops/{sop_id}/history` | editor+ | Activity timeline (pipeline events, exports, approvals, edits) |
| `GET` | `/api/sops/{sop_id}/process-map` | viewer+ | Mermaid config + rendered image URL |
| `PATCH` | `/api/sops/{sop_id}/process-map` | editor+ | Save process map lane/assignment configuration |
| `POST` | `/api/sops/{sop_id}/process-map/upload` | editor+ | Upload process map PNG |

### Steps

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/sops/{sop_id}/steps` | viewer+ | All steps ordered by sequence |
| `POST` | `/api/sops/{sop_id}/steps` | editor+ | Manually add a new step |
| `GET` | `/api/sops/{sop_id}/steps/{step_id}` | viewer+ | Single step with callouts, clips, discussions |
| `PATCH` | `/api/steps/{step_id}/rename` | editor+ | Rename step title |
| `PATCH` | `/api/steps/{step_id}/approve` | editor+ | Toggle `is_approved`, records reviewer + timestamp |
| `DELETE` | `/api/steps/{step_id}` | editor+ | Delete step + re-sequence remaining steps |
| `POST` | `/api/steps/{step_id}/callouts` | editor+ | Add a new callout marker |
| `DELETE` | `/api/steps/{step_id}/callouts/{callout_id}` | editor+ | Remove a callout |
| `PATCH` | `/api/steps/{step_id}/callouts` | editor+ | Bulk update callout positions. Preserves `original_x/y` on first reposition. |
| `PATCH` | `/api/steps/{step_id}/highlight-boxes` | editor+ | Replace highlight box overlays |
| `PATCH` | `/api/steps/{step_id}/sub-steps` | editor+ | Update sub-step bullet list |
| `POST` | `/api/steps/{step_id}/render-annotated` | editor+ | Re-render annotated PNG with current callout positions → proxies to extractor → returns new `annotated_screenshot_url` |

### Content

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/sops/{sop_id}/sections` | viewer+ | All 19 SOP sections ordered by display_order |
| `GET` | `/api/sops/{sop_id}/transcript` | viewer+ | All transcript lines. Optional `?speaker=` filter. |
| `GET` | `/api/sops/{sop_id}/watchlist` | viewer+ | Property watchlist entries |

### Exports

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/sops/{sop_id}/export?format=docx\|pdf` | viewer+ | Generate DOCX or PDF. Calls extractor `/api/render-doc`, saves to Azure Blob, records in `export_history`, returns download URL with SAS. |
| `GET` | `/api/sops/{sop_id}/exports` | viewer+ | Export history list |

### Pipeline (internal, API key protected)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/extract` | Proxy → `sop-extractor /api/extract` (async, returns job_id) |
| `GET` | `/api/extract/status/{job_id}` | Poll extraction job |
| `POST` | `/api/clip` | Proxy → `sop-extractor /clip` (async) |
| `GET` | `/api/clip/status/{job_id}` | Poll clip job |
| `POST` | `/api/probe-video` | Proxy → `sop-extractor /api/probe-video` (sync) |
| `POST` | `/api/split-video` | Proxy → `sop-extractor /api/split-video` (async) |
| `GET` | `/api/split-video/status/{job_id}` | Poll split job |

### Merge (Phase 10)

| Method | Path | Auth | Description |
|---|---|---|---|
| `PATCH` | `/api/sops/{sop_id}/project-code` | editor+ | Assign a project_code to group SOPs |
| `POST` | `/api/merge/process-groups` | editor+ | Create named group, auto-generate GRP-XXX code |
| `GET` | `/api/merge/groups` | editor+ | List groups with ≥2 unmerged SOPs (ready for merge) |
| `DELETE` | `/api/merge/process-groups/{code}` | admin | Delete group + merged SOPs + clear codes from source SOPs |
| `POST` | `/api/merge/compare` | editor+ | Trigger Gemini semantic diff of two SOPs. Creates `sop_merge_sessions` row. Returns matches. |
| `GET` | `/api/merge/sessions/{session_id}` | editor+ | Get session + diff results |
| `POST` | `/api/merge/sessions/{session_id}/finalize` | editor+ | Approve merge: creates merged SOP, copies steps + clips + sections + Azure blobs |

### Health / Diagnostics

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Container health check |
| `GET` | `/api/test-db` | Verifies Supabase connection |
| `GET` | `/api/test-extractor` | Pings `sop-extractor /health` |

---

## 6. Extractor Service — All Endpoints

Base URL: `http://sop-extractor:8001` (internal Docker DNS only — not publicly accessible)

| Method | Path | Caller | Timeout | Description |
|---|---|---|---|---|
| `GET` | `/` or `/health` | sop-api | — | Health check. Returns FFmpeg/Mermaid availability. |
| `POST` | `/api/extract` | n8n WF2b / sop-api | 600s | **Frame extraction** (see full flow below) |
| `POST` | `/clip` | sop-api | 300s | **Clip extraction** — cuts per-step MP4 clips, uploads to Azure Blob |
| `POST` | `/api/probe-video` | sop-api | 30s | **Video probe** — ffprobe duration + dimensions via range request (no full download) |
| `POST` | `/api/split-video` | sop-api | 600s | **Video split** — finds keyframe, FFmpeg split, uploads Part 1 + Part 2 to Azure Blob |
| `GET` | `/api/split-video/status/{job_id}` | sop-api | — | Poll split job result |
| `POST` | `/api/render-doc` | sop-api | 600s | **DOCX/PDF rendering** — docxtpl template injection + LibreOffice PDF conversion + Azure Blob upload |
| `POST` | `/api/render-annotated` | sop-api | 60s | **Re-render annotated screenshot** — Pillow draws numbered circles on PNG + Azure Blob upload |
| `POST` | `/api/compare-sops` | sop-api | 120s | **SOP diff** — Gemini semantic comparison of two step lists, returns matches array |

### Concurrency Control

The extractor uses a single `asyncio.Semaphore(1)` shared between `/api/extract` and `/clip`. Only one long-running job runs at a time. If busy, returns `HTTP 503` with `Retry-After` header. `/api/split-video` has its own separate job queue.

### Frame Extraction Detail (`POST /api/extract`)

```
Input payload:
{
  "sop_id": "uuid",
  "video_url": "https://...blob.core.windows.net/infsop/.../video.mp4?sas",
  "screen_share_periods": [
    { "start_sec": 120, "end_sec": 480, "x": 0, "y": 30, "w": 1920, "h": 1020 }
  ],
  "azure_blob_base_url": "https://...blob.core.windows.net/infsop",
  "azure_sas_token": "sv=...",
  "pyscene_threshold": 3.0,
  "frame_offset_sec": 1.5,
  "phash_threshold": 8
}

Processing per period:
  1. Download video segment via HTTP range requests
  2. FFmpeg: crop to {x,y,w,h} + trim to {start_sec}–{end_sec} → temp MP4
  3. PySceneDetect AdaptiveDetector → list of scene boundaries
  4. Time-based fallback: if no scene detected in 120s window, force one
  5. For each scene boundary:
     a. Extract PNG at (scene_start + frame_offset_sec)
     b. Compute imagehash.phash
     c. Compare with all previous hashes: Hamming distance ≤ 8 → DUPLICATE
     d. Record absolute timestamp: period.start_sec + scene_time
  6. Upload PNG to Azure Blob: {base}/{sop_id}/frames/frame_{n}.png
  7. Append to results

Output:
{
  "frames": [
    {
      "frame_num": 1,
      "azure_url": "https://...blob.../frames/frame_1.png",
      "timestamp_sec": 125.5,
      "classification": "USEFUL",  ← or DUPLICATE / TRANSITIONAL
      "scene_score": 18.4,
      "width": 1920,
      "height": 1020
    }
  ]
}
```

### DOCX/PDF Rendering Detail (`POST /api/render-doc`)

```
Input payload:
{
  "sop_id": "uuid",
  "format": "docx",  ← or "pdf"
  "azure_blob_base_url": "...",
  "azure_sas_token": "...",
  "sop_data": {
    "sop_title": "Aged Debtor Report",
    "client_name": "Starboard Hotels",
    "process_name": "Finance",
    "meeting_date": "2026-04-15",
    "step_count": 12,
    "steps": [
      {
        "sequence": 1,
        "title": "Open Infomate",
        "description": "Navigate to the Infomate dashboard...",
        "sub_steps": ["Click Reports menu", "Select Finance"],
        "annotated_screenshot_url": "https://...frames/frame_1_annotated.png?sas",
        "callouts": [{"callout_number": 1, "label": "Reports button"}]
      }
    ],
    "sections": [
      {"section_title": "Purpose", "content_type": "text", "content_text": "..."},
      {"section_title": "Risk Register", "content_type": "table", "content_json": {...}}
    ]
  }
}

Processing:
  1. Load /data/templates/sop_template.docx (Word template with {{ tokens }})
  2. For each step: download annotated_screenshot_url → embed as InlineImage
  3. docxtpl.render(context) → replaces all {{ tokens }} with actual data
  4. For table sections (Risk Register, Comm Matrix, etc.): post-process DOCX XML
     to inject real Word tables (docxtpl doesn't support complex dynamic tables natively)
  5. Save rendered .docx to /data/exports/{sop_id}/sop_{sop_id}.docx
  6. If format == "pdf":
     a. LibreOffice headless: libreoffice --headless --convert-to pdf {docx_path}
     b. Saves .pdf to same exports folder
  7. Upload DOCX (and PDF if requested) to Azure Blob:
     {base_url}/exports/{sop_id}/sop_{sop_id}.docx
  8. Return { "docx_url": "...", "pdf_url": "..." }

Note: URLs returned without SAS token (safe for DB storage).
      SAS is appended at read time by sop-api's `with_sas()` helper.
```

---

## 7. Frontend Routes

React SPA with TanStack Router. All routes are client-side.

| Route | Auth | Description |
|---|---|---|
| `/dashboard` | viewer+ | SOP listing. Search bar, status filter badges, pipeline progress indicators on cards. "Open →" and "Export PDF" buttons. |
| `/sop/new` | admin | Upload page. File picker → triggers WF0. SSE stream shows live pipeline progress (`queued → transcribing → extracting_frames → ...`). |
| `/sop/:id/procedure` | viewer+ | Main SOP page. Three-column layout: StepSidebar (step list) + VideoPlayer + StepCard (detail). Step selection syncs video timestamp. |
| `/sop/:id/overview` | viewer+ | SOPDetailsCard (title, client, date, status badge). Stats strip (steps approved, duration, participants). Approval progress bar. Stacked avatar list. |
| `/sop/:id/processmap` | viewer+ | Read-only: renders Mermaid diagram image. Editor/Admin: full wizard to assign steps to swim lanes. |
| `/sop/:id/history` | editor+ | Date-grouped activity timeline. Events: pipeline stage changes, exports, approvals, edits. Show-more pagination. |
| `/sop/:id/metrics` | viewer+ | Views/likes (viewers). Full approval stats + export history (editors). Who liked list (admins). |
| `/settings` | admin | User management: UserManagementTable with stats cards, search, role filter pills, invite panel. Role permissions sidebar. |
| `/merge` | editor+ | SOP version merge. Two tabs: **Merged SOPs** (completed merges) + **Source Groups** (groups ready to merge). |
| `/merge/:sessionId` | editor+ | Active merge session. Sub-routes: diff review → preview → finalize. |

### VideoPlayer + Step Sync Architecture

The procedure page uses a three-way sync via `useStepSync` hook:

```
User clicks step in StepSidebar
  → Zustand: selectedStepId changes
  → VideoPlayer seeks to step.timestamp_start
  → TranscriptPanel scrolls to nearest transcript line

Video time advances
  → Zustand: currentVideoTime changes
  → useStepSync finds which step covers currentVideoTime
  → Updates selectedStepId (if different)
  → TranscriptPanel scrolls

User drags transcript
  → Transcript line clicked → video.seek(line.timestamp_sec)
  → Updates currentVideoTime → step selection follows

Circular update prevention:
  → seekSource flag: if video seek was triggered by step selection,
    don't re-trigger step selection when timeupdate fires
```

---

## 8. End-to-End Process Flows

### A. Video Upload → SOP Pipeline (Full Flow)

```
[Admin] Opens /sop/new
         │
         ▼
[Browser] Uploads MP4 file
         │
         ▼
[sop-api] Saves file temporarily, uploads to Azure Blob
          Creates sop + pipeline_run (status=queued)
          Triggers WF0 webhook
         │
         ▼
[WF0 n8n] → probes video duration (→ sop-extractor /api/probe-video)
           → if > 55 min: splits video (→ sop-extractor /api/split-video)
           → triggers WF1 with sop_id + video_url + split info
         │
         ▼
[WF1 n8n] → uploads video to Gemini File API
           → polls until ACTIVE
           → Gemini transcription call → transcript lines
           → Gemini screen detection call → screen_share_periods
           → Fix Screen Periods crop adjustment
           → Gemini step extraction call → sop_steps (no screenshots yet)
           → Gemini section generation call → sop_sections (17 sections)
           → INSERT transcript_lines, sop_steps, sop_sections → Supabase
           → UPDATE pipeline_runs status='extracting_frames'
           → triggers WF2b
         │
         ▼
[WF2b n8n] → loads sop + screen_share_periods from Supabase
            → POST sop-extractor /api/extract (600s timeout)
              ├─ FFmpeg crop + trim per period
              ├─ PySceneDetect scene boundaries
              ├─ Time-based fallback (every 2 min if no scene)
              ├─ imagehash deduplication
              └─ PNG upload to Azure Blob per frame
            → receives frame list with azure_urls + timestamps
            → INSERT/UPDATE sop_steps with screenshot_url, timestamps → Supabase
            → UPDATE pipeline_runs status='generating_annotations'
            → triggers WF3c
         │
         ▼
[WF3c n8n] → loops over each step with a screenshot
  Per frame:
            → HTTP GET: download frame from Azure Blob
            → base64 encode (raw, no data URI prefix)
            → POST Vertex AI Gemini Vision: what to annotate?
              → returns [{callout_number, label, element_type, region_hint}]
            → POST Cloud Vision OCR: where is text in the image?
              → returns text bounding boxes with pixel coords
            → Run matching algorithm: link callouts to OCR boxes
              → target_x/y as 0.0-1.0 relative coords
              → confidence: ocr_exact / ocr_fuzzy / gemini_only
            → INSERT step_callouts → Supabase
            → POST sop-api /api/steps/{id}/render-annotated
              → sop-api proxies to sop-extractor /api/render-annotated
              → Pillow: draws numbered circles on PNG
              → uploads annotated PNG to Azure Blob
              → returns annotated_screenshot_url
            → UPDATE sop_steps.annotated_screenshot_url → Supabase
         │
         ▼
[WF3c] → UPDATE pipeline_runs status='completed'
       → UPDATE sops.status='draft'
         │
         ▼
[Dashboard] SOP card shows "Draft" badge
[Admin/Editor] Opens /sop/:id/procedure
              → Reviews annotated screenshots
              → Drags misplaced callouts in AnnotationEditorModal (Konva.js)
              → Approves steps one by one
              → Changes status: draft → in_review → published
```

---

### B. Word/DOCX + PDF Export Flow

```
[User] Clicks "Export DOCX" or "Export PDF" button
         │
         ▼
[Browser] POST /api/sops/{sop_id}/export?format=docx
         │
         ▼
[sop-api] 1. SELECT full SOP from Supabase (steps + callouts + sections + watchlist)
          2. Serialize → SOPDetail Pydantic model (appends SAS tokens to all Azure URLs)
          3. Build render payload:
             - sop_title, client_name, process_name, meeting_date
             - steps[]: sequence, title, description, sub_steps, annotated_screenshot_url, callouts[]
             - sections[]: section_title, content_type, content_text, content_json
          4. POST sop-extractor /api/render-doc (600s timeout)
         │
         ▼
[sop-extractor] 1. Load /data/templates/sop_template.docx
                2. Download each annotated_screenshot_url (Azure Blob with SAS)
                3. docxtpl.render(context):
                   - {{ sop_title }}, {{ client_name }}, etc. → replaced inline
                   - {{ steps }} → loop generates one section per step
                   - Each step section: screenshot (InlineImage), title, description,
                     sub-steps list, callout legend table
                   - {{ sections }} → loop generates document sections
                4. Post-process: inject Word XML tables for Risk Register,
                   Communication Matrix, Quality Parameters (complex table sections)
                5. Save sop_{id}.docx to /data/exports/{sop_id}/
                6. If PDF: LibreOffice headless → .pdf file
                7. Upload DOCX (+ PDF) to Azure Blob:
                   {base}/exports/{sop_id}/sop_{sop_id}.docx
                8. Return { docx_url: "...", pdf_url: "..." }
         │
         ▼
[sop-api] 5. INSERT ExportHistory row (file_url without SAS)
          6. with_sas(file_url) → appends SAS token
          7. Return { download_url: "...?sas=...", filename: "sop_xxx.docx" }
         │
         ▼
[Browser] Downloads file directly from Azure Blob URL with SAS
```

**Key design decisions:**
- URLs stored in DB **without** SAS token (SAS tokens expire). SAS is appended at read time.
- Template is in `/data/templates/` (shared Docker volume). Client can edit the Word template without any code changes.
- Complex tables (Risk Register, Comm Matrix) are injected as raw Word XML because docxtpl's Jinja2 syntax doesn't support full dynamic table creation.
- LibreOffice runs headless inside the `sop-extractor` container. No cloud service needed for PDF.

---

### C. Annotation / Callout Flow

```
Automatic (WF3c — initial placement):
  Gemini Vision → [callout_number, label, region_hint]
  Cloud Vision OCR → [text bounding boxes with pixel coords]
  Matching algorithm → target_x/y (0.0-1.0 relative)
  Pillow draws circles → annotated PNG
  Stored: step_callouts.target_x/y, confidence=ocr_exact/fuzzy/gemini_only

Manual review (AnnotationEditorModal in browser):
  Editor opens step → clicks "Edit Callouts"
  Konva.js canvas loads (lazy imported, ~140KB gzipped):
    - Layer 1: screenshot as background image
    - Layer 2: highlight overlay
    - Layer 3: callout circles (draggable)
    - Layer 4: hit areas
  Editor drags a circle to correct position:
    - Drag end → new target_x/y computed
    - First drag: original_x/y saved (preserves audit trail)
    - was_repositioned = true
  Editor clicks Save:
    - PATCH /api/steps/{id}/callouts (bulk update with new positions)
    - POST /api/steps/{id}/render-annotated
      → sop-extractor draws new PNG with corrected positions
      → returns new annotated_screenshot_url
    - Step in UI refreshes with new image

Confidence color coding (read mode):
  Green ring  = ocr_exact   (OCR found exact text match)
  Amber ring  = ocr_fuzzy   (OCR found fuzzy text match)
  Red ring    = gemini_only (no OCR match, used Gemini coordinate estimate)
  Blue ring   = repositioned (editor has manually corrected this callout)
```

---

### D. SOP Version Merge Flow

When the same process is recorded twice (e.g. two training sessions of "Aged Debtor Report"), this workflow merges them intelligently:

```
[Editor] Creates Process Group
  → POST /api/merge/process-groups { name: "Aged Debtor Report" }
  → Auto-generates code "GRP-001"
  → PATCH /api/sops/{sop1_id}/project-code { project_code: "GRP-001" }
  → PATCH /api/sops/{sop2_id}/project-code { project_code: "GRP-001" }

[Editor] Opens /merge page → Source Groups tab
  → GET /api/merge/groups → shows "Aged Debtor Report" group

[Editor] Clicks "Compare & Merge"
  → POST /api/merge/compare { base_sop_id, updated_sop_id }
  → sop-api loads both SOPs with all steps
  → POST sop-extractor /api/compare-sops
    → Gemini call: "Given these two step lists, find:
       - unchanged steps (same in both)
       - modified steps (same intent but different detail)
       - added steps (new in updated)
       - removed steps (in base, not in updated)"
    → Returns matches: [{status, base_step_id, updated_step_id, change_summary}]
  → INSERT sop_merge_sessions { status: "reviewing", diff_result: matches }
  → Returns session_id + matches

[Editor] Reviews diff on /merge/:sessionId
  → For each matched step: choose "keep base" / "keep updated" / "exclude"
  → Sees change_summary text per step

[Editor] Clicks Finalize
  → POST /api/merge/sessions/{session_id}/finalize
  → sop-api:
    1. CREATE new sop: title="{group_name} (Updated)", status=draft, is_merged=true
    2. For each approved decision:
       - Copy SOPStep from chosen source (base or updated sop)
       - Assign new sequence number
       - Azure Blob copy: frame + annotated frame → new SOP's folder
       - Copy StepClips for this step
    3. Copy SOPSections from base SOP
    4. UPDATE sop_merge_sessions status="merged", merged_sop_id=new_sop.id

[Dashboard] Merged SOP appears as a new draft SOP
[/merge Merged SOPs tab] Shows the merge record with source SOPs listed
```

---

## 9. Cross-Reference: Who Calls What

### Endpoints by Caller

| Caller | Calls | Endpoint | Purpose |
|---|---|---|---|
| **Browser** | sop-api | `GET /api/sops` | List SOPs |
| **Browser** | sop-api | `GET /api/sops/{id}` | Load full SOP |
| **Browser** | sop-api | `PATCH /api/steps/{id}/callouts` | Save callout positions |
| **Browser** | sop-api | `POST /api/steps/{id}/render-annotated` | Re-render annotated PNG |
| **Browser** | sop-api | `POST /api/sops/{id}/export?format=docx` | Trigger DOCX/PDF export |
| **Browser** | sop-api | `POST /api/merge/compare` | Start merge comparison |
| **Browser** | sop-api | `POST /api/merge/sessions/{id}/finalize` | Complete merge |
| **n8n WF0** | sop-extractor | `POST /api/probe-video` | Get video duration |
| **n8n WF0** | sop-extractor | `POST /api/split-video` | Split long video at keyframe |
| **n8n WF0** | sop-api | `POST /api/sops` | Create SOP + pipeline_run |
| **n8n WF1** | Gemini File API | `POST .../upload/v1beta/files` | Upload video for transcription |
| **n8n WF1** | Gemini API | `POST .../v1beta/models/gemini-2.5-flash:generateContent` | Transcribe / detect screens / generate steps |
| **n8n WF1** | Supabase | Direct SQL | INSERT transcript_lines, sop_steps, sop_sections |
| **n8n WF2b** | sop-extractor | `POST /api/extract` | Extract + deduplicate frames |
| **n8n WF2b** | Supabase | Direct SQL | UPDATE sop_steps with screenshot_url |
| **n8n WF3c** | Azure Blob | HTTP GET | Download frame PNGs |
| **n8n WF3c** | Vertex AI | `POST .../gemini-2.5-flash:generateContent` | Semantic callout identification |
| **n8n WF3c** | Cloud Vision | `POST .../v1/images:annotate` | OCR bounding boxes |
| **n8n WF3c** | Supabase | Direct SQL | INSERT step_callouts |
| **n8n WF3c** | sop-api | `POST /api/steps/{id}/render-annotated` | Render annotated PNG |
| **n8n WF3c** | Supabase | Direct SQL | UPDATE sop_steps.annotated_screenshot_url |
| **sop-api** | sop-extractor | `POST /api/render-doc` | DOCX/PDF generation |
| **sop-api** | sop-extractor | `POST /api/render-annotated` | Re-render annotated PNG |
| **sop-api** | sop-extractor | `POST /api/compare-sops` | Gemini SOP diff for merge |
| **sop-api** | Supabase | SQLAlchemy async | All DB reads/writes |
| **sop-api** | Azure Blob | REST API | URL generation + blob copy (for merge) |
| **sop-extractor** | Azure Blob | HTTP PUT | Upload frames, clips, exports |
| **sop-extractor** | Azure Blob | HTTP GET (range) | Download videos for processing |
| **sop-extractor** | Gemini API | `POST .../generateContent` | SOP step comparison (merge feature) |

### Database Access Patterns

| Table | Written by | Read by |
|---|---|---|
| `sops` | n8n WF0 (create), sop-api (update/delete) | sop-api, n8n (all WFs) |
| `sop_steps` | n8n WF1 (create), n8n WF2b (screenshot_url), n8n WF3c (annotated_url), sop-api (edit/delete) | sop-api, n8n WF3c |
| `step_callouts` | n8n WF3c (create), sop-api (edit/delete) | sop-api |
| `step_clips` | n8n WF2b (via extractor) | sop-api |
| `transcript_lines` | n8n WF1 | sop-api |
| `sop_sections` | n8n WF1 | sop-api |
| `pipeline_runs` | n8n (status updates), sop-api | n8n WF2b (polls for `extracting_frames`) |
| `export_history` | sop-api | sop-api |
| `sop_merge_sessions` | sop-api | sop-api |
| `process_groups` | sop-api | sop-api |
| `sop_activity_log` | sop-api (all write operations) | sop-api (history tab) |

---

## 10. Security & Access Control

### Role Matrix

| Feature | Viewer | Editor | Admin |
|---|---|---|---|
| View published SOPs | ✅ | ✅ | ✅ |
| View draft / in_review SOPs | ❌ | ✅ | ✅ |
| View all SOPs regardless of status | ❌ | ❌ | ✅ |
| Like SOPs, view metrics | ✅ | ✅ | ✅ |
| View who liked (metrics detail) | ❌ | ❌ | ✅ |
| View History tab | ❌ | ✅ | ✅ |
| Edit callouts, sub-steps, titles | ❌ | ✅ | ✅ |
| Approve steps | ❌ | ✅ | ✅ |
| Change SOP status | ❌ | ✅ | ✅ |
| Create / manage process groups | ❌ | ✅ | ✅ |
| Run merge comparison + finalize | ❌ | ✅ | ✅ |
| Upload new SOPs (trigger pipeline) | ❌ | ❌ | ✅ |
| Delete SOPs | ❌ | ❌ | ✅ |
| Manage users + roles | ❌ | ❌ | ✅ |
| Delete process groups | ❌ | ❌ | ✅ |
| Export DOCX/PDF | ✅ | ✅ | ✅ |

### Authentication Flow

1. User accesses `https://soptest.cloudnavision.com` → Cloudflare ZTNA authenticates
2. Cloudflare injects `CF-Access-Authenticated-User-Email` header
3. `sop-api` reads this header via `useCurrentUser` dependency
4. Looks up user in `users` table by email → returns role
5. All endpoints use `Depends(require_viewer)` / `Depends(require_editor)` / `Depends(require_admin)` FastAPI dependencies

### Azure Blob SAS Tokens

- All Azure Blob URLs are stored in the database **without** the SAS query string
- When `sop-api` serialises any SOP response to the browser, `with_sas(url)` appends the current SAS token
- SAS tokens are configured in `.env` and rotated periodically
- The `sop-extractor` receives SAS tokens in request payloads (never stored)

---

## Quick Reference: Common Questions

**Q: How does the DOCX export know about the callout positions?**
When the user triggers export, `sop-api` fetches the `annotated_screenshot_url` from each step — this is already the pre-rendered PNG with numbered circles drawn by Pillow. The DOCX just embeds this image directly. The callout numbers match the `callout_legend` table generated for each step.

**Q: Does WF2b call n8n's sop-api or the extractor directly?**
WF2b calls `sop-extractor:8001/api/extract` **directly** via internal Docker DNS. It does not go through `sop-api`. The extractor then uploads frames to Azure Blob and returns URLs. WF2b writes those URLs to Supabase directly (bypassing sop-api to avoid Cloudflare's 100s timeout on long operations).

**Q: How does the system handle a 2-hour Teams recording?**
WF0 detects duration > 55 minutes → splits at the nearest keyframe → uploads Part 1 + Part 2 to Azure Blob → passes both URLs and `actual_split_sec` to WF1. WF1 processes each part separately with Gemini (which has a ~2hr File API limit per upload) and offsets Part 2 timestamps by `actual_split_sec`. One SOP record is created; WF2b + WF3c use the **original** (unsplit) video URL for frame extraction.

**Q: Why does WF1 use an API key but WF3c uses a service account?**
WF1 uses the **Gemini File API** (`generativelanguage.googleapis.com/upload/v1beta/files`) which only supports API keys. This endpoint does not exist on Vertex AI. WF3c uses **Vertex AI** (a different endpoint: `aiplatform.googleapis.com`) which requires OAuth / service account auth. A single `cloud-platform` scoped service account covers both Vertex AI Gemini and Cloud Vision OCR.

**Q: What happens if the extractor is busy when WF2b calls it?**
The extractor returns HTTP 503 with a `Retry-After` header. WF2b's n8n node has a retry policy configured. Only one extraction job runs at a time (Semaphore(1)).

**Q: Where is the Cloudflare tunnel running?**
`cloudflared` runs as a daemon on the **Azure VM host** (not inside Docker). It is NOT a Docker container. It routes `soptest.cloudnavision.com` traffic to `localhost:5173` (frontend), `localhost:8000` (API), and `localhost:8001` (extractor for external access during testing). In production, only the frontend and API are exposed externally.
