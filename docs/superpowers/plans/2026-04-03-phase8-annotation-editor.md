# Phase 8 — Annotation Editor Implementation Plan

**Date:** 2026-04-03
**Spec:** `docs/superpowers/specs/2026-04-03-phase8-annotation-editor-design.md`
**Stack:** React + Konva.js + FastAPI + sop-extractor (Pillow)

---

## File Map

| File | Action |
|------|--------|
| `sop-platform/frontend/package.json` | Edit — add `konva` + `react-konva` dependencies |
| `sop-platform/frontend/src/api/types.ts` | Edit — add `CalloutPatchItem` interface |
| `sop-platform/frontend/src/api/client.ts` | Edit — add `patchCallouts()`, `renderAnnotated()` |
| `sop-platform/frontend/src/components/AnnotationEditorModal.tsx` | Create — Konva modal editor |
| `sop-platform/frontend/src/components/StepCard.tsx` | Edit — add Edit Callouts button + modal |
| `sop-platform/api/app/schemas.py` | Edit — add `CalloutPatchItem`, `RenderAnnotatedResponse` |
| `sop-platform/api/app/routes/steps.py` | Edit — add PATCH callouts + POST render-annotated |
| `sop-platform/extractor/app/annotator.py` | Create — Pillow circle-drawing + Azure upload |
| `sop-platform/extractor/app/main.py` | Edit — add `RenderAnnotatedRequest/Response` + endpoint |

---

## Task 1 — Install Konva.js

**File:** `sop-platform/frontend/`

```bash
cd "d:\CloudNavision\1. Projects\SOP\SOP Automation System\sop-platform\frontend"
npm install konva react-konva
```

**Expected output:**
```
added 2 packages ...
```

Verify: `package.json` now lists `"konva"` and `"react-konva"` under `dependencies`.

> ⛔ **STOP — run `npm run build` and confirm it passes before proceeding to Task 7 or 8. Konva must be installed first.**

**Commit:** `chore: add konva + react-konva for annotation canvas`

---

## Task 2 — Add schemas to schemas.py

**File:** `sop-platform/api/app/schemas.py`

Insert between the closing `}` of `ExportResponse` and the `with_sas = _with_sas` line at the end of the file (use textual anchor, not line number):

```python
class CalloutPatchItem(BaseModel):
    id: uuid.UUID
    target_x: int   # 0–100 integer percentage
    target_y: int   # 0–100 integer percentage
    was_repositioned: bool


class RenderAnnotatedResponse(BaseModel):
    annotated_screenshot_url: str  # Azure base URL (no SAS)
```

**Verify:** `docker compose exec sop-api python -c "from app.schemas import CalloutPatchItem, RenderAnnotatedResponse; print('ok')"` → prints `ok`.

**Commit:** `feat(api): add CalloutPatchItem + RenderAnnotatedResponse schemas`

---

## Task 3 — Add PATCH callouts endpoint to steps.py

**File:** `sop-platform/api/app/routes/steps.py`

**Step 3a — Update imports** (lines 1–12). Replace:

```python
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
```

With:

```python
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
```

**Step 3b — Add PATCH endpoint** — append to end of file (after the closing of `get_step`):

```python
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
```

**Step 3c — Add POST render-annotated endpoint** (add after the PATCH endpoint):

```python
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
```

**Verify:** `docker compose exec sop-api python -c "from app.routes.steps import router; print('ok')"` → prints `ok`.

**Commit:** `feat(api): add PATCH /steps/{id}/callouts + POST /steps/{id}/render-annotated`

---

## Task 4 — Check config has azure_blob_base_url

**File:** `sop-platform/api/app/config.py`

Read the file and confirm `azure_blob_base_url` and `azure_blob_sas_token` exist as settings fields. If `azure_blob_base_url` is missing, add it (following the existing pattern for `azure_blob_sas_token`).

Check `.env` to confirm `AZURE_BLOB_BASE_URL` is set (e.g. `https://cnavinfsop.blob.core.windows.net/infsop`).

**No commit needed** if already present — verification only.

---

## Task 5 — Create extractor/app/annotator.py

**File:** `sop-platform/extractor/app/annotator.py` (new file)

