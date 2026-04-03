"""
Auth dependencies — Phase 1.5c

get_current_user   — validates JWT via Supabase JWKS (ES256), returns User ORM instance
require_role(role) — factory that wraps get_current_user with a role-level check
require_viewer     — any registered user (viewer / editor / admin)
require_editor     — editor or admin
require_admin      — admin only
"""

import logging
import time
from typing import Annotated

import jwt
from jwt import PyJWKClient
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import User, UserRole

logger = logging.getLogger(__name__)

# ── JWKS client — cached with 1-hour TTL ──────────────────────────────────────
_JWKS_URL = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
_jwks_client: PyJWKClient | None = None
_jwks_client_created_at: float = 0.0
_JWKS_TTL_SECONDS = 3600


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client, _jwks_client_created_at
    now = time.monotonic()
    if _jwks_client is None or (now - _jwks_client_created_at) > _JWKS_TTL_SECONDS:
        logger.info("[AUTH] (Re)creating JWKS client for %s", _JWKS_URL)
        _jwks_client = PyJWKClient(_JWKS_URL, cache_keys=True)
        _jwks_client_created_at = now
    return _jwks_client


# ── Role hierarchy ─────────────────────────────────────────────────────────────
_ROLE_RANK: dict[str, int] = {
    UserRole.viewer.value: 1,
    UserRole.editor.value: 2,
    UserRole.admin.value:  3,
}


def _decode_jwt(token: str) -> dict:
    """Verify an ES256 JWT against Supabase's JWKS endpoint. Returns the payload."""
    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        payload: dict = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            options={"verify_aud": False},
            leeway=60,
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")
    except Exception as exc:
        logger.warning("[AUTH] JWT verification error: %s: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=401, detail="Token verification failed")


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,  # type: ignore[assignment]
) -> User:
    """
    FastAPI dependency — validates the Bearer JWT and returns the User ORM instance.

    Raises:
        401 — missing / invalid / expired token
        403 — valid token but email not registered in users table
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization.split(" ", 1)[1]
    payload = _decode_jwt(token)

    email: str | None = payload.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Token missing email claim")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=403,
            detail="Access denied — user not registered",
        )

    return user


def require_role(minimum_role: str):
    """
    Dependency factory — wraps get_current_user with a role-level check.

    Usage:
        current_user: User = Depends(require_role("editor"))
        current_user: User = Depends(require_viewer)   # convenience shorthand
    """
    async def dependency(
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        user_rank = _ROLE_RANK.get(current_user.role.value, 0)
        required_rank = _ROLE_RANK.get(minimum_role, 0)
        if user_rank < required_rank:
            raise HTTPException(
                status_code=403,
                detail=f"Insufficient permissions — {minimum_role} role required",
            )
        return current_user

    return dependency


# ── Convenience dependencies ───────────────────────────────────────────────────
require_viewer = require_role("viewer")   # any registered user
require_editor = require_role("editor")   # editor or admin
require_admin  = require_role("admin")    # admin only
