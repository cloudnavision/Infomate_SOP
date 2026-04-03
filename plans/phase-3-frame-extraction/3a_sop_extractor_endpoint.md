# Phase 3a: sop-extractor /extract Endpoint

### Objective
Implement the `POST /extract` endpoint in the `sop-extractor` microservice. It receives a video URL + screen-share period metadata from n8n, downloads the MP4, runs the full frame extraction pipeline (FFmpeg crop → PySceneDetect → T+1.5s offset → imagehash phash dedup), uploads surviving frames to Azure Blob, and returns frame metadata JSON.

### Prerequisites
- Phase 2 complete — `sop-extractor` container running at `soptest.cloudnavision.com`, health check passing (`ffmpeg: true, mermaid_cli: true`)
- Azure Blob container `infsop` with working SAS token (same one from Workflow 1)
- A processed SOP in Supabase with `pipeline_runs.status = extracting_frames` for testing

---

### Files to Modify

| File | Change |
|------|--------|
| `extractor/app/scene_detector.py` | Full implementation (was placeholder) |
| `extractor/app/main.py` | Add `POST /extract` + Pydantic models |
| `extractor/requirements.txt` | Add `requests==2.32.3` |

---

### Frame Extraction Pipeline (what scene_detector.py does)

```
For each screen_share_period in the request:

  Stage 1 — FFmpeg crop + trim
    ffmpeg -y -ss {start_time} -i input.mp4
           -t {duration}
           -vf "crop={w}:{h}:{x}:{y}"
           -an -c:v libx264 -preset ultrafast -crf 23
           -avoid_negative_ts make_zero
           period_{n}.mp4

  Stage 2 — PySceneDetect AdaptiveDetector
    threshold: 3.0 (adaptive_threshold)
    min_scene_len: 2.0s * fps frames
    → list of (scene_start_sec, scene_end_sec)

  Stage 3 — Frame capture at T + 1.5s offset
    target_sec = min(scene_start + 1.5, scene_end - 0.05)
    ffmpeg -y -ss {target_sec} -i period_{n}.mp4 -vframes 1 frame_{n:03d}.png

  Stage 4 — imagehash phash deduplication
    phash = imagehash.phash(frame_image)
    if hamming_distance(phash, any_seen_hash) <= 8 → DUPLICATE
    else → USEFUL, add phash to seen list

Global frame numbering across all periods.
Absolute timestamp = period.start_time + target_sec_in_segment.
```

### /extract Request Contract

```json
{
  "sop_id": "550e8400-e29b-41d4-a716-446655440000",
  "video_url": "https://cnavinfsop.blob.core.windows.net/infsop/{sop_id}/original.mp4?{SAS}",
  "screen_share_periods": [
    {
      "start_time": 120.0,
      "end_time": 1800.0,
      "crop": { "x": 170, "y": 95, "w": 1580, "h": 890 }
    }
  ],
  "azure_sas_token": "sv=2022-11-02&ss=b&srt=sco&...",
  "azure_account": "cnavinfsop",
  "azure_container": "infsop",
  "pyscenedetect_threshold": 3.0,
  "min_scene_len_sec": 2.0,
  "dedup_hash_threshold": 8,
  "frame_offset_sec": 1.5
}
```

**Note on `video_url`:** The video URL in Supabase `sops.video_url` has no SAS token. n8n appends the SAS token before calling `/extract`. The extractor uses the full URL (with SAS) for download.

### /extract Response Contract

```json
{
  "sop_id": "550e8400-e29b-41d4-a716-446655440000",
  "frames": [
    {
      "frame_num": 1,
      "timestamp_sec": 125.5,
      "scene_score": 0.0,
      "classification": "USEFUL",
      "azure_url": "https://cnavinfsop.blob.core.windows.net/infsop/{sop_id}/frames/frame_001.png",
      "width": 1580,
      "height": 890
    }
  ],
  "stats": {
    "raw_scenes": 38,
    "after_dedup": 14,
    "periods_processed": 1
  }
}
```

**Note on `azure_url`:** Stored WITHOUT the SAS token — safe to write into Supabase. SAS is only used at upload time.

