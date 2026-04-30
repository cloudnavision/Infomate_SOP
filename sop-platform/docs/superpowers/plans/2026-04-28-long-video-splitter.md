# Plan: Long Video Splitter (WF0)
**Date:** 2026-04-28
**Spec:** docs/superpowers/specs/2026-04-28-long-video-splitter-design.md

## File Map

| Action | Path |
|--------|------|
| MODIFY | `extractor/app/main.py` — add `/api/probe-video` and `/api/split-video` endpoints |
| CREATE | `n8n-workflows/Saara - SOP_WF0 - Long Video Splitter.json` |

---

## Task 1 — Add `/api/probe-video` endpoint to extractor

**File:** `extractor/app/main.py`

Add after the existing `/api/compare-sops` endpoint (end of file, before helper functions around line 600).

### Step 1 — Add Pydantic models (after existing models, ~line 130)

```python
# ── Probe / Split models ──────────────────────────────────────────────────────

class ProbeVideoRequest(BaseModel):
    video_url: str
    azure_sas_token: str
    azure_account: str
    azure_container: str

class ProbeVideoResponse(BaseModel):
    duration_sec: int
    width: Optional[int] = None
    height: Optional[int] = None

class SplitVideoRequest(BaseModel):
    video_url: str
    sop_id: str
    azure_sas_token: str
    azure_account: str
    azure_container: str
    split_target_sec: Optional[float] = None   # defaults to duration/2
    search_window_sec: float = 300.0            # ±5 min search window

class SplitVideoResponse(BaseModel):
    part1_url: str
    part1_duration_sec: int
    part2_url: str
    part2_duration_sec: int
    actual_split_sec: float
```

### Step 2 — Add `/api/probe-video` endpoint (after compare-sops endpoint)

```python
# ── /api/probe-video ──────────────────────────────────────────────────────────

@app.post("/api/probe-video", response_model=ProbeVideoResponse, tags=["split"])
async def probe_video(req: ProbeVideoRequest) -> ProbeVideoResponse:
    """Download video and return duration + dimensions via ffprobe."""
    async with _extraction_semaphore:
        try:
            result = await asyncio.to_thread(_run_probe_job, req)
            return result
        except Exception as exc:
            logger.exception("Probe job failed")
            raise HTTPException(status_code=500, detail=str(exc)) from exc


def _run_probe_job(req: ProbeVideoRequest) -> ProbeVideoResponse:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        video_path = tmp_dir / "video.mp4"
        _download_file(req.video_url, video_path)

        cmd = [
            "ffprobe", "-v", "quiet",
            "-show_entries", "format=duration",
            "-show_entries", "stream=width,height",
            "-of", "json",
            str(video_path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            raise RuntimeError(f"ffprobe failed: {result.stderr[-300:]}")

        import json as _json
        data = _json.loads(result.stdout)
        duration = float(data["format"]["duration"])
        streams = data.get("streams", [])
        width = next((s.get("width") for s in streams if s.get("width")), None)
        height = next((s.get("height") for s in streams if s.get("height")), None)
        return ProbeVideoResponse(
            duration_sec=int(duration),
            width=width,
            height=height,
        )
```

### Verify
```bash
curl -X POST http://localhost:8001/api/probe-video \
  -H "Content-Type: application/json" \
  -d '{"video_url":"<azure_url_with_sas>","azure_sas_token":"...","azure_account":"cnavinfsop","azure_container":"infsop"}'
# Expected: {"duration_sec": N, "width": 1920, "height": 1080}
```

---

## Task 2 — Add `/api/split-video` endpoint to extractor

**File:** `extractor/app/main.py`

Add after `/api/probe-video`.

