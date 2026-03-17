"""
SOP Platform — Frame Extractor Service
Phase 1: health checks + tool availability + data volume diagnostics
Phase 4+: /extract, /clips, /render-mermaid endpoints
"""

import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI

app = FastAPI(
    title="SOP Frame Extractor",
    description="FFmpeg + PySceneDetect + Mermaid CLI microservice",
    version="0.1.0",
)

DATA_SUBDIRS = ["uploads", "frames", "exports", "templates"]


# ── Health ───────────────────────────────────────────────────

@app.get("/health", tags=["health"])
async def health() -> dict[str, Any]:
    """
    Liveness probe.
    Reports whether FFmpeg and Mermaid CLI (mmdc) are installed and on PATH.
    """
    return {
        "status": "ok",
        "service": "sop-extractor",
        "ffmpeg": shutil.which("ffmpeg") is not None,
        "mermaid_cli": shutil.which("mmdc") is not None,
    }


# ── Diagnostics ──────────────────────────────────────────────

@app.get("/test-ffmpeg", tags=["diagnostics"])
async def test_ffmpeg() -> dict[str, Any]:
    """Run ffmpeg -version and return the first line of output."""
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        first_line = result.stdout.split("\n")[0] if result.stdout else "(no output)"
        return {
            "status": "ok",
            "ffmpeg_version": first_line,
            "returncode": result.returncode,
        }
    except FileNotFoundError:
        return {"status": "error", "detail": "ffmpeg not found in PATH"}
    except subprocess.TimeoutExpired:
        return {"status": "error", "detail": "ffmpeg -version timed out"}


@app.get("/test-data-volume", tags=["diagnostics"])
async def test_data_volume() -> dict[str, Any]:
    """
    Verify /data volume is mounted, writable, and has all required subdirectories.
    Creates missing subdirs automatically (safe on first run with empty volume).
    """
    data_path = Path("/data")

    if not data_path.exists():
        return {
            "status": "error",
            "data_exists": False,
            "data_writable": False,
            "subdirectories": {sub: False for sub in DATA_SUBDIRS},
        }

    # Ensure all subdirs exist
    subdir_status: dict[str, bool] = {}
    for sub in DATA_SUBDIRS:
        subdir = data_path / sub
        subdir.mkdir(parents=True, exist_ok=True)
        subdir_status[sub] = subdir.exists()

    # Test write access via temp file
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
