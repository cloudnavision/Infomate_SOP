# Phase 3: Frame Extraction

**Objective:** Implement the `sop-extractor` `/extract` endpoint and a new n8n Workflow 2 that polls for `extracting_frames` pipeline runs, extracts scene-change frames from the screen-share portion of the KT video, uploads frames to Azure Blob, and inserts draft `sop_steps` rows into Supabase.

**Status: ⬜ Not Started**

---

## Sub-Parts

| Sub-Part | Description | Status |
|----------|-------------|--------|
| [3a](3a_sop_extractor_endpoint.md) | sop-extractor: `POST /extract` endpoint — download video, scene detect, dedup, upload frames to Azure Blob | ⬜ Pending |
| [3b](3b_n8n_workflow_2.md) | n8n Workflow 2 — poll `extracting_frames`, call `/extract`, insert sop_steps, advance pipeline status | ⬜ Pending |

---

## Architecture

```
n8n Workflow 2 (every 2 min)
  → Poll pipeline_runs WHERE status = 'extracting_frames'
  → Any pending? (IF)
    → FALSE → stop
    → TRUE → Get SOP record (video_url, screen_share_periods)
           → POST soptest.cloudnavision.com/extract
                  (sop_id, video_url, screen_share_periods,
                   azure_sas_token, azure_account, azure_container)
           → sop-extractor:
               1. Download MP4 from Azure Blob (video_url)
               2. For each screen_share_period:
                  a. FFmpeg crop to screen region
                  b. PySceneDetect adaptive scene detection
                  c. Extract frame at T + 1.5s offset per scene
                  d. imagehash phash dedup (threshold 8)
               3. Upload surviving frames → Azure Blob
                  infsop/{sop_id}/frames/frame_001.png ...
               4. Return frame list + stats JSON
           → n8n: Parse frames → filter USEFUL
           → n8n: Bulk insert sop_steps (one row per USEFUL frame)
           → n8n: Update pipeline_run status → 'classifying_frames'
```

---

## Key Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Cloudflare URL | `soptest.cloudnavision.com` | Already configured in Phase 2 → localhost:8001 |
| Separate workflow | New Workflow 2 (not appended to Workflow 1) | Separate concerns; Workflow 1 is already 35 nodes |
| Azure upload from extractor | Pass `azure_sas_token` in request body from n8n | Keeps credentials in n8n Setup Config, extractor stays stateless |
| Multiple screen_share_periods | Iterate all periods in the array | Gemini may detect 2–3 separate screen-share windows in one video |
| Frame classification | sop-extractor returns `USEFUL / TRANSITIONAL / DUPLICATE` | Downstream annotation loop only processes USEFUL frames |
| T+1.5s offset | Apply after PySceneDetect scene boundary | Skips half-rendered windows and transitions |
| Pipeline status after Phase 3 | `classifying_frames` | Next stage: Gemini labels each frame |

---

## 3a: sop-extractor `/extract` Endpoint

### File to modify
`sop-platform/extractor/app/main.py` — add `POST /extract` route
(also implement `sop-platform/extractor/app/scene_detector.py` which is stubbed)

### Request contract

```json
{
  "sop_id": "uuid",
  "video_url": "https://cnavinfsop.blob.core.windows.net/infsop/{sop_id}/original.mp4?{SAS}",
  "screen_share_periods": [
    {
      "start_time": 120.0,
      "end_time": 1800.0,
      "crop": { "x": 170, "y": 95, "w": 1580, "h": 890 }
    }
  ],
  "azure_sas_token": "sv=2022-11-02&ss=b&...",
  "azure_account": "cnavinfsop",
  "azure_container": "infsop",
  "pyscenedetect_threshold": 3.0,
  "min_scene_len_sec": 2.0,
  "dedup_hash_threshold": 8,
  "frame_offset_sec": 1.5
}
```

### Response contract

```json
{
  "sop_id": "uuid",
  "frames": [
    {
      "frame_num": 1,
      "timestamp_sec": 125.5,
      "scene_score": 34.2,
      "classification": "USEFUL",
      "azure_url": "https://cnavinfsop.blob.core.windows.net/infsop/{sop_id}/frames/frame_001.png",
      "width": 1580,
      "height": 890
    }
  ],
  "stats": {
    "raw_scenes": 38,
    "after_dedup": 14,
    "useful": 11,
    "periods_processed": 1
  }
}
```

### Processing pipeline (inside the endpoint)

```
For each screen_share_period:
  1. FFmpeg crop segment
     ffmpeg -i {video} -ss {start} -to {end}
            -vf "crop={w}:{h}:{x}:{y}"
            /tmp/{sop_id}/period_{n}.mp4

  2. PySceneDetect — adaptive threshold
     AdaptiveDetector(adaptive_threshold=3.0, min_scene_len=fps*2)
     → list of (scene_start_sec, scene_end_sec, score)

  3. T+1.5s offset — extract frame at scene_start + frame_offset_sec
     ffmpeg -i period_{n}.mp4 -ss {T+1.5} -vframes 1 frame_{global_n:03d}.png

  4. imagehash phash dedup
     For each new frame: compute phash
     If hamming_distance(phash, prev_phash) <= 8 → DUPLICATE
     Else → USEFUL (or TRANSITIONAL — Gemini classifies later)

  5. Upload USEFUL frames to Azure Blob
     PUT https://{account}.blob.core.windows.net/{container}/{sop_id}/frames/frame_{n:03d}.png?{SAS}
     Headers: x-ms-blob-type: BlockBlob, Content-Type: image/png
```