```python
"""
Phase 8: Re-render annotated screenshot PNG with callout circles.
Uses Pillow — already in requirements.txt (Pillow==10.4.0).
"""

import io
import logging
from pathlib import Path
import tempfile

import requests
from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

# Circle styling
CIRCLE_RADIUS = 18
CIRCLE_BORDER = 3
FONT_SIZE = 16

# Confidence colour map (not used in re-render — all dots are blue after reposition)
DOT_FILL = (59, 130, 246)       # blue
DOT_BORDER = (255, 255, 255)    # white


def _draw_callout_dot(draw: ImageDraw.Draw, cx: int, cy: int, number: int) -> None:
    """Draw a numbered circle at pixel position (cx, cy)."""
    r = CIRCLE_RADIUS
    b = CIRCLE_BORDER

    # Outer white border
    draw.ellipse(
        [cx - r - b, cy - r - b, cx + r + b, cy + r + b],
        fill=DOT_BORDER,
    )
    # Filled circle
    draw.ellipse(
        [cx - r, cy - r, cx + r, cy + r],
        fill=DOT_FILL,
    )
    # Number text — centred
    text = str(number)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", FONT_SIZE)
    except (IOError, OSError):
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text((cx - tw // 2, cy - th // 2), text, fill=(255, 255, 255), font=font)


def render_annotated(
    step_id: str,
    screenshot_url: str,
    callouts: list[dict],          # [{"number": 1, "target_x": 23, "target_y": 14}, ...]
    azure_blob_base_url: str,      # e.g. https://cnavinfsop.blob.core.windows.net/infsop
    azure_sas_token: str,
) -> str:
    """
    Download screenshot → draw callout circles → upload PNG to Azure.
    Returns the Azure base URL (no SAS) of the uploaded annotated PNG.
    """
    # 1. Download screenshot
    logger.info("Downloading screenshot for step_id=%s", step_id)
    resp = requests.get(screenshot_url, timeout=30)
    resp.raise_for_status()
    img = Image.open(io.BytesIO(resp.content)).convert("RGB")
    w, h = img.size

    # 2. Draw callouts
    draw = ImageDraw.Draw(img)
    for c in callouts:
        cx = round((c["target_x"] / 100) * w)
        cy = round((c["target_y"] / 100) * h)
        _draw_callout_dot(draw, cx, cy, c["number"])
        logger.debug("Drew callout #%d at (%d, %d)", c["number"], cx, cy)

    # 3. Save to temp file
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    img.save(tmp_path, format="PNG")
    logger.info("Annotated PNG saved: %s (%.1f KB)", tmp_path, tmp_path.stat().st_size / 1024)

    # 4. Upload to Azure Blob: {step_id}/annotated.png
    blob_path = f"{step_id}/annotated.png"
    azure_base_url = f"{azure_blob_base_url.rstrip('/')}/{blob_path}"
    upload_url = f"{azure_base_url}?{azure_sas_token}"

    with open(tmp_path, "rb") as f:
        data = f.read()
    put_resp = requests.put(
        upload_url,
        data=data,
        headers={
            "x-ms-blob-type": "BlockBlob",
            "Content-Type": "image/png",
        },
        timeout=30,
    )
    put_resp.raise_for_status()
    tmp_path.unlink(missing_ok=True)

    logger.info("Uploaded annotated PNG → %s", azure_base_url)
    return azure_base_url  # No SAS — safe for Supabase storage
```

**Verify (inside container):**
```bash
docker compose exec sop-extractor python -c "from app.annotator import render_annotated; print('ok')"
```
→ prints `ok`.

**Commit:** `feat(extractor): add annotator.py — Pillow callout circle renderer`

---

## Task 6 — Add render-annotated endpoint to extractor/main.py

**File:** `sop-platform/extractor/app/main.py`

**Step 6a — Add models** after line 130 (after `RenderDocResponse`, before `# ── Health`):

