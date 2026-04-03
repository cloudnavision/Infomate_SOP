# 3a — sop-extractor FastAPI Endpoints

## Service Overview

`sop-extractor` is a FastAPI service running on port 8001. It is never exposed publicly — all external traffic routes through `sop-api` (port 8000), which proxies to `http://sop-extractor:8001` via Docker internal DNS.

**Docker DNS name:** `sop-extractor`
**Internal URL:** `http://sop-extractor:8001`
**External access:** via sop-api proxy only — `POST soptest.cloudnavision.com/api/extract`

---

## GET /health

### Purpose
Liveness check for Docker health checks and manual verification.

### Request
```
GET http://sop-extractor:8001/health
```

### Response
```json
{
  "status": "ok",
  "service": "sop-extractor"
}
```

### HTTP Status
`200 OK`

---

## POST /extract

### Purpose
Main frame extraction endpoint. Downloads the KT recording video from Azure Blob, applies screen-share crop, runs PySceneDetect for scene detection, deduplicates frames using perceptual hashing, classifies frames with Gemini, and returns only USEFUL frames.

### Request Body

```json
{
  "sop_id": "uuid-string",
  "video_url": "https://sopstoragedev.blob.core.windows.net/infsop/{sop_id}/video.mp4?sv=...&sig=...",
  "screen_share_periods": [
    {
      "start_sec": 120.5,
      "end_sec": 3450.0,
      "crop": {
        "x": 320,
        "y": 0,
        "w": 1600,
        "h": 900
      }
    }
  ],
  "pyscenedetect_threshold": 3.0,
  "min_scene_len_sec": 2,
  "dedup_hash_threshold": 8,
  "frame_offset_sec": 1.5
}
```

### Request Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `sop_id` | string (UUID) | required | Used for Azure Blob path and frame filenames |
| `video_url` | string | required | Azure Blob URL with SAS token for the source video |
| `screen_share_periods` | array | required | Time ranges when screen-share was active |
| `screen_share_periods[].start_sec` | float | required | Start of screen-share in seconds from video start |
| `screen_share_periods[].end_sec` | float | required | End of screen-share in seconds |
| `screen_share_periods[].crop` | object | required | Pixel bounding box of the screen-share region |
| `crop.x` | int | required | Left edge of crop in source video pixels |
| `crop.y` | int | required | Top edge of crop |
| `crop.w` | int | required | Width of crop |
| `crop.h` | int | required | Height of crop |
| `pyscenedetect_threshold` | float | 3.0 | PySceneDetect ContentDetector threshold. Lower = more sensitive. |
| `min_scene_len_sec` | int | 2 | Minimum scene duration in seconds — filters rapid transitions |
| `dedup_hash_threshold` | int | 8 | Max Hamming distance for perceptual hash deduplication |
| `frame_offset_sec` | float | 1.5 | Seconds after scene start to capture the representative frame |

### Processing Steps (Internal)

```python
# 1. Download video from Azure Blob to /tmp/{sop_id}/video.mp4
# 2. For each screen_share_period:
#    a. FFmpeg crop: -vf "crop={w}:{h}:{x}:{y}"
#    b. Apply time filter: -ss {start_sec} -to {end_sec}
#    c. Write cropped segment to /tmp/{sop_id}/segment_{n}.mp4
# 3. Run PySceneDetect on each segment:
#    from scenedetect import detect, ContentDetector
#    scenes = detect(segment_path, ContentDetector(threshold=pyscenedetect_threshold))
# 4. Extract one frame per scene at (scene_start + frame_offset_sec):
#    ffmpeg -i segment.mp4 -ss {offset} -frames:v 1 frame_{n}.png
# 5. Compute perceptual hash (imagehash.phash) for each frame
# 6. Dedup: compare all hashes pairwise, discard frames with hamming_distance < dedup_hash_threshold
# 7. Classify remaining frames with Gemini 2.5 Flash:
#    Prompt: "Classify this screenshot: USEFUL (shows a software step), TRANSITION (mid-animation),
#             BLANK (empty/loading), or DUPLICATE (same as previous). Return JSON: {"classification": "...", "description": "..."}"
# 8. Upload USEFUL frames to Azure Blob: sop-media/{sop_id}/frames/frame_{timestamp_ms}.png
# 9. Return frame list
```

