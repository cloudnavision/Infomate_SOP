"""
Auth routes — Phase 1.5a
GET /api/auth/me — validate Supabase JWT (ES256 via JWKS), look up user email in users table.

Supabase tokens are signed with ES256 (ECC P-256).
Public keys are fetched from the Supabase JWKS endpoint and cached for 1 hour.
"""

import logging
import time
from typing import Annotated

import jwt
from jwt import PyJWKClient
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

# ── JWKS client (cached — PyJWKClient handles key caching internally) ──────────
_JWKS_URL = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
_jwks_client: PyJWKClient | None = None
_jwks_client_created_at: float = 0.0
_JWKS_TTL_SECONDS = 3600  # re-create client (refresh keys) every hour


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client, _jwks_client_created_at
    now = time.monotonic()
    if _jwks_client is None or (now - _jwks_client_created_at) > _JWKS_TTL_SECONDS:
        logger.info("[AUTH] Creating JWKS client for %s", _JWKS_URL)
        _jwks_client = PyJWKClient(_JWKS_URL, cache_keys=True)
        _jwks_client_created_at = now
    return _jwks_client


async def _require_email(authorization: Annotated[str | None, Header()] = None) -> str:
    """Dependency: validate ES256 Bearer JWT via Supabase JWKS and return the email claim."""
    logger.warning("[AUTH DEBUG] Authorization header present: %s", bool(authorization))

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization.split(" ", 1)[1]
    logger.warning("[AUTH DEBUG] Token prefix (chars 0-20): %s", token[:20])

    try:
        # Decode header to inspect kid and alg before verification
        unverified_header = jwt.get_unverified_header(token)
        logger.warning("[AUTH DEBUG] Token header: %s", unverified_header)

        # Fetch matching public key from JWKS by kid
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)

        payload: dict = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            options={"verify_aud": False},
            leeway=60,  # allow 60s clock skew
        )
        logger.warning("[AUTH DEBUG] JWT decode OK | email: %s | sub: %s",
                       payload.get("email"), payload.get("sub"))

    except jwt.ExpiredSignatureError as exc:
        logger.warning("[AUTH DEBUG] JWT decode FAILED — ExpiredSignatureError: %s", exc)
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError as exc:
        logger.warning("[AUTH DEBUG] JWT decode FAILED — InvalidTokenError: %s", exc)
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")
    except Exception as exc:
        logger.warning("[AUTH DEBUG] JWT decode FAILED — unexpected error: %s: %s",
                       type(exc).__name__, exc)
        raise HTTPException(status_code=401, detail=f"Token verification failed: {exc}")

    email: str | None = payload.get("email")
    if not email:
        logger.warning("[AUTH DEBUG] No email claim in payload. Keys present: %s", list(payload.keys()))
        raise HTTPException(status_code=401, detail="Token missing email claim")

    return email


@router.get("/me")
async def get_me(
    email: Annotated[str, Depends(_require_email)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Return the authenticated user's record from the users table.
    Returns 403 if the email is not in the users table (authenticated with Azure
    but not provisioned in the app — contact administrator).
    """
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=403,
            detail="Access denied — contact your administrator",
        )

    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "role": user.role.value,
        "created_at": user.created_at.isoformat(),
    }