```python
# ── /api/render-annotated models ─────────────────────────────────────────────

class AnnotatedCallout(BaseModel):
    number: int
    target_x: int   # 0–100 integer percentage
    target_y: int   # 0–100 integer percentage


class RenderAnnotatedRequest(BaseModel):
    step_id: str
    screenshot_url: str           # SAS URL for download
    callouts: list[AnnotatedCallout]
    azure_blob_base_url: str      # e.g. https://cnavinfsop.blob.core.windows.net/infsop
    azure_sas_token: str


class RenderAnnotatedResponse(BaseModel):
    annotated_screenshot_url: str  # Azure base URL (no SAS)
```

**Step 6b — Add endpoint** after the `render_doc` endpoint (after line 222, before `# ── /extract`):

```python
# ── /api/render-annotated ─────────────────────────────────────────────────────

@app.post("/api/render-annotated", response_model=RenderAnnotatedResponse, tags=["export"])
async def render_annotated_endpoint(req: RenderAnnotatedRequest) -> RenderAnnotatedResponse:
    """
    Re-render annotated screenshot PNG with updated callout positions.
    Called internally by sop-api only — not exposed externally.
    """
    from .annotator import render_annotated

    try:
        url = await asyncio.to_thread(
            render_annotated,
            step_id=req.step_id,
            screenshot_url=req.screenshot_url,
            callouts=[c.model_dump() for c in req.callouts],
            azure_blob_base_url=req.azure_blob_base_url,
            azure_sas_token=req.azure_sas_token,
        )
    except Exception as exc:
        logger.exception("render_annotated failed for step_id=%s", req.step_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return RenderAnnotatedResponse(annotated_screenshot_url=url)
```

**Verify:**
```bash
docker compose exec sop-extractor python -c "from app.main import app; print('ok')"
```
→ prints `ok`.

**Restart extractor + smoke test:**
```bash
docker compose restart sop-extractor
docker compose exec sop-extractor curl -s http://localhost:8001/health | python -m json.tool
```
→ `"status": "ok"`.

**Commit:** `feat(extractor): add POST /api/render-annotated endpoint`

---

## Task 7 — Add types + API functions to frontend

**File:** `sop-platform/frontend/src/api/types.ts`

Add after line 47 (after `StepCallout` interface closing brace `}`):

```typescript
export interface CalloutPatchItem {
  id: string
  target_x: number   // integer 0–100
  target_y: number   // integer 0–100
  was_repositioned: boolean
}
```

**File:** `sop-platform/frontend/src/api/client.ts`

**Step 7a — Update the top-level import on line 1** to add `CalloutPatchItem` and `StepCallout`:

```typescript
import type { SOPListItem, SOPDetail, SOPStep, TranscriptLine, SOPSection, WatchlistItem, AppUser, UserCreateInput, UserUpdateInput, CalloutPatchItem, StepCallout } from './types'
```

**Step 7b — Add after the `exportSOP` function closing brace**, before `// ── User management`:

```typescript
export interface RenderAnnotatedResponse {
  annotated_screenshot_url: string
}

export async function patchCallouts(
  stepId: string,
  items: CalloutPatchItem[],
): Promise<StepCallout[]> {
  const result = await mutateAPI<StepCallout[]>(`/api/steps/${stepId}/callouts`, 'PATCH', items)
  if (result === null) throw new Error('Unexpected empty response from PATCH callouts')
  return result
}

export async function renderAnnotated(stepId: string): Promise<RenderAnnotatedResponse> {
  const result = await mutateAPI<RenderAnnotatedResponse>(
    `/api/steps/${stepId}/render-annotated`, 'POST'
  )
  if (result === null) throw new Error('Unexpected empty response from POST render-annotated')
  return result
}
```

**Verify:** `npm run build` in the frontend container (or locally) produces no TypeScript errors.

**Commit:** `feat(frontend): add CalloutPatchItem type + patchCallouts/renderAnnotated API functions`

---

## Task 8 — Create AnnotationEditorModal.tsx

**File:** `sop-platform/frontend/src/components/AnnotationEditorModal.tsx` (new file)

> **Phase 8 scope note:** "Add new callout" is deferred to Phase 9. Phase 8 covers drag-to-reposition and delete of existing callouts only. This avoids the INSERT path on the PATCH endpoint.