### Response Body

```json
{
  "frames": [
    {
      "frame_id": "frame_120500",
      "timestamp_sec": 120.5,
      "file_path": "/tmp/uuid/frames/frame_120500.png",
      "azure_url": "https://sopstoragedev.blob.core.windows.net/sop-media/{sop_id}/frames/frame_120500.png?sv=...&sig=...",
      "width": 1600,
      "height": 900,
      "scene_score": 42.7,
      "classification": "USEFUL",
      "description": "User navigating to the Aged Debtor Report menu in the ERP system"
    }
  ],
  "stats": {
    "total_detected": 38,
    "after_dedup": 14,
    "after_classification": 11,
    "useful_count": 11
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `frames` | array | USEFUL frames only (classification filter already applied) |
| `frames[].frame_id` | string | Unique ID — `frame_{timestamp_ms}` |
| `frames[].timestamp_sec` | float | Absolute timestamp in original video (not segment-relative) |
| `frames[].file_path` | string | Temp file path on extractor container (for debugging) |
| `frames[].azure_url` | string | Azure Blob URL with SAS token for downstream use |
| `frames[].width` | int | Frame width in pixels (after crop) |
| `frames[].height` | int | Frame height in pixels (after crop) |
| `frames[].scene_score` | float | PySceneDetect scene change score |
| `frames[].classification` | string | Always "USEFUL" in response (others filtered out) |
| `frames[].description` | string | Gemini 2.5 Flash one-sentence description |
| `stats.total_detected` | int | Raw scene count from PySceneDetect |
| `stats.after_dedup` | int | Count after perceptual hash deduplication |
| `stats.after_classification` | int | Count after Gemini classification |
| `stats.useful_count` | int | Final useful frame count (== `len(frames)`) |

### HTTP Status Codes

| Code | Condition |
|------|-----------|
| 200 | Success |
| 422 | Invalid request body (FastAPI validation error) |
| 500 | Internal error (FFmpeg failure, Azure download error, Gemini API error) |

---

## sop-api Proxy Route

The `sop-api` container exposes this proxy in `api/app/main.py`:

```python
@app.post("/api/extract")
async def proxy_extract(request: Request):
    """Proxy frame extraction requests to sop-extractor (internal only)."""
    # Verify internal key header
    if request.headers.get("x-internal-key") != settings.INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")

    body = await request.json()
    async with httpx.AsyncClient(timeout=600.0) as client:
        response = await client.post(
            "http://sop-extractor:8001/extract",
            json=body
        )
    return response.json()
```

**Important:** The 600-second timeout is required. FFmpeg processing of a 60-minute meeting video takes 3-8 minutes.

---

## Local Testing

```bash
# Test health check
curl http://localhost:8001/health

# Test extract endpoint (requires a valid Azure Blob URL with SAS token)
curl -X POST http://localhost:8001/extract \
  -H "Content-Type: application/json" \
  -d '{
    "sop_id": "test-sop-001",
    "video_url": "https://sopstoragedev.blob.core.windows.net/infsop/test/video.mp4?sv=2024-01-01&sig=...",
    "screen_share_periods": [{"start_sec": 0, "end_sec": 300, "crop": {"x": 0, "y": 0, "w": 1920, "h": 1080}}],
    "pyscenedetect_threshold": 3.0,
    "min_scene_len_sec": 2,
    "dedup_hash_threshold": 8,
    "frame_offset_sec": 1.5
  }'
```

---

_Last updated: 2026-03-27_
