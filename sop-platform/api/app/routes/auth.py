"""
Auth routes — Phase 1.5a
GET /api/auth/me — validate Supabase JWT, look up user email in users table.
"""

from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


async def _require_email(authorization: Annotated[str | None, Header()] = None) -> str:
    """Dependency: validate Bearer JWT and return the email claim."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization.split(" ", 1)[1]
    try:
        payload: dict = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},  # Supabase JWTs may omit aud
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")

    email: str | None = payload.get("email")
    if not email:
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
