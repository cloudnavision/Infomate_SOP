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
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.database import AsyncSessionLocal
from app.routes import sops, steps, sections, auth

app = FastAPI(
    title="SOP Platform API",
    description="Backend for the SOP Automation Platform — Starboard Hotels",
    version="0.1.0",
)

# ── CORS ─────────────────────────────────────────────────────
# Allow all origins in development; tighten to specific origins in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


# ── Health ───────────────────────────────────────────────────

@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    """Docker healthcheck endpoint — direct container access."""
    return {"status": "ok", "service": "sop-api"}


@app.get("/api/health", tags=["health"])
async def api_health() -> dict[str, str]:
    """Health check under /api/ prefix — used by verify script and monitoring."""
    return {"status": "ok", "service": "sop-api"}


# ── Diagnostics ──────────────────────────────────────────────

@app.get("/api/test-db", tags=["diagnostics"])
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


@app.get("/api/test-extractor", tags=["diagnostics"])
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