### New Python dependencies (already in requirements.txt)
- `scenedetect[opencv]==0.6.4` ✅
- `imagehash==4.3.1` ✅
- `Pillow==10.4.0` ✅
- `opencv-python-headless==4.10.0.84` ✅
- `requests` — for Azure Blob PUT and video download (add if missing)

### Temp file cleanup
Use `tempfile.TemporaryDirectory()` context manager — auto-cleans on exit even on errors.

---

## 3b: n8n Workflow 2 — Frame Extraction

**Workflow name:** `Saara - SOP_Workflow 2 - Frame Extraction.json`
**Location:** `sop-platform/n8n-workflows/`
**Trigger:** Schedule — every 2 minutes

### Node chain

```
Every 2 Minutes (Schedule)
→ Setup Config (Set — SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
                      AZURE_BLOB_SAS_TOKEN, AZURE_BLOB_ACCOUNT, AZURE_BLOB_CONTAINER,
                      EXTRACTOR_URL = https://soptest.cloudnavision.com)
→ Poll Pending Extractions
    GET {SUPABASE_URL}/rest/v1/pipeline_runs
    ?status=eq.extracting_frames&select=id,sop_id&limit=1
    Headers: apikey, Authorization: Bearer {SERVICE_ROLE_KEY}
→ Any Pending? (IF — items count > 0)
  → FALSE → No Work — Stop (NoOp)
  → TRUE  → Get SOP Record
              GET {SUPABASE_URL}/rest/v1/sops?id=eq.{sop_id}
              &select=id,video_url,screen_share_periods
→ Call Frame Extractor
    POST {EXTRACTOR_URL}/extract
    Timeout: 600000ms (10 min)
    Body: {
      sop_id, video_url, screen_share_periods,
      azure_sas_token: {AZURE_BLOB_SAS_TOKEN},
      azure_account:   {AZURE_BLOB_ACCOUNT},
      azure_container: {AZURE_BLOB_CONTAINER},
      pyscenedetect_threshold: 3.0,
      min_scene_len_sec: 2.0,
      dedup_hash_threshold: 8,
      frame_offset_sec: 1.5
    }
→ Filter USEFUL Frames (Code)
    const frames = $json.frames.filter(f => f.classification !== 'DUPLICATE')
    return frames.map((f, i) => ({ json: { ...f, sop_id, sequence: i+1 } }))
→ Build Step Inserts (Code)
    map to sop_steps schema:
    { sop_id, sequence, title: `Step ${sequence}`,
      timestamp_start: f.timestamp_sec,
      screenshot_url: f.azure_url,
      screenshot_width: f.width, screenshot_height: f.height,
      scene_score: f.scene_score,
      frame_classification: f.classification.toLowerCase() }
→ Insert SOP Steps
    POST {SUPABASE_URL}/rest/v1/sop_steps
    Prefer: return=minimal
→ Update Pipeline Run
    PATCH {SUPABASE_URL}/rest/v1/pipeline_runs?id=eq.{pipeline_run_id}
    { status: "classifying_frames",
      stage_results: { frame_extraction: { ...stats } } }
→ Update SOP Status
    PATCH {SUPABASE_URL}/rest/v1/sops?id=eq.{sop_id}
    { status: "processing" }  (already processing, keep unchanged)
```

### n8n-specific notes

- Use `SERVICE_ROLE_KEY` (not anon key) for the Supabase write operations
- `Poll Pending Extractions` uses `limit=1` — process one SOP per trigger cycle
- `Call Frame Extractor` timeout = 600s (long videos need ~5–8 min to process)
- `Insert SOP Steps` — bulk POST array (Supabase handles arrays natively)
- Do NOT use `SplitInBatches` for frame insert — send all rows in one POST

---

## Supabase `sop_steps` insert shape

```json
[
  {
    "sop_id": "uuid",
    "sequence": 1,
    "title": "Step 1",
    "timestamp_start": 125.5,
    "screenshot_url": "https://cnavinfsop.blob.core.windows.net/infsop/{id}/frames/frame_001.png",
    "screenshot_width": 1580,
    "screenshot_height": 890,
    "scene_score": 34.2,
    "frame_classification": "useful"
  }
]
```

> `title` and `description` are placeholders — Phase 5 (Section Generation) will overwrite with AI content.

---

## Docker / Env Changes Required

Add to `sop-platform/.env` (already has AZURE vars — verify these are present):
```
AZURE_BLOB_SAS_TOKEN=sv=2022-11-02&ss=b&...
AZURE_BLOB_ACCOUNT=cnavinfsop
AZURE_BLOB_CONTAINER=infsop
```

No docker-compose changes needed — sop-extractor is already running at :8001.

---

## Test Checkpoint

After Phase 3 is complete, verify in Supabase:

1. `sop_steps` table — new rows with `screenshot_url` pointing to Azure Blob frames ✅
2. Azure Blob `infsop/{sop_id}/frames/` — PNG files exist ✅
3. `pipeline_runs` table — `status = classifying_frames` ✅
4. `soptest.cloudnavision.com/extract` — returns 200 with frame list ✅

---

## What's Next — Phase 4

Phase 4 will iterate `sop_steps` in batches and call Gemini to:
- Classify each frame as `USEFUL / TRANSITIONAL / DUPLICATE` (sets `frame_classification`)
- Generate `gemini_description` for each step
- Identify UI element callouts → insert `step_callouts` rows
- Update `pipeline_runs.status` → `generating_annotations`
