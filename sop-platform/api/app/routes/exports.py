"""
Phase 7a: SOP Export endpoint
POST /api/sops/{sop_id}/export?format=docx|pdf
"""
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.dependencies.auth import require_viewer
from app.models import SOP, SOPStep, ExportHistory, User
from app.schemas import SOPDetail, ExportResponse, with_sas

router = APIRouter(prefix="/api", tags=["exports"])


@router.post("/sops/{sop_id}/export", response_model=ExportResponse)
async def export_sop(
    sop_id: UUID,
    current_user: Annotated[User, Depends(require_viewer)],
    fmt: str = Query("docx", alias="format", pattern="^(docx|pdf)$"),
    db: AsyncSession = Depends(get_db),
) -> ExportResponse:
    """
    Trigger DOCX or PDF export for a SOP.
    - Fetches full SOP from Supabase
    - Sends render payload to sop-extractor /api/render-doc
    - Saves record to export_history
    - Returns download URL (Azure Blob URL with SAS)
    """
    # 1. Fetch SOP
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

    # 2. Serialize — this appends SAS tokens to screenshot/video URLs
    sop_detail = SOPDetail.model_validate(sop)

    # 3. Build render payload
    sop_data = {
        "sop_title": sop_detail.title,
        "client_name": sop_detail.client_name or "",
        "process_name": sop_detail.process_name or "",
        "meeting_date": str(sop_detail.meeting_date) if sop_detail.meeting_date else "",
        "step_count": len(sop_detail.steps),
        "steps": [
            {
                "id": str(step.id),
                "sequence": step.sequence,
                "title": step.title,
                "description": step.description or "",
                "sub_steps": step.sub_steps or [],
                "annotated_screenshot_url": step.annotated_screenshot_url,
                "screenshot_url": step.screenshot_url,
                "callouts": [
                    {"callout_number": c.callout_number, "label": c.label}
                    for c in step.callouts
                ],
            }
            for step in sop_detail.steps
        ],
        "sections": [
            {
                "section_title": sec.section_title,
                "content_text": sec.content_text or "",
                "display_order": sec.display_order,
            }
            for sec in sop_detail.sections
        ],
    }

    render_payload = {
        "sop_id": str(sop_id),
        "format": fmt,
        "azure_blob_base_url": settings.azure_blob_base_url,
        "azure_sas_token": settings.azure_blob_sas_token,
        "sop_data": sop_data,
    }

    # 4. Call extractor
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{settings.extractor_url}/api/render-doc",
                json=render_payload,
            )
            resp.raise_for_status()
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=503, detail="Export timed out — extractor took too long") from exc
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:300] if exc.response else str(exc)
        raise HTTPException(status_code=503, detail=f"Extractor error: {detail}") from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Extractor unavailable: {exc}") from exc

    render_result = resp.json()
    file_url_base = render_result["pdf_url"] if fmt == "pdf" else render_result["docx_url"]
    if not file_url_base:
        raise HTTPException(status_code=500, detail="Extractor returned no file URL")

    # 5. Save to export_history
    export_record = ExportHistory(
        sop_id=sop_id,
        format=fmt,
        file_url=file_url_base,
        generated_by=current_user.id,
        sop_version=None,
    )
    db.add(export_record)
    await db.commit()

    # 6. Return download URL with SAS appended
    download_url = with_sas(file_url_base) or file_url_base
    filename = f"sop_{sop_id}.{fmt}"

    return ExportResponse(download_url=download_url, filename=filename, format=fmt)
