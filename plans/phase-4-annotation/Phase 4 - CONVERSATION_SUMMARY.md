# Chat Summary — SOP Automation Platform Build
## Phase 4: Frame Annotation (Gemini + Vision OCR)
## Date: 2026-04-01

---

## What Was Completed

### Phase 3 Verified ✅
Before starting Phase 4, confirmed Phase 3 end-to-end success:
- 4 `sop_steps` rows inserted for sop_id `82c234ae-67d5-479a-a4cc-f31abc8fe855`
- Frames uploaded to Azure Blob: `frame_001.png` → `frame_005.png` (1580×890px)
- `pipeline_runs.status` = `classifying_frames`, `current_stage` = `frame_extraction_complete`
- `stage_results`: `{"frame_extraction":{"raw_scenes":5,"after_dedup":4,"periods_processed":1}}`

### Phase 3 n8n Workflow 2 Bug Fixed ✅
The `Insert SOP Steps` node had `contentType: "json"` + `body:` which n8n v4.2 rendered as "Using Fields Below" mode (empty key → Supabase PGRST204 error). Fixed by using `specifyBody: "json"` + `jsonBody:` matching the working `Call Frame Extractor` node pattern. Same fix applied to `Update Pipeline Run` node.

### Workflow 3 Prepared ✅
File: `sop-platform/n8n-workflows/Saara - SOP_Workflow 3 - Gemini Classification.json`

All placeholder credentials replaced with real values:
- Supabase ANON + SERVICE_ROLE keys updated to current (Phase 2 era keys were stale)
- Azure SAS token set (expires 2026-05-29)
- `GEMINI_API_KEY` = `AIzaSyAjXWH-8y75rCVIxcuRyAsUGEZtDPh1kwk` (same as Workflow 1)
- `VISION_API_KEY` = `AIzaSyC425vceP7XsdbYQzzZiEeCSK6GHFR0PoM` (Google Cloud Vision OCR)

### Architecture Decision: Gemini + Vision OCR Hybrid ✅
Google Cloud Vision API is NOT in the original architecture spec, but was included in the sprint plan as `GOOGLE_VISION_API_KEY`. Decision: use the full hybrid approach (Gemini for semantic + Vision for pixel-precise OCR) since the user obtained a Vision API key.

---

## Workflow 3 Node Overview (18 nodes)

| Node | Type | Purpose |
|------|------|---------|
| Every 2 Minutes | Schedule Trigger | Polls for work |
| Setup Config | Set | All credentials |
| Poll Pending Classifications | HTTP GET | pipeline_runs WHERE status=classifying_frames |
| Any Pending? | IF | Stop if nothing to do |
| No Work — Stop | NoOp | End branch |
| Extract Run Info | Code | Carries pipeline_run_id + sop_id forward |
| Get SOP Steps | HTTP GET | sop_steps WHERE classification=useful AND gemini_description IS NULL |
| Split Steps | SplitInBatches(1) | Loop one step at a time |
| Build Image URL | Code | Appends SAS token to screenshot_url |
| Download Frame Image | HTTP GET (file) | Downloads PNG binary from Azure Blob |
| Build Gemini Request | Code | base64 encodes image + builds prompt |
| Call Gemini Vision | HTTP POST | `gemini-2.5-flash:generateContent` |
| Parse Gemini Response | Code | Extracts description + ui_elements as callouts |
| Call Vision OCR | HTTP POST | `vision.googleapis.com TEXT_DETECTION` |
| Run Matching Algorithm | Code | Levenshtein match Gemini labels → OCR bboxes |
| Update SOP Step | HTTP PATCH | Writes gemini_description to sop_steps |
| Insert Step Callouts | HTTP POST | Inserts step_callouts array |
| Update Pipeline Run | HTTP PATCH | status = generating_annotations (on batch done) |

---

## Pending Before Workflow 3 Can Run

- [ ] Enable "Cloud Vision API" in GCP Console for the project tied to `VISION_API_KEY`
- [ ] Import Workflow 3 JSON into n8n (delete old first)
- [ ] Activate workflow and verify first execution

---

## Next Phase

**Phase 5 — Extracting Clips** (`generating_annotations` → `extracting_clips`)
Plan exists at: `sop-platform/plans/phase-5-clips-sections/`
Polls for `generating_annotations`, cuts short MP4 clips per step using FFmpeg via sop-extractor, uploads to Azure Blob, inserts `step_clips` rows.
