"""
Pipeline auth dependency — Phase 3+

Validates the x-internal-key header on pipeline endpoints called by n8n.
This is separate from user JWT auth — n8n is a service, not a user.

Usage:
    @app.post("/api/extract", dependencies=[Depends(require_internal_key)])
"""

import logging
from typing import Annotated

from fastapi import Header, HTTPException

from app.config import settings

logger = logging.getLogger(__name__)


async def require_internal_key(
    x_internal_key: Annotated[str | None, Header()] = None,
) -> None:
    """
    Validates x-internal-key header against INTERNAL_API_KEY env var.
    Raises 401 on missing/invalid key.
    Raises 500 if INTERNAL_API_KEY is not configured (misconfiguration guard).
    """
    if not settings.internal_api_key:
        logger.error("[PIPELINE_AUTH] INTERNAL_API_KEY is not configured — rejecting all pipeline requests")
        raise HTTPException(
            status_code=500,
            detail="Server misconfiguration: INTERNAL_API_KEY not set",
        )
    if x_internal_key != settings.internal_api_key:
        logger.warning("[PIPELINE_AUTH] Invalid or missing x-internal-key header")
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing x-internal-key header",
        )
