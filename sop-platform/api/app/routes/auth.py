"""
Auth routes — Phase 1.5a/1.5c
GET /api/auth/me — returns the current user's record from the users table.

JWT validation is handled by the shared get_current_user dependency
in app/dependencies/auth.py (ES256 via Supabase JWKS).
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/me")
async def get_me(
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    """
    Return the authenticated user's record from the users table.
    401 if the JWT is missing/invalid/expired.
    403 if the email is not in the users table.
    """
    logger.info("[AUTH] /me → %s (%s)", current_user.email, current_user.role.value)
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role.value,
        "created_at": current_user.created_at.isoformat(),
    }
