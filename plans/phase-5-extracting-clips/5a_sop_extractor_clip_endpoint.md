# 5a — sop-extractor: POST /clip Endpoint

## Objective

Add a `POST /clip` endpoint to the existing `sop-extractor` FastAPI service. It receives the video URL and a list of clip definitions (step_id + time range), downloads the video once, cuts all clips using FFmpeg, uploads to Azure Blob, and returns clip metadata.

---

## Request Model

```python
class ClipDefinition(BaseModel):
    step_id: str          # UUID of the sop_steps row
    sequence: int         # Used for filename: clip_001.mp4
    start_sec: float      # Clip start (seconds into original video)
    end_sec: float        # Clip end (seconds into original video)

class ClipRequest(BaseModel):
    sop_id: str
    video_url: str                    # Full Azure Blob URL with SAS token
    clips: list[ClipDefinition]
    azure_sas_token: str
    azure_account: str                # e.g. "cnavinfsop"
    azure_container: str              # e.g. "infsop"
```

---

## Response Model

```python
class ClipResult(BaseModel):
    step_id: str
    sequence: int
    clip_url: str         # Azure Blob base URL (no SAS)
    duration_sec: int
    file_size_bytes: int

class ClipResponse(BaseModel):
    sop_id: str
    clips: list[ClipResult]
    clips_created: int
```

---

## Endpoint

```python
@app.post("/clip", response_model=ClipResponse, tags=["extraction"])
async def clip(req: ClipRequest) -> ClipResponse:
    """
    Cut MP4 clips per step from the source video.
    Downloads video once, cuts all clips, uploads to Azure Blob.
    Single-job semaphore — returns 503 if already busy.
    """
    if _extraction_semaphore.locked():
        raise HTTPException(
            status_code=503,
            detail="Extractor busy — another job in progress. Retry in 60 seconds.",
            headers={"Retry-After": "60"},
        )
    async with _extraction_semaphore:
        try:
            result = await asyncio.to_thread(_run_clip_job, req)
            return result
        except Exception as exc:
            logger.exception("Clip job failed for sop_id=%s", req.sop_id)
            raise HTTPException(status_code=500, detail=str(exc)) from exc
```

---

## Implementation: `_run_clip_job`

```python
def _run_clip_job(req: ClipRequest) -> ClipResponse:
    with tempfile.TemporaryDirectory(prefix=f"sop_clips_{req.sop_id}_") as tmp_str:
        tmp_dir = Path(tmp_str)
        video_path = tmp_dir / "original.mp4"

        # Step 1: Download video (reuse existing _download_file helper)
        logger.info("Downloading video for clip job sop_id=%s", req.sop_id)
        _download_file(req.video_url, video_path)

        clip_results = []

        for clip_def in req.clips:
            seq_str = f"{clip_def.sequence:03d}"
            clip_filename = f"clip_{seq_str}.mp4"
            clip_path = tmp_dir / clip_filename

            duration = clip_def.end_sec - clip_def.start_sec

            # Step 2: FFmpeg cut (stream copy — fast, no re-encode)
            cmd = [
                "ffmpeg", "-y",
                "-ss", str(clip_def.start_sec),
                "-to", str(clip_def.end_sec),
                "-i", str(video_path),
                "-c", "copy",
                "-avoid_negative_ts", "make_zero",
                str(clip_path),
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if result.returncode != 0:
                raise RuntimeError(f"FFmpeg clip failed for step {clip_def.step_id}: {result.stderr}")

            # Step 3: Upload to Azure Blob
            blob_path = f"{req.sop_id}/clips/{clip_filename}"
            azure_base_url = (
                f"https://{req.azure_account}.blob.core.windows.net"
                f"/{req.azure_container}/{blob_path}"
            )
            upload_url = f"{azure_base_url}?{req.azure_sas_token}"

            _upload_to_azure_blob_video(clip_path, upload_url)
            logger.info("Uploaded clip_%s → %s", seq_str, blob_path)

            clip_results.append(ClipResult(
                step_id=clip_def.step_id,
                sequence=clip_def.sequence,
                clip_url=azure_base_url,          # No SAS — safe to store
                duration_sec=round(duration),
                file_size_bytes=clip_path.stat().st_size,
            ))

        return ClipResponse(
            sop_id=req.sop_id,
            clips=clip_results,
            clips_created=len(clip_results),
        )
```

---

## Azure Upload Helper (video variant)

```python
def _upload_to_azure_blob_video(local_path: Path, sas_url: str) -> None:
    with open(local_path, "rb") as f:
        data = f.read()
    resp = requests.put(
        sas_url,
        data=data,
        headers={
            "x-ms-blob-type": "BlockBlob",
            "Content-Type": "video/mp4",
        },
        timeout=120,
    )
    resp.raise_for_status()
```

---

## File to Edit

`sop-platform/extractor/app/main.py` — add `ClipDefinition`, `ClipRequest`, `ClipResult`, `ClipResponse` models and `POST /clip` endpoint + `_run_clip_job` function. Reuse `_extraction_semaphore`, `_download_file`, and `_upload_to_azure_blob` already in the file.

---

## Local Test

```bash
curl -X POST http://localhost:8001/clip \
  -H "Content-Type: application/json" \
  -d '{
    "sop_id": "82c234ae-67d5-479a-a4cc-f31abc8fe855",
    "video_url": "https://cnavinfsop.blob.core.windows.net/infsop/.../video.mp4?<SAS>",
    "clips": [
      {"step_id": "9e054a00-...", "sequence": 1, "start_sec": 120.5, "end_sec": 180.5},
      {"step_id": "822733a7-...", "sequence": 2, "start_sec": 185.2, "end_sec": 245.2}
    ],
    "azure_sas_token": "sv=2024-11-04&...",
    "azure_account": "cnavinfsop",
    "azure_container": "infsop"
  }'
```

Expected response:
```json
{
  "sop_id": "82c234ae-...",
  "clips": [
    {
      "step_id": "9e054a00-...",
      "sequence": 1,
      "clip_url": "https://cnavinfsop.blob.core.windows.net/infsop/82c234ae-.../clips/clip_001.mp4",
      "duration_sec": 60,
      "file_size_bytes": 4521600
    }
  ],
  "clips_created": 2
}
```
