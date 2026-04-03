from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies.auth import require_viewer, require_editor
from app.models import SOP, SOPStep, StepCallout, User
from app.schemas import StepSchema, CalloutPatchItem, CalloutSchema, RenderAnnotatedResponse
from app.config import settings

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


@router.patch("/steps/{step_id}/callouts", response_model=list[CalloutSchema])
async def patch_callouts(
    step_id: UUID,
    items: list[CalloutPatchItem],
    current_user: Annotated[User, Depends(require_editor)],
    db: AsyncSession = Depends(get_db),
):
    """Bulk-update callout positions. Sets original_x/y on first reposition."""
    for item in items:
        stmt = select(StepCallout).where(
            StepCallout.id == item.id,
            StepCallout.step_id == step_id,
        )
        callout = (await db.execute(stmt)).scalar_one_or_none()
        if callout is None:
            raise HTTPException(status_code=404, detail=f"Callout {item.id} not found")

        # Preserve original position on first reposition
        if item.was_repositioned and not callout.was_repositioned:
            callout.original_x = callout.target_x
            callout.original_y = callout.target_y

        callout.target_x = item.target_x
        callout.target_y = item.target_y
        callout.was_repositioned = item.was_repositioned

    await db.commit()

    # Return updated callouts
    stmt = (
        select(StepCallout)
        .where(StepCallout.step_id == step_id)
        .order_by(StepCallout.callout_number)
    )
    callouts = (await db.execute(stmt)).scalars().all()
    return [CalloutSchema.model_validate(c) for c in callouts]


@router.post("/steps/{step_id}/render-annotated", response_model=RenderAnnotatedResponse)
async def render_annotated(
    step_id: UUID,
    current_user: Annotated[User, Depends(require_editor)],
    db: AsyncSession = Depends(get_db),
):
    """Proxy to sop-extractor: re-render annotated screenshot PNG after callout edits."""
    import httpx

    stmt = (
        select(SOPStep)
        .where(SOPStep.id == step_id)
        .options(selectinload(SOPStep.callouts))
    )
    step = (await db.execute(stmt)).scalar_one_or_none()
    if step is None:
        raise HTTPException(status_code=404, detail=f"Step {step_id} not found")

    screenshot_url = step.screenshot_url
    if not screenshot_url:
        raise HTTPException(status_code=422, detail="Step has no screenshot_url to annotate")

    # Build SAS URL for extractor to download the screenshot
    sas_screenshot_url = (
        f"{screenshot_url}?{settings.azure_blob_sas_token}"
        if settings.azure_blob_sas_token and "?" not in screenshot_url
        else screenshot_url
    )

    payload = {
        "step_id": str(step_id),
        "screenshot_url": sas_screenshot_url,
        "callouts": [
            {"number": c.callout_number, "target_x": c.target_x, "target_y": c.target_y}
            for c in sorted(step.callouts, key=lambda c: c.callout_number)
        ],
        "azure_blob_base_url": settings.azure_blob_base_url,
        "azure_sas_token": settings.azure_blob_sas_token,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post("http://sop-extractor:8001/api/render-annotated", json=payload)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Extractor error: {resp.text}")

    result = resp.json()
    annotated_url = result["annotated_screenshot_url"]

    # Persist the new URL (base URL, no SAS)
    step.annotated_screenshot_url = annotated_url
    await db.commit()

    return RenderAnnotatedResponse(annotated_screenshot_url=annotated_url)
