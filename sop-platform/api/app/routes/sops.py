from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies.auth import require_viewer
from app.models import SOP, SOPStep, SOPStatus, PipelineRun, User, UserRole
from app.schemas import SOPListItem, SOPDetail

router = APIRouter(prefix="/api", tags=["sops"])

# Statuses visible per role
_VISIBLE_STATUSES: dict[str, list[SOPStatus]] = {
    UserRole.viewer.value: [SOPStatus.published],
    UserRole.editor.value: [SOPStatus.published, SOPStatus.draft, SOPStatus.in_review],
    UserRole.admin.value:  [],  # empty = no filter (all statuses)
}


@router.get("/sops", response_model=list[SOPListItem])
async def list_sops(
    current_user: Annotated[User, Depends(require_viewer)],
    status: Optional[SOPStatus] = None,
    db: AsyncSession = Depends(get_db),
):
    """List SOPs. Visibility is filtered by role: viewers see published only, editors see draft/in_review too, admins see all."""
    step_count_subq = (
        select(func.count(SOPStep.id))
        .where(SOPStep.sop_id == SOP.id)
        .correlate(SOP)
        .scalar_subquery()
    )
    latest_run_status_subq = (
        select(PipelineRun.status)
        .where(PipelineRun.sop_id == SOP.id)
        .order_by(PipelineRun.started_at.desc())
        .limit(1)
        .correlate(SOP)
        .scalar_subquery()
    )
    latest_run_stage_subq = (
        select(PipelineRun.current_stage)
        .where(PipelineRun.sop_id == SOP.id)
        .order_by(PipelineRun.started_at.desc())
        .limit(1)
        .correlate(SOP)
        .scalar_subquery()
    )

    stmt = select(
        SOP,
        step_count_subq.label("step_count"),
        latest_run_status_subq.label("pipeline_status"),
        latest_run_stage_subq.label("pipeline_stage"),
    ).order_by(SOP.created_at.desc())

    # Role-based visibility filter (applied before any explicit status query param)
    allowed = _VISIBLE_STATUSES.get(current_user.role.value, [])
    if allowed:  # admin has empty list → no filter
        stmt = stmt.where(SOP.status.in_(allowed))

    # Optional caller-supplied status filter (intersects with role visibility)
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
            pipeline_status=str(row[2].value) if row[2] is not None else None,
            pipeline_stage=row[3],
        )
        for row in rows
    ]


@router.get("/sops/{sop_id}", response_model=SOPDetail)
async def get_sop(
    sop_id: UUID,
    current_user: Annotated[User, Depends(require_viewer)],
    db: AsyncSession = Depends(get_db),
):
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
