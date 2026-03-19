from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies.auth import require_viewer
from app.models import SOP, SOPStep, User
from app.schemas import StepSchema

router = APIRouter(prefix="/api", tags=["steps"])


@router.get("/sops/{sop_id}/steps", response_model=list[StepSchema])
async def list_steps(
    sop_id: UUID,
    current_user: Annotated[User, Depends(require_viewer)],
    db: AsyncSession = Depends(get_db),
):
    """All steps for a SOP, ordered by sequence."""
    sop_exists = await db.scalar(select(SOP.id).where(SOP.id == sop_id))
    if sop_exists is None:
        raise HTTPException(status_code=404, detail=f"SOP {sop_id} not found")

    stmt = (
        select(SOPStep)
        .where(SOPStep.sop_id == sop_id)
        .options(
            selectinload(SOPStep.callouts),
            selectinload(SOPStep.clips),
            selectinload(SOPStep.discussions),
        )
        .order_by(SOPStep.sequence)
    )
    steps = (await db.execute(stmt)).scalars().all()
    return [StepSchema.model_validate(step) for step in steps]


@router.get("/sops/{sop_id}/steps/{step_id}", response_model=StepSchema)
async def get_step(
    sop_id: UUID,
    step_id: UUID,
    current_user: Annotated[User, Depends(require_viewer)],
    db: AsyncSession = Depends(get_db),
):
    """Single step with callouts, clips, and discussions."""
    stmt = (
        select(SOPStep)
        .where(SOPStep.id == step_id, SOPStep.sop_id == sop_id)
        .options(
            selectinload(SOPStep.callouts),
            selectinload(SOPStep.clips),
            selectinload(SOPStep.discussions),
        )
    )
    step = (await db.execute(stmt)).scalar_one_or_none()
    if step is None:
        raise HTTPException(
            status_code=404, detail=f"Step {step_id} not found in SOP {sop_id}"
        )
    return StepSchema.model_validate(step)
