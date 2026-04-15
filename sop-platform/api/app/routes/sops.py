from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies.auth import require_viewer, require_editor
from app.models import SOP, SOPStep, SOPStatus, PipelineRun, User, UserRole, SOPLike, ExportHistory
from datetime import datetime, timezone
from app.schemas import SOPListItem, SOPDetail, SOPMetrics, LikeResponse, ExportHistoryItem, ActivityEvent

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


@router.post("/sops/{sop_id}/view", status_code=204)
async def track_view(
    sop_id: UUID,
    current_user: Annotated[User, Depends(require_viewer)],
    db: AsyncSession = Depends(get_db),
):
    """Increment view count each time the SOP procedure page is opened."""
    sop = (await db.execute(select(SOP).where(SOP.id == sop_id))).scalar_one_or_none()
    if sop is None:
        raise HTTPException(status_code=404, detail=f"SOP {sop_id} not found")
    sop.view_count = (sop.view_count or 0) + 1
    await db.commit()


@router.post("/sops/{sop_id}/like", response_model=LikeResponse)
async def toggle_like(
    sop_id: UUID,
    current_user: Annotated[User, Depends(require_viewer)],
    db: AsyncSession = Depends(get_db),
):
    """Toggle like for the current user. Returns new liked state and total like count."""
    sop = (await db.execute(select(SOP).where(SOP.id == sop_id))).scalar_one_or_none()
    if sop is None:
        raise HTTPException(status_code=404, detail=f"SOP {sop_id} not found")

    existing = (await db.execute(
        select(SOPLike).where(SOPLike.sop_id == sop_id, SOPLike.user_id == current_user.id)
    )).scalar_one_or_none()

    if existing:
        await db.execute(
            delete(SOPLike).where(SOPLike.sop_id == sop_id, SOPLike.user_id == current_user.id)
        )
        liked = False
    else:
        db.add(SOPLike(sop_id=sop_id, user_id=current_user.id))
        liked = True

    await db.commit()

    like_count = (await db.execute(
        select(func.count()).where(SOPLike.sop_id == sop_id)
    )).scalar_one()

    return LikeResponse(liked=liked, like_count=like_count)


@router.get("/sops/{sop_id}/metrics", response_model=SOPMetrics)
async def get_metrics(
    sop_id: UUID,
    current_user: Annotated[User, Depends(require_viewer)],
    db: AsyncSession = Depends(get_db),
):
    """Return engagement metrics and export history for a SOP."""
    sop = (await db.execute(select(SOP).where(SOP.id == sop_id))).scalar_one_or_none()
    if sop is None:
        raise HTTPException(status_code=404, detail=f"SOP {sop_id} not found")

    like_count = (await db.execute(
        select(func.count()).where(SOPLike.sop_id == sop_id)
    )).scalar_one()

    user_liked_row = (await db.execute(
        select(SOPLike).where(SOPLike.sop_id == sop_id, SOPLike.user_id == current_user.id)
    )).scalar_one_or_none()

    step_count = (await db.execute(
        select(func.count(SOPStep.id)).where(SOPStep.sop_id == sop_id)
    )).scalar_one()

    approved_count = (await db.execute(
        select(func.count(SOPStep.id)).where(SOPStep.sop_id == sop_id, SOPStep.is_approved == True)
    )).scalar_one()

    export_count = (await db.execute(
        select(func.count(ExportHistory.id)).where(ExportHistory.sop_id == sop_id)
    )).scalar_one()

    recent_exports = (await db.execute(
        select(ExportHistory)
        .where(ExportHistory.sop_id == sop_id)
        .order_by(ExportHistory.created_at.desc())
        .limit(10)
    )).scalars().all()

    return SOPMetrics(
        view_count=sop.view_count or 0,
        like_count=like_count,
        user_liked=user_liked_row is not None,
        step_count=step_count,
        approved_step_count=approved_count,
        export_count=export_count,
        recent_exports=[ExportHistoryItem.model_validate(e) for e in recent_exports],
    )


@router.get("/sops/{sop_id}/history", response_model=list[ActivityEvent])
async def get_history(
    sop_id: UUID,
    current_user: Annotated[User, Depends(require_viewer)],
    db: AsyncSession = Depends(get_db),
):
    """Activity log for a SOP — created, pipeline runs, approvals, exports."""
    sop = (await db.execute(select(SOP).where(SOP.id == sop_id))).scalar_one_or_none()
    if sop is None:
        raise HTTPException(status_code=404, detail=f"SOP {sop_id} not found")

    events: list[ActivityEvent] = []

    # SOP created
    events.append(ActivityEvent(
        event_type="created",
        label="SOP created",
        detail=sop.title,
        timestamp=sop.created_at,
    ))

    # Pipeline runs
    runs = (await db.execute(
        select(PipelineRun).where(PipelineRun.sop_id == sop_id).order_by(PipelineRun.started_at)
    )).scalars().all()
    for run in runs:
        events.append(ActivityEvent(
            event_type="pipeline",
            label=f"Pipeline {run.status.value}",
            detail=run.current_stage,
            timestamp=run.completed_at or run.started_at,
        ))

    # Steps approved
    approved_steps = (await db.execute(
        select(SOPStep)
        .where(SOPStep.sop_id == sop_id, SOPStep.is_approved == True, SOPStep.reviewed_at.isnot(None))
        .order_by(SOPStep.reviewed_at)
    )).scalars().all()
    for step in approved_steps:
        events.append(ActivityEvent(
            event_type="approved",
            label=f"Step {step.sequence} approved",
            detail=step.title,
            timestamp=step.reviewed_at,
        ))

    # Exports
    exports = (await db.execute(
        select(ExportHistory).where(ExportHistory.sop_id == sop_id).order_by(ExportHistory.created_at)
    )).scalars().all()
    for exp in exports:
        events.append(ActivityEvent(
            event_type="export",
            label=f"{exp.format.upper()} exported",
            detail=f"{round(exp.file_size_bytes / 1024)} KB" if exp.file_size_bytes else None,
            timestamp=exp.created_at,
        ))

    events.sort(key=lambda e: e.timestamp, reverse=True)
    return events


@router.delete("/sops/{sop_id}", status_code=204)
async def delete_sop(
    sop_id: UUID,
    current_user: Annotated[User, Depends(require_editor)],
    db: AsyncSession = Depends(get_db),
):
    """Delete a SOP and all related data (cascades). Editor/Admin only."""
    sop = (await db.execute(select(SOP).where(SOP.id == sop_id))).scalar_one_or_none()
    if sop is None:
        raise HTTPException(status_code=404, detail=f"SOP {sop_id} not found")
    await db.delete(sop)
    await db.commit()
