"""
SOP Platform — Frame Extractor Service
Phase 3: /extract endpoint — frame extraction pipeline
"""

import asyncio
import logging
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .scene_detector import extract_frames

logger = logging.getLogger(__name__)

app = FastAPI(
    title="SOP Frame Extractor",
    description="FFmpeg + PySceneDetect + Mermaid CLI microservice",
    version="0.2.0",
)

DATA_SUBDIRS = ["uploads", "frames", "exports", "templates"]


# ── Request / Response models ─────────────────────────────────────────────────

class CropRegion(BaseModel):
    x: int
    y: int
    w: int
    h: int


class ScreenSharePeriod(BaseModel):
    start_time: float
    end_time: float
    crop: CropRegion


class ExtractRequest(BaseModel):
    sop_id: str
    video_url: str                    # Full URL (with SAS if needed) for download
    screen_share_periods: list[ScreenSharePeriod]
    azure_sas_token: str              # SAS token for frame uploads
    azure_account: str                # e.g. "cnavinfsop"
    azure_container: str              # e.g. "infsop"
    pyscenedetect_threshold: float = 3.0
    min_scene_len_sec: float = 2.0
    dedup_hash_threshold: int = 8
    frame_offset_sec: float = 1.5


class FrameResult(BaseModel):
    frame_num: int
    timestamp_sec: float
    scene_score: float
    classification: str    # 'USEFUL' or 'DUPLICATE'
    azure_url: str         # Base URL without SAS (safe to store in Supabase)
    width: int
    height: int


class ExtractionStats(BaseModel):
    raw_scenes: int
    after_dedup: int
    periods_processed: int


class ExtractResponse(BaseModel):
    sop_id: str
    frames: list[FrameResult]
    stats: ExtractionStats


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["health"])
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "sop-extractor",
        "ffmpeg": shutil.which("ffmpeg") is not None,
        "mermaid_cli": shutil.which("mmdc") is not None,
    }


# ── Diagnostics ───────────────────────────────────────────────────────────────

@app.get("/test-ffmpeg", tags=["diagnostics"])
async def test_ffmpeg() -> dict[str, Any]:
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True, text=True, timeout=10,
        )
        first_line = result.stdout.split("\n")[0] if result.stdout else "(no output)"
        return {"status": "ok", "ffmpeg_version": first_line, "returncode": result.returncode}
    except FileNotFoundError:
        return {"status": "error", "detail": "ffmpeg not found in PATH"}
    except subprocess.TimeoutExpired:
        return {"status": "error", "detail": "ffmpeg -version timed out"}


@app.get("/test-data-volume", tags=["diagnostics"])
async def test_data_volume() -> dict[str, Any]:
    data_path = Path("/data")
    if not data_path.exists():
        return {
            "status": "error",
            "data_exists": False,
            "data_writable": False,
            "subdirectories": {sub: False for sub in DATA_SUBDIRS},
        }
    subdir_status: dict[str, bool] = {}
    for sub in DATA_SUBDIRS:
        subdir = data_path / sub
        subdir.mkdir(parents=True, exist_ok=True)
        subdir_status[sub] = subdir.exists()
    writable = False
    try:
        with tempfile.NamedTemporaryFile(dir=data_path / "uploads", delete=True) as tmp:
            tmp.write(b"write_test")
        writable = True
    except Exception:
        writable = False
    return {
        "status": "ok" if writable else "error",
        "data_exists": True,
        "data_writable": writable,
        "subdirectories": subdir_status,
    }


# ── /extract ──────────────────────────────────────────────────────────────────