```python
# ── /api/split-video ──────────────────────────────────────────────────────────

@app.post("/api/split-video", response_model=SplitVideoResponse, tags=["split"])
async def split_video(req: SplitVideoRequest) -> SplitVideoResponse:
    """Split a long video at the nearest keyframe to the midpoint and upload both parts."""
    if _extraction_semaphore.locked():
        raise HTTPException(status_code=503, detail="Extractor busy — retry in 60 seconds.",
                            headers={"Retry-After": "60"})
    async with _extraction_semaphore:
        try:
            result = await asyncio.to_thread(_run_split_job, req)
            return result
        except Exception as exc:
            logger.exception("Split job failed for sop_id=%s", req.sop_id)
            raise HTTPException(status_code=500, detail=str(exc)) from exc


def _find_split_keyframe(video_path: Path, target_sec: float, window_sec: float) -> float:
    """Return the keyframe timestamp nearest to target_sec within ±window_sec."""
    cmd = [
        "ffprobe", "-v", "quiet",
        "-select_streams", "v",
        "-skip_frame", "nokey",
        "-show_entries", "frame=pkt_pts_time",
        "-of", "csv=p=0",
        str(video_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0 or not result.stdout.strip():
        logger.warning("ffprobe keyframe list failed — using exact target_sec")
        return target_sec

    keyframes = []
    for line in result.stdout.strip().split("\n"):
        try:
            keyframes.append(float(line.strip()))
        except ValueError:
            continue

    candidates = [t for t in keyframes if abs(t - target_sec) <= window_sec]
    if not candidates:
        logger.warning("No keyframe within window — using exact target_sec")
        return target_sec
    return min(candidates, key=lambda t: abs(t - target_sec))


def _probe_duration(video_path: Path) -> float:
    """Return video duration in seconds using ffprobe."""
    cmd = ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
           "-of", "csv=p=0", str(video_path)]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    return float(result.stdout.strip())


def _run_split_job(req: SplitVideoRequest) -> SplitVideoResponse:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        video_path = tmp_dir / "full.mp4"
        part1_path = tmp_dir / "part1.mp4"
        part2_path = tmp_dir / "part2.mp4"

        logger.info("Downloading full video for split: sop_id=%s", req.sop_id)
        _download_file(req.video_url, video_path)

        duration = _probe_duration(video_path)
        target_sec = req.split_target_sec if req.split_target_sec is not None else duration / 2
        split_sec = _find_split_keyframe(video_path, target_sec, req.search_window_sec)
        logger.info("Splitting at %.1fs (target=%.1fs, duration=%.1fs)", split_sec, target_sec, duration)

        # Part 1: 0 → split_sec
        cmd1 = ["ffmpeg", "-y", "-ss", "0", "-to", str(split_sec),
                "-i", str(video_path), "-c", "copy", str(part1_path)]
        r1 = subprocess.run(cmd1, capture_output=True, text=True, timeout=600)
        if r1.returncode != 0:
            raise RuntimeError(f"FFmpeg part1 failed: {r1.stderr[-500:]}")

        # Part 2: split_sec → end
        cmd2 = ["ffmpeg", "-y", "-ss", str(split_sec),
                "-i", str(video_path), "-c", "copy", str(part2_path)]
        r2 = subprocess.run(cmd2, capture_output=True, text=True, timeout=600)
        if r2.returncode != 0:
            raise RuntimeError(f"FFmpeg part2 failed: {r2.stderr[-500:]}")

        part1_dur = int(_probe_duration(part1_path))
        part2_dur = int(_probe_duration(part2_path))

        # Upload both to Azure
        azure_base = f"https://{req.azure_account}.blob.core.windows.net/{req.azure_container}"
        p1_blob = f"{req.sop_id}/parts/part1.mp4"
        p2_blob = f"{req.sop_id}/parts/part2.mp4"
        p1_upload_url = f"{azure_base}/{p1_blob}?{req.azure_sas_token}"
        p2_upload_url = f"{azure_base}/{p2_blob}?{req.azure_sas_token}"

        logger.info("Uploading part1 (%ds) → %s", part1_dur, p1_blob)
        _upload_to_azure_blob_video(part1_path, p1_upload_url)
        logger.info("Uploading part2 (%ds) → %s", part2_dur, p2_blob)
        _upload_to_azure_blob_video(part2_path, p2_upload_url)

        return SplitVideoResponse(
            part1_url=f"{azure_base}/{p1_blob}",
            part1_duration_sec=part1_dur,
            part2_url=f"{azure_base}/{p2_blob}",
            part2_duration_sec=part2_dur,
            actual_split_sec=split_sec,
        )
```

### Verify
```bash
curl -X POST http://localhost:8001/api/split-video \
  -H "Content-Type: application/json" \
  -d '{
    "video_url": "<azure_url_with_sas>",
    "sop_id": "test-split-001",
    "azure_sas_token": "...",
    "azure_account": "cnavinfsop",
    "azure_container": "infsop"
  }'
# Expected: {"part1_url":"...","part1_duration_sec":N,"part2_url":"...","part2_duration_sec":N,"actual_split_sec":N}
```

### Rebuild extractor after Tasks 1 & 2
```bash
cd sop-platform
docker compose build sop-extractor && docker compose up -d sop-extractor
```

---

## Task 3 — Create n8n workflow JSON

**File:** `n8n-workflows/Saara - SOP_WF0 - Long Video Splitter.json`

Create this file by copying `Saara - SOP_Workflow 1 - Ingestion & Transcription.json` as a base, then making the following changes in the n8n UI or directly in the JSON:

### Node structure (in order)

