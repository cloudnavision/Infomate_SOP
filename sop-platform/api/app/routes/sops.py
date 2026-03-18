from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import SOP, SOPStep, SOPStatus
from app.schemas import SOPListItem, SOPDetail

router = APIRouter(prefix="/api", tags=["sops"])


@router.get("/sops", response_model=list[SOPListItem])
async def list_sops(
    status: Optional[SOPStatus] = None,
    db: AsyncSession = Depends(get_db),
):
    """List all SOPs with optional status filter, ordered by newest first."""
    step_count_subq = (
        select(func.count(SOPStep.id))
        .where(SOPStep.sop_id == SOP.id)
        .correlate(SOP)
        .scalar_subquery()
    )

    stmt = select(SOP, step_count_subq.label("step_count")).order_by(SOP.created_at.desc())
    if status is not None:
        stmt = stmt.where(SOP.status == status)

    rows = (await db.execute(stmt)).all()
    return [
        SOPListItem(
            id=row[0].id,
            title=row[0].title,
            status=row[0].status,
            client_name=row[0].client_name,
            process_name=row[0].process_name,
            meeting_date=row[0].meeting_date,
            created_at=row[0].created_at,
            step_count=row[1] or 0,
        )
        for row in rows
    ]


@router.get("/sops/{sop_id}", response_model=SOPDetail)
async def get_sop(sop_id: UUID, db: AsyncSession = Depends(get_db)):
    """Retrieve a single SOP with all steps (+ callouts, clips, discussions), sections, and watchlist."""
    stmt = (
        select(SOP)
        .where(SOP.id == sop_id)
        .options(
            selectinload(SOP.steps).options(
                selectinload(SOPStep.callouts),
                selectinload(SOPStep.clips),
                selectinload(SOPStep.discussions),
            ),
            selectinload(SOP.sections),
            selectinload(SOP.watchlist),
        )
    )
    sop = (await db.execute(stmt)).scalar_one_or_none()
    if sop is None:
        raise HTTPException(status_code=404, detail=f"SOP {sop_id} not found")

    sop.steps.sort(key=lambda s: s.sequence)
    sop.sections.sort(key=lambda s: s.display_order)

    return SOPDetail.model_validate(sop)
