from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import require_viewer
from app.models import SOP, SOPSection, TranscriptLine, PropertyWatchlist, User
from app.schemas import SectionSchema, TranscriptLineSchema, WatchlistSchema

router = APIRouter(prefix="/api", tags=["sections"])


@router.get("/sops/{sop_id}/sections", response_model=list[SectionSchema])
async def list_sections(
    sop_id: UUID,
    current_user: Annotated[User, Depends(require_viewer)],
    db: AsyncSession = Depends(get_db),
):
    """All sections for a SOP, ordered by display_order."""
    sop_exists = await db.scalar(select(SOP.id).where(SOP.id == sop_id))
    if sop_exists is None:
        raise HTTPException(status_code=404, detail=f"SOP {sop_id} not found")

    stmt = (
        select(SOPSection)
        .where(SOPSection.sop_id == sop_id)
        .order_by(SOPSection.display_order)
    )
    sections = (await db.execute(stmt)).scalars().all()
    return [SectionSchema.model_validate(s) for s in sections]


@router.get("/sops/{sop_id}/transcript", response_model=list[TranscriptLineSchema])
async def list_transcript(
    sop_id: UUID,
    current_user: Annotated[User, Depends(require_viewer)],
    speaker: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Transcript lines for a SOP, optionally filtered by speaker name."""
    sop_exists = await db.scalar(select(SOP.id).where(SOP.id == sop_id))
    if sop_exists is None:
        raise HTTPException(status_code=404, detail=f"SOP {sop_id} not found")

    stmt = (
        select(TranscriptLine)
        .where(TranscriptLine.sop_id == sop_id)
        .order_by(TranscriptLine.sequence)
    )
    if speaker:
        stmt = stmt.where(TranscriptLine.speaker == speaker)

    lines = (await db.execute(stmt)).scalars().all()
    return [TranscriptLineSchema.model_validate(line) for line in lines]


@router.get("/sops/{sop_id}/watchlist", response_model=list[WatchlistSchema])
async def list_watchlist(
    sop_id: UUID,
    current_user: Annotated[User, Depends(require_viewer)],
    db: AsyncSession = Depends(get_db),
):
    """Property watchlist entries for a SOP."""
    sop_exists = await db.scalar(select(SOP.id).where(SOP.id == sop_id))
    if sop_exists is None:
        raise HTTPException(status_code=404, detail=f"SOP {sop_id} not found")

    stmt = select(PropertyWatchlist).where(PropertyWatchlist.sop_id == sop_id)
    items = (await db.execute(stmt)).scalars().all()
    return [WatchlistSchema.model_validate(item) for item in items]