```tsx
import { useState, useRef, useEffect } from 'react'
import { Stage, Layer, Circle, Text, Group } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useQueryClient } from '@tanstack/react-query'
import type { StepCallout, CalloutPatchItem } from '../api/types'
import { patchCallouts, renderAnnotated, sopKeys } from '../api/client'

interface Props {
  sopId: string
  stepId: string
  stepTitle: string
  stepNumber: number
  screenshotUrl: string
  callouts: StepCallout[]
  onClose: () => void
}

interface LocalCallout extends StepCallout {
  x_pct: number   // live-editing position (0–100 integer)
  y_pct: number
}

function dotColor(c: LocalCallout): string {
  if (c.was_repositioned) return '#3b82f6'
  if (c.confidence === 'ocr_exact' || c.confidence === 'ocr_fuzzy') return '#10b981'
  return '#f59e0b'
}

function confidenceLabel(c: LocalCallout): string {
  if (c.was_repositioned) return 'repositioned'
  if (c.confidence === 'ocr_exact') return 'ocr_exact'
  if (c.confidence === 'ocr_fuzzy') return 'ocr_fuzzy'
  return 'gemini'
}

interface StageDimensions { width: number; height: number }

export function AnnotationEditorModal({
  sopId, stepId, stepTitle, stepNumber, screenshotUrl, callouts, onClose,
}: Props) {
  const qc = useQueryClient()

  const [local, setLocal] = useState<LocalCallout[]>(() =>
    callouts.map((c) => ({ ...c, x_pct: c.target_x, y_pct: c.target_y })),
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [rerendering, setRerendering] = useState(false)
  const [rerenderUrl, setRerenderUrl] = useState<string | null>(null)

  // Stage dimensions = rendered img dimensions (not natural — avoids drag offset)
  const [stageDim, setStageDim] = useState<StageDimensions>({ width: 720, height: 450 })
  const imgRef = useRef<HTMLImageElement>(null)

  function measureImg() {
    if (imgRef.current) {
      const rect = imgRef.current.getBoundingClientRect()
      setStageDim({ width: rect.width, height: rect.height })
    }
  }

  useEffect(() => {
    window.addEventListener('resize', measureImg)
    return () => window.removeEventListener('resize', measureImg)
  }, [])

  // Convert percentage → rendered pixel for Konva
  const toPixel = (pct: number, dim: number) => (pct / 100) * dim
  // Convert rendered pixel → percentage for storage
  const toPct = (px: number, dim: number) => Math.round((px / dim) * 100)

  function handleDragEnd(id: string, e: KonvaEventObject<DragEvent>) {
    const { width, height } = stageDim
    const newX = Math.max(0, Math.min(width, e.target.x()))
    const newY = Math.max(0, Math.min(height, e.target.y()))
    setLocal((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, x_pct: toPct(newX, width), y_pct: toPct(newY, height), was_repositioned: true }
          : c,
      ),
    )
  }

  function deleteCallout(id: string) {
    setLocal((prev) => prev.filter((c) => c.id !== id))
    if (activeId === id) setActiveId(null)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload: CalloutPatchItem[] = local.map((c) => ({
        id: c.id,
        target_x: c.x_pct,
        target_y: c.y_pct,
        was_repositioned: c.was_repositioned,
      }))
      await patchCallouts(stepId, payload)
      await qc.invalidateQueries({ queryKey: sopKeys.detail(sopId) })
      onClose()
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleRerender() {
    setRerendering(true)
    try {
      const res = await renderAnnotated(stepId)
      setRerenderUrl(res.annotated_screenshot_url)
      await qc.invalidateQueries({ queryKey: sopKeys.detail(sopId) })
    } catch (err) {
      alert(`Re-render failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRerendering(false)
    }
  }

  const { width: sw, height: sh } = stageDim
  const displayUrl = rerenderUrl ? `${rerenderUrl}?t=${Date.now()}` : screenshotUrl
  const allGemini = local.every((c) => c.confidence === 'gemini_only' && !c.was_repositioned)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-slate-800 border border-slate-600 rounded-xl w-[92vw] max-w-[1200px] h-[88vh] flex flex-col overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-700 bg-slate-900 shrink-0">
          <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded">
            STEP {stepNumber}
          </span>
          <h2 className="flex-1 text-sm font-semibold text-slate-100 truncate">{stepTitle}</h2>
          {allGemini && (
            <span className="text-xs bg-yellow-900/60 text-yellow-300 px-2 py-0.5 rounded font-semibold">
              ⚠ gemini_only
            </span>
          )}
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-semibold text-slate-400 border border-slate-600 rounded hover:bg-slate-700">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">

          {/* Canvas area */}
          <div className="flex-1 bg-slate-950 relative flex items-center justify-center overflow-hidden">
            <div className="relative">
              {/* Screenshot img — Konva Stage overlaid at exact rendered size */}
              <img
                ref={imgRef}
                src={displayUrl}
                alt="Step screenshot"
                className="max-h-[70vh] max-w-full object-contain rounded block"
                onLoad={measureImg}
              />
              <Stage
                width={sw}
                height={sh}
                style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
              >
                <Layer>
                  {local.map((c) => {
                    const x = toPixel(c.x_pct, sw)
                    const y = toPixel(c.y_pct, sh)
                    const color = dotColor(c)
                    const isActive = c.id === activeId
                    return (
                      <Group
                        key={c.id}
                        x={x}
                        y={y}
                        draggable
                        onDragEnd={(e) => handleDragEnd(c.id, e)}
                        onClick={(e) => { e.cancelBubble = true; setActiveId(c.id) }}
                        style={{ pointerEvents: 'auto' }}
                      >
                        <Circle radius={isActive ? 23 : 20} fill="white" stroke={isActive ? '#3b82f6' : 'transparent'} strokeWidth={isActive ? 3 : 0} />
                        <Circle radius={17} fill={color} />
                        <Text text={String(c.callout_number)} fontSize={12} fontStyle="bold" fill="white" offsetX={4} offsetY={6} />
                      </Group>
                    )
                  })}
                </Layer>
              </Stage>
            </div>
            <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-slate-500 bg-black/50 px-3 py-1 rounded-full pointer-events-none">
              Drag dots to reposition
            </p>
          </div>

          {/* Right panel */}
          <div className="w-72 border-l border-slate-700 bg-slate-900 flex flex-col shrink-0">
            <div className="px-4 py-3 border-b border-slate-700">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Callouts — {local.length}</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {local.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`rounded-lg border p-3 cursor-pointer transition-colors ${activeId === c.id ? 'border-blue-500 bg-slate-800' : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: dotColor(c) }}>
                      {c.callout_number}
                    </span>
                    <span className="text-xs font-semibold text-slate-200 flex-1 truncate">{c.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${c.was_repositioned ? 'bg-blue-900/50 text-blue-300' : c.confidence.startsWith('ocr') ? 'bg-emerald-900/50 text-emerald-300' : 'bg-yellow-900/50 text-yellow-300'}`}>
                      {confidenceLabel(c)}
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-slate-500">x:{c.x_pct}% y:{c.y_pct}%</p>
                  <div className="flex gap-1 mt-2 pt-2 border-t border-slate-700">
                    <button onClick={(e) => { e.stopPropagation(); deleteCallout(c.id) }} className="text-[10px] px-2 py-0.5 rounded bg-red-900/40 text-red-400 hover:bg-red-900/70">
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-slate-700">
              <button onClick={handleRerender} disabled={rerendering} className="w-full py-2 text-xs font-semibold bg-purple-700 text-white rounded hover:bg-purple-600 disabled:opacity-50">
                {rerendering ? 'Rendering…' : '↻ Re-render Annotated PNG'}
              </button>
              <p className="text-[10px] text-slate-600 text-center mt-1">Regenerates the screenshot PNG with current positions</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2 border-t border-slate-700 bg-slate-900 shrink-0 flex items-center gap-4 text-xs text-slate-500">
          <span>Step {stepNumber} · {local.length} callouts</span>
          {allGemini && <span className="text-yellow-400">⚠ All positions are Gemini estimates — verify before saving</span>}
        </div>
      </div>
    </div>
  )
}
```

**Verify:** `npm run build` in frontend produces no errors.

**Commit:** `feat(frontend): add AnnotationEditorModal component`

---

## Task 9 — Wire Edit Callouts button into StepCard.tsx

**File:** `sop-platform/frontend/src/components/StepCard.tsx`

**Step 9a — Update imports** (lines 1–5). Replace:

```typescript
import { useState } from 'react'
import type { SOPStep, TranscriptLine } from '../api/types'
import { CalloutList } from './CalloutList'
import { DiscussionCard } from './DiscussionCard'
import { ScreenshotModal } from './ScreenshotModal'
```

With:

```typescript
import { useState } from 'react'
import type { SOPStep, TranscriptLine } from '../api/types'
import { useAuth } from '../hooks/useAuth'
import { CalloutList } from './CalloutList'
import { DiscussionCard } from './DiscussionCard'
import { ScreenshotModal } from './ScreenshotModal'
import { AnnotationEditorModal } from './AnnotationEditorModal'
```

**Step 9b — Add editor state + role check** inside `StepCard` function, after line 35 (`const [modalOpen, setModalOpen] = useState(false)`):

```typescript
const [editorOpen, setEditorOpen] = useState(false)
const { appUser } = useAuth()
const canEdit = appUser?.role === 'editor' || appUser?.role === 'admin'
```

**Step 9c — Add Edit Callouts button and modal** in the screenshot block (lines 88–101). Replace:

```tsx
          <button
            onClick={() => setModalOpen(true)}
            className="mt-1 text-xs text-blue-600 hover:underline"
          >
            Click to expand full screenshot
          </button>
          {modalOpen && (
            <ScreenshotModal
              src={screenshotUrl}
              alt={`Step ${step.sequence} screenshot`}
              onClose={() => setModalOpen(false)}
            />
          )}
