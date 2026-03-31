"""
SOP Platform — FastAPI Backend
Phase 1a: health checks + connectivity diagnostics
Phase 1b: CRUD routes — SOPs, steps, sections, transcript, watchlist
Phase 4+: pipeline endpoints, media signed URLs
Phase 5+: export generation, SSE progress stream

Infrastructure: Supabase (PostgreSQL via transaction pooler, port 6543)
"""

from typing import Any

import httpx
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text

from app.config import settings
from app.database import AsyncSessionLocal
from app.dependencies.pipeline_auth import require_internal_key
from app.routes import sops, steps, sections, auth, users

app = FastAPI(
    title="SOP Platform API",
    description="Backend for the SOP Automation Platform — Starboard Hotels",
    version="0.1.0",
)

# ── CORS ─────────────────────────────────────────────────────
# Allow all origins in development; tighten to specific origins in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Auth Routes (Phase 1.5a) ──────────────────────────────────
app.include_router(auth.router)

# ── CRUD Routes (Phase 1b) ────────────────────────────────────
app.include_router(sops.router)
app.include_router(steps.router)
app.include_router(sections.router)

# ── Admin Routes (Phase 1.5d) ─────────────────────────────────
app.include_router(users.router)


# ── Health ───────────────────────────────────────────────────

@app.get("/", tags=["health"])
async def root() -> dict[str, str]:
    return {"service": "sop-api", "status": "ok"}


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    """Docker healthcheck endpoint — direct container access."""
    return {"status": "ok", "service": "sop-api"}


@app.get("/api/health", tags=["health"])
async def api_health() -> dict[str, str]:
    """Health check under /api/ prefix — used by verify script and monitoring."""
    return {"status": "ok", "service": "sop-api"}


# ── Diagnostics ──────────────────────────────────────────────

@app.get("/api/test-db", tags=["diagnostics"], dependencies=[Depends(require_internal_key)])
async def test_db() -> dict[str, Any]:
    """
    Verify Supabase connectivity using the SQLAlchemy async session.
    Returns sop_count from the sops table — confirms schema is applied and
    the transaction pooler connection (port 6543) is working.
    """
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(text("SELECT COUNT(*) FROM sops"))
            count = result.scalar()
            return {"status": "ok", "sop_count": int(count)}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}


class _CropRegion(BaseModel):
    x: int
    y: int
    w: int
    h: int


class _ScreenSharePeriod(BaseModel):
    start_time: float
    end_time: float
    crop: _CropRegion


class _ExtractRequest(BaseModel):
    sop_id: str
    video_url: str
    screen_share_periods: list[_ScreenSharePeriod]
    azure_sas_token: str
    azure_account: str
    azure_container: str
    pyscenedetect_threshold: float = 3.0
    min_scene_len_sec: float = 2.0
    dedup_hash_threshold: int = 8
    frame_offset_sec: float = 1.5


@app.post("/api/extract", tags=["pipeline"], dependencies=[Depends(require_internal_key)])
async def proxy_extract(body: _ExtractRequest) -> Any:
    """
    Proxy POST /api/extract → sop-extractor:8001/extract
    n8n calls this endpoint externally via Cloudflare tunnel.
    The extractor container stays internal (never exposed publicly).
    Timeout: 600s — video extraction takes 3-10 minutes.
    """
    async with httpx.AsyncClient(timeout=600.0) as client:
        response = await client.post(
            "http://sop-extractor:8001/extract",
            json=body.model_dump(),
        )
        response.raise_for_status()
        return response.json()


@app.get("/api/test-extractor", tags=["diagnostics"], dependencies=[Depends(require_internal_key)])
async def test_extractor() -> dict[str, Any]:
    """
    Verify connectivity to the sop-extractor service.
    Proxies the /health call and returns its full JSON response.
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get("http://sop-extractor:8001/health")
            response.raise_for_status()
            return {"status": "ok", "extractor": response.json()}
    except httpx.TimeoutException:
        return {"status": "error", "detail": "extractor health check timed out after 5s"}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}
