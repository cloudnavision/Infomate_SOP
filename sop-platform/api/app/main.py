"""
SOP Platform — FastAPI Backend
Phase 1: health checks + connectivity diagnostics
Phase 2+: full CRUD, export generation, SSE pipeline progress
"""

import os
import re
from typing import Any

import asyncpg
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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


# ── Health ───────────────────────────────────────────────────

@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    """Docker healthcheck endpoint — direct container access."""
    return {"status": "ok", "service": "sop-api"}


@app.get("/api/health", tags=["health"])
async def api_health() -> dict[str, str]:
    """Same as /health but under /api/ prefix that nginx proxies."""
    return {"status": "ok", "service": "sop-api"}


# ── Diagnostics ──────────────────────────────────────────────

@app.get("/api/test-db", tags=["diagnostics"])
async def test_db() -> dict[str, Any]:
    """
    Verify PostgreSQL connectivity and confirm schema was applied.
    Counts tables in the public schema — expect 10+ after migrations run.
    """
    database_url = os.getenv("DATABASE_URL", "")
    if not database_url:
        return {"status": "error", "detail": "DATABASE_URL env var not set"}

    # SQLAlchemy dialect prefix (+asyncpg) must be stripped for asyncpg.connect()
    raw_url = re.sub(r"\+asyncpg", "", database_url)

    try:
        conn = await asyncpg.connect(raw_url)
        try:
            count = await conn.fetchval(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'"
            )
            return {"status": "ok", "tables_found": int(count)}
        finally:
            await conn.close()
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