```

With:

```tsx
          <div className="mt-1 flex items-center gap-3">
            <button
              onClick={() => setModalOpen(true)}
              className="text-xs text-blue-600 hover:underline"
            >
              Click to expand full screenshot
            </button>
            {canEdit && (
              <button
                onClick={() => setEditorOpen(true)}
                className="text-xs text-purple-600 hover:underline font-medium"
              >
                ✎ Edit Callouts
              </button>
            )}
          </div>
          {modalOpen && (
            <ScreenshotModal
              src={screenshotUrl}
              alt={`Step ${step.sequence} screenshot`}
              onClose={() => setModalOpen(false)}
            />
          )}
          {editorOpen && canEdit && (
            <AnnotationEditorModal
              sopId={step.sop_id}
              stepId={step.id}
              stepTitle={step.title}
              stepNumber={step.sequence}
              screenshotUrl={screenshotUrl}
              callouts={step.callouts}
              onClose={() => setEditorOpen(false)}
            />
          )}
```

**Verify:** `npm run build` produces no errors. Open UI → Step with screenshot → "✎ Edit Callouts" button visible for editor/admin role.

**Commit:** `feat(frontend): wire Edit Callouts button + AnnotationEditorModal into StepCard`

---

## Task 10 — Deploy + smoke test

```bash
cd "d:\CloudNavision\1. Projects\SOP\SOP Automation System\sop-platform"

# Rebuild API (new schemas + routes)
docker compose build sop-api && docker compose up -d sop-api

# Restart extractor (new annotator.py + endpoint)
docker compose restart sop-extractor

# Rebuild frontend (new components)
docker compose build sop-frontend && docker compose up -d sop-frontend
```

**Smoke tests:**

1. API health: `docker compose exec sop-api curl -s http://localhost:8000/api/health`
2. Extractor health: `docker compose exec sop-extractor curl -s http://localhost:8001/health`
3. Open `http://localhost:5173` → navigate to a SOP → click a step → confirm "✎ Edit Callouts" visible (editor role)
4. Open editor → drag a dot → click Save Changes → confirm no error toast
5. Click "↻ Re-render Annotated PNG" → confirm spinner then success

**Commit:** `feat: Phase 8 annotation editor complete — deploy verified`

---

## Update MASTER_PLAN.md + CHECKLIST.md

After all tasks pass, update:
- `plans/MASTER_PLAN.md` — Phase 8 status: `✅ Complete`
- `CHECKLIST.md` — mark Phase 8 items complete