@app.post("/extract", response_model=ExtractResponse, tags=["extraction"])
async def extract(req: ExtractRequest) -> ExtractResponse:
    """
    Full frame extraction pipeline:
      1. Download MP4 from Azure Blob
      2. For each screen_share_period: FFmpeg crop → PySceneDetect → frame capture
      3. imagehash phash deduplication
      4. Upload USEFUL frames to Azure Blob
      5. Return frame list + stats
    """
    try:
        result = await asyncio.to_thread(_run_extraction, req)
        return result
    except Exception as exc:
        logger.exception("Extraction failed for sop_id=%s", req.sop_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def _run_extraction(req: ExtractRequest) -> ExtractResponse:
    """Blocking implementation — runs in a thread pool via asyncio.to_thread."""
    with tempfile.TemporaryDirectory(prefix=f"sop_{req.sop_id}_") as tmp_str:
        tmp_dir = Path(tmp_str)
        video_path = tmp_dir / "original.mp4"

        # Step 1: Download video
        logger.info("Downloading video for sop_id=%s", req.sop_id)
        _download_file(req.video_url, video_path)
        logger.info("Download complete: %.1f MB", video_path.stat().st_size / 1_048_576)

        # Step 2–4: Extract frames across all screen-share periods
        periods_as_dicts = [
            {
                "start_time": p.start_time,
                "end_time": p.end_time,
                "crop": {"x": p.crop.x, "y": p.crop.y, "w": p.crop.w, "h": p.crop.h},
            }
            for p in req.screen_share_periods
        ]

        all_frames = extract_frames(
            video_path=video_path,
            screen_share_periods=periods_as_dicts,
            tmp_dir=tmp_dir,
            pyscenedetect_threshold=req.pyscenedetect_threshold,
            min_scene_len_sec=req.min_scene_len_sec,
            dedup_hash_threshold=req.dedup_hash_threshold,
            frame_offset_sec=req.frame_offset_sec,
        )

        raw_scenes = len(all_frames)
        useful_frames = [f for f in all_frames if f.classification == "USEFUL"]
        after_dedup = len(useful_frames)

        logger.info(
            "sop_id=%s  raw=%d  after_dedup=%d  periods=%d",
            req.sop_id, raw_scenes, after_dedup, len(req.screen_share_periods),
        )

        # Step 5: Upload USEFUL frames to Azure Blob
        frame_results: list[FrameResult] = []
        for frame in useful_frames:
            blob_path = f"{req.sop_id}/frames/frame_{frame.frame_num:03d}.png"
            azure_base_url = (
                f"https://{req.azure_account}.blob.core.windows.net"
                f"/{req.azure_container}/{blob_path}"
            )
            upload_url = f"{azure_base_url}?{req.azure_sas_token}"

            _upload_to_azure_blob(frame.local_path, upload_url)
            logger.info("Uploaded frame %d → %s", frame.frame_num, blob_path)

            frame_results.append(FrameResult(
                frame_num=frame.frame_num,
                timestamp_sec=frame.timestamp_sec,
                scene_score=frame.scene_score,
                classification=frame.classification,
                azure_url=azure_base_url,   # No SAS — safe for Supabase storage
                width=frame.width,
                height=frame.height,
            ))

        return ExtractResponse(
            sop_id=req.sop_id,
            frames=frame_results,
            stats=ExtractionStats(
                raw_scenes=raw_scenes,
                after_dedup=after_dedup,
                periods_processed=len(req.screen_share_periods),
            ),
        )


# ── Azure / HTTP helpers ──────────────────────────────────────────────────────

def _download_file(url: str, dest: Path) -> None:
    """Stream-download a file from url to dest. Raises on HTTP error."""
    with requests.get(url, stream=True, timeout=300) as resp:
        resp.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8 * 1024 * 1024):
                f.write(chunk)


def _upload_to_azure_blob(local_path: Path, sas_url: str) -> None:
    """
    PUT a file to Azure Blob Storage using a SAS URL.
    Raises requests.HTTPError on failure.
    """
    with open(local_path, "rb") as f:
        data = f.read()
    resp = requests.put(
        sas_url,
        data=data,
        headers={
            "x-ms-blob-type": "BlockBlob",
            "Content-Type": "image/png",
        },
        timeout=60,
    )
    resp.raise_for_status()
