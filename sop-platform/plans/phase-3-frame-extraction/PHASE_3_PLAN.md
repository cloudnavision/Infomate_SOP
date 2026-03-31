# Phase 3 — Frame Extraction

## Goal

For each completed transcription, detect and extract meaningful screenshot frames from the KT recording video. The pipeline polls `pipeline_runs` for records where `status = extracting_frames`, calls the `sop-extractor` service, and persists the resulting frame list as `sop_steps` rows in the database.

**Input:** Azure Blob video URL (stored in `pipeline_runs.video_blob_url`)
**Output:** `sop_steps` rows with `screenshot_url`, `timestamp_start`, `sequence_order`

---

## Current Status

| Item | Status |
|------|--------|
| sop-extractor container built and running | ✅ Done |
| sop-extractor reachable at port 8001 (Docker DNS) | ✅ Done |
| sop-api proxy route `POST /api/extract` | ✅ Done |
| Cloudflare tunnel (soptest.cloudnavision.com) | ✅ Done |
| **n8n → soptest.cloudnavision.com/api/extract** | ❌ BLOCKED — Bot Fight Mode 403 |
| n8n Workflow 2 frame extraction nodes | 🔲 Not started |
| sop_steps DB insert from frame response | 🔲 Not started |

---

## Blocker: Bot Fight Mode

**Status:** WAITING ON TL

n8n cannot POST to `soptest.cloudnavision.com/api/extract` because Cloudflare's Bot Fight Mode intercepts the request and returns HTTP 403 with a JavaScript challenge page. n8n is a server-side automation tool that does not execute JavaScript in a browser context, so the challenge can never be satisfied.

**Required fix:** TL must add a WAF Skip Rule in the Cloudflare dashboard:
- Rule condition: `http.request.headers["x-internal-key"] eq "sop-pipeline-2024"`
- Action: Skip → Bot Fight Mode

See `BLOCKERS.md` in the repo root for full details, screenshots, and alternative fix options.

**Work that can proceed while blocked:** Sub-task 3a (extractor endpoints) and local testing via direct `curl` to `sop-extractor:8001` are both unblocked.

---

## Sub-Tasks

### 3a — Extractor Endpoints

Define and verify the `sop-extractor` FastAPI endpoints that handle frame extraction.

- [ ] Verify `GET /health` returns `{"status": "ok", "service": "sop-extractor"}`
- [ ] Implement / verify `POST /extract` endpoint (see `3a_extractor_endpoints.md`)
- [ ] Test locally: `curl -X POST http://localhost:8001/extract -d '{"sop_id": "test", ...}'`
- [ ] Confirm Docker internal DNS works: from `sop-api` container, `http://sop-extractor:8001/health`

Detailed spec: [3a_extractor_endpoints.md](3a_extractor_endpoints.md)

### 3b — n8n Frame Nodes

Add frame extraction nodes to n8n Workflow 2 (currently ends at Gemini transcription).

- [ ] Unblocked by TL fixing Bot Fight Mode
- [ ] Add "Call Frame Extractor" HTTP node
- [ ] Add "Process Frame Response" Code node
- [ ] Add "Insert SOP Steps" Postgres node
- [ ] Add "Update Pipeline Status" Postgres node (→ `classifying_frames`)
- [ ] End-to-end test with a real KT video

Detailed spec: [3b_n8n_frame_nodes.md](3b_n8n_frame_nodes.md)

---

## 5-Stage Extraction Pipeline (Inside sop-extractor)

```
Stage 1: Crop Detection
  ↓ Identify screen-share region bounding box (x,y,w,h) from PySceneDetect metadata

Stage 2: FFmpeg + PySceneDetect
  ↓ Apply crop, run scene change detection (threshold=3.0)
  ↓ Extract one frame per scene at +1.5s offset from scene start

Stage 3: Perceptual Deduplication
  ↓ imagehash.phash() on each frame
  ↓ Hamming distance < 8 → discard as duplicate

Stage 4: Transition Filtering
  ↓ Remove frames that are mid-transition (blurry, partial slide)
  ↓ Laplacian variance threshold for blur detection

Stage 5: Gemini Classification
  ↓ Gemini 2.5 Flash image analysis per remaining frame
  ↓ Returns: classification (USEFUL / TRANSITION / BLANK / DUPLICATE)
  ↓ Keep USEFUL frames only
```

---

## Expected Frame Counts (30-min Meeting)

| Stage | Count |
|-------|-------|
| Raw scenes detected by PySceneDetect | ~38 |
| After perceptual deduplication (phash) | ~14 |
| After Gemini classification (USEFUL only) | ~11 |

These are approximate averages based on a typical Starboard Hotels KT session. Meetings with heavy screen-share activity may yield more frames.

---

## n8n Workflow 2 — Frame Extraction Additions

The existing Workflow 2 currently ends after writing transcript lines to the database and updating `pipeline_status = extracting_frames`. Phase 3 adds the following node chain after that point:

```
[Existing: Write Transcript Lines]
       ↓
[Existing: Set Status = extracting_frames]
       ↓
[NEW: Wait for Extractor] (5s delay — gives sop-extractor time to be ready)
       ↓
[NEW: Call Frame Extractor] (POST soptest.cloudnavision.com/api/extract)
       ↓
[NEW: Process Frame Response] (Code node — filter USEFUL, build sop_steps rows)
       ↓
[NEW: Insert SOP Steps] (Postgres bulk insert)
       ↓
[NEW: Update Pipeline Status] (SET status = classifying_frames)
```

---

## Issues

See [PHASE_3_ISSUES.md](PHASE_3_ISSUES.md) for the full issues log.

---

_Last updated: 2026-03-27_