| # | Name | Type | Key config |
|---|------|------|-----------|
| 1 | Every 10 Minutes | n8n-nodes-base.scheduleTrigger | interval: 10, unit: minutes |
| 2 | Setup Config | n8n-nodes-base.set | Same credentials as WF1 (Supabase URL, Supabase key, Azure account/container/SAS, extractor URL) |
| 3 | Get Root Site | n8n-nodes-base.microsoftSharePoint | GET site ID (same as WF1) |
| 4 | Get Drive ID | n8n-nodes-base.microsoftSharePoint | GET drive (same as WF1) |
| 5 | Get Unprocessed Files | n8n-nodes-base.microsoftSharePoint | List items where `IsProcessed eq false` |
| 6 | Has Files? | n8n-nodes-base.if | Condition: `{{ $json.value.length }} > 0` |
| 7 | Download Video | n8n-nodes-base.httpRequest | GET SharePoint download URL, response format: file |
| 8 | Upload Full Video to Azure | n8n-nodes-base.httpRequest | PUT `https://{{azureAccount}}.blob.core.windows.net/{{container}}/{{sopId}}/video.mp4?{{sas}}`, headers: x-ms-blob-type=BlockBlob |
| 9 | Probe Video Duration | n8n-nodes-base.httpRequest | POST `{{extractorUrl}}/api/probe-video` with video_url, azure creds |
| 10 | Is Long Video? | n8n-nodes-base.if | Condition: `{{ $json.duration_sec }} > 7200` |
| 11 | Stop (Short Video) | n8n-nodes-base.noOp | FALSE branch — WF1 will handle |
| 12 | Mark File Processed | n8n-nodes-base.microsoftSharePoint | PATCH item: set IsProcessed=true |
| 13 | Split Video | n8n-nodes-base.httpRequest | POST `{{extractorUrl}}/api/split-video` with video_url, sop_id, azure creds |
| 14 | Create SOP Part 1 | n8n-nodes-base.httpRequest | POST Supabase `/rest/v1/sops` — title: `{{filename}} - Part 1`, video_url: part1_url, video_duration_sec: part1_duration_sec, status: processing, pipeline_status: queued |
| 15 | Create SOP Part 2 | n8n-nodes-base.httpRequest | POST Supabase `/rest/v1/sops` — same for part 2 |
| 16 | Create Process Group | n8n-nodes-base.httpRequest | POST `{{apiUrl}}/api/merge/process-groups` — name: `{{filename}}`, sop_ids: [part1_id, part2_id] |
| 17 | Start Gemini Upload Part 1 | n8n-nodes-base.httpRequest | POST Gemini resumable upload start (same headers as WF1) |
| 18 | Upload Part 1 to Gemini | n8n-nodes-base.httpRequest | PUT binary to resumable URL from node 17 |
| 19 | Poll Part 1 Active | n8n-nodes-base.wait + loop | GET Gemini file status, loop until state=ACTIVE (10s wait, same as WF1) |
| 20 | Transcribe Part 1 | n8n-nodes-base.httpRequest | POST Gemini generateContent with Part 1 file URI + transcription prompt (same as WF1) |
| 21 | Save Transcript Part 1 | n8n-nodes-base.httpRequest | POST Supabase `/rest/v1/transcript_lines` bulk insert |
| 22 | Update SOP Part 1 | n8n-nodes-base.httpRequest | PATCH Supabase `/rest/v1/sops?id=eq.{{part1_id}}` — set pipeline_status=extracting_frames |
| 23–28 | (Repeat 17–22 for Part 2) | — | Same nodes, using Part 2 video URI and sop_id |

### Key expressions to set in n8n

**Node 14 (Create SOP Part 1) body:**
```json
{
  "title": "{{ $('Get Unprocessed Files').item.json.name.replace(/\\.mp4$/i, '') }} - Part 1",
  "status": "processing",
  "video_url": "{{ $('Split Video').item.json.part1_url }}",
  "video_duration_sec": "{{ $('Split Video').item.json.part1_duration_sec }}",
  "pipeline_status": "queued",
  "created_by": null
}
```

**Node 15 (Create SOP Part 2) body:**
```json
{
  "title": "{{ $('Get Unprocessed Files').item.json.name.replace(/\\.mp4$/i, '') }} - Part 2",
  "status": "processing",
  "video_url": "{{ $('Split Video').item.json.part2_url }}",
  "video_duration_sec": "{{ $('Split Video').item.json.part2_duration_sec }}",
  "pipeline_status": "queued",
  "created_by": null
}
```

**Node 16 (Create Process Group) body:**
```json
{
  "name": "{{ $('Get Unprocessed Files').item.json.name.replace(/\\.mp4$/i, '') }}",
  "sop_ids": [
    "{{ $('Create SOP Part 1').item.json.id }}",
    "{{ $('Create SOP Part 2').item.json.id }}"
  ]
}
```

### Import steps
1. Open n8n UI → Workflows → New
2. Click `...` → Import from JSON
3. Paste the contents of `Saara - SOP_WF0 - Long Video Splitter.json`
4. Set credentials on all SharePoint, HTTP Request (Gemini auth header), and Supabase nodes
5. Activate the workflow

---

## Commit Boundaries

1. After Task 1+2: `feat(extractor): add probe-video and split-video endpoints`
2. After Task 3: `feat(n8n): add WF0 long video splitter workflow`