### Azure Blob Frame Upload

Each USEFUL frame is uploaded via HTTP PUT:

```
PUT https://{account}.blob.core.windows.net/{container}/{sop_id}/frames/frame_{n:03d}.png?{SAS}
Headers:
  x-ms-blob-type: BlockBlob
  Content-Type: image/png
Body: raw PNG bytes
```

Blob path pattern: `{sop_id}/frames/frame_001.png`, `frame_002.png`, etc.

### Endpoint Implementation Notes

- Uses `asyncio.to_thread()` to run the blocking pipeline in a thread pool — keeps FastAPI responsive
- Temp directory (`tempfile.TemporaryDirectory`) auto-cleans on exit, even on errors
- Returns HTTP 500 with error detail if any stage fails — n8n can log and alert
- `scene_score` is `0.0` for all frames in Phase 3 — Gemini classifies in Phase 4

### Manual Test Commands

After rebuilding the container, test with curl:

**Health check:**
```bash
curl https://soptest.cloudnavision.com/health
# Expected: {"status":"ok","ffmpeg":true,"mermaid_cli":true}
```

**FFmpeg version:**
```bash
curl https://soptest.cloudnavision.com/test-ffmpeg
```

**Extract test (replace values with real SOP data from Supabase):**
```bash
curl -X POST https://soptest.cloudnavision.com/extract \
  -H "Content-Type: application/json" \
  -d '{
    "sop_id": "your-sop-uuid",
    "video_url": "https://cnavinfsop.blob.core.windows.net/infsop/your-sop-uuid/original.mp4?your-sas-token",
    "screen_share_periods": [
      {"start_time": 30, "end_time": 300, "crop": {"x": 170, "y": 95, "w": 1580, "h": 890}}
    ],
    "azure_sas_token": "your-sas-token",
    "azure_account": "cnavinfsop",
    "azure_container": "infsop",
    "pyscenedetect_threshold": 3.0,
    "min_scene_len_sec": 2.0,
    "dedup_hash_threshold": 8,
    "frame_offset_sec": 1.5
  }'
```

Expected response time: 30–120 seconds depending on video length and number of screen-share periods.

### Rebuild Commands

```bash
# In the sop-platform directory:
docker compose build sop-extractor
docker compose up -d sop-extractor

# Check logs:
docker compose logs -f sop-extractor
```

### Common Issues & Fixes

| Issue | Likely Cause | Fix |
|-------|-------------|-----|
| `No module named 'requests'` | requirements.txt not updated | Rebuild container after adding `requests==2.32.3` |
| `FFmpeg crop failed` | Wrong crop coordinates | Check `screen_share_periods` crop values from Supabase — should match Gemini's detection from Phase 2 |
| `HTTPError 403` on video download | SAS token expired or wrong | Generate a new SAS token in Azure Portal with read + write permissions |
| `HTTPError 403` on frame upload | SAS token missing write permission | Ensure SAS has `Add`, `Create`, `Write` permissions on the container |
| `AdaptiveDetector` returns 0 scenes | Video segment too short or threshold too high | Lower `pyscenedetect_threshold` to 1.5, or verify the crop segment is non-empty |
| Frame file not created | FFmpeg timestamp beyond segment duration | `target_sec` clamping logic in `_detect_scenes` handles this — check logs |

### Validation Checklist

```
Build:
- [ ] extractor/app/scene_detector.py — full implementation written
- [ ] extractor/app/main.py — POST /extract + Pydantic models added
- [ ] extractor/requirements.txt — requests==2.32.3 added
- [ ] docker compose build sop-extractor — no errors
- [ ] docker compose up -d sop-extractor — container starts

Test:
- [ ] curl /health → ffmpeg: true, mermaid_cli: true
- [ ] curl /extract with real SOP data → 200 response with frames array
- [ ] frames appear in Azure Blob at infsop/{sop_id}/frames/
- [ ] frame PNGs are valid images (not empty/corrupt)
- [ ] DUPLICATE frames filtered out (after_dedup < raw_scenes)
- [ ] azure_url stored without SAS token in response
```

### Status: ⬜ Pending
