"""
User management routes — Phase 1.5d
Admin-only CRUD for platform users.

GET    /api/users           — list all users
POST   /api/users           — add a new user
PATCH  /api/users/{user_id} — update name / role
DELETE /api/users/{user_id} — remove user access
"""

import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import require_admin
from app.models import User, UserRole
from app.schemas import UserCreate, UserUpdate, UserResponse

router = APIRouter(prefix="/api", tags=["users"])


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    current_user: Annotated[User, Depends(require_admin)],
    role: Optional[UserRole] = None,
    db: AsyncSession = Depends(get_db),
):
    """List all platform users, ordered by newest first. Optional ?role filter."""
    stmt = select(User).order_by(User.created_at.desc())
    if role is not None:
        stmt = stmt.where(User.role == role)
    users = (await db.execute(stmt)).scalars().all()
    return [UserResponse.model_validate(u) for u in users]


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    current_user: Annotated[User, Depends(require_admin)],
    db: AsyncSession = Depends(get_db),
):
    """Add a new user. Returns 409 if the email already exists."""
    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    user = User(
        id=uuid.uuid4(),
        email=body.email,
        name=body.name,
        role=body.role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    current_user: Annotated[User, Depends(require_admin)],
    db: AsyncSession = Depends(get_db),
):
    """Update a user's name or role. Admins cannot change their own role."""
    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == current_user.id and body.role is not None and body.role != current_user.role:
        raise HTTPException(
            status_code=403,
            detail="You cannot change your own role",
        )

    if body.name is not None:
        user.name = body.name
    if body.role is not None:
        user.role = body.role

    user.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    current_user: Annotated[User, Depends(require_admin)],
    db: AsyncSession = Depends(get_db),
):
    """Remove a user from the platform. Admins cannot delete themselves."""
    if user_id == current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You cannot remove your own account",
        )

    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    await db.delete(user)
    await db.commit()
