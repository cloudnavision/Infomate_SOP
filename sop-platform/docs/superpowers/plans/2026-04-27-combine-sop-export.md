# SOP Combine & Export — Implementation Plan
**Date:** 2026-04-27
**Feature:** Combine 2+ SOP documents into one DOCX/PDF export with Parts-based structure and continuous step numbering

---

## File Map

| File | Action |
|---|---|
| `api/app/schemas.py` | Add `CombinePartInput`, `CombineExportBody` |
| `api/app/routes/exports.py` | Add `POST /api/sops/combine/export` |
| `extractor/app/build_combined_template.py` | **New** — builds `sop_combined_template.docx` |
| `extractor/app/doc_renderer.py` | Add `render_combined_sop()` + `COMBINED_TEMPLATE_PATH` constant |
| `extractor/app/main.py` | Add `POST /api/render-combined` endpoint |
| `frontend/src/api/types.ts` | Add `CombinePartInput`, `CombineExportRequest` |
| `frontend/src/api/client.ts` | Add `exportCombinedSOPs()` |
| `frontend/src/routes/combine.tsx` | **New** — 3-step wizard |
| `frontend/src/routes/dashboard.tsx` | Add "Combine SOPs" button (editor/admin) |

> `frontend/src/routeTree.gen.ts` is auto-generated — restart dev server after creating `combine.tsx`.

---

## Tasks

### Task 1 — Backend schemas (2 min)

**File:** `api/app/schemas.py` — add after `ProcessMapConfigBody` (line 319)

```python
class CombinePartInput(BaseModel):
    sop_id: str
    label: str  # e.g. "Part 1: Login & Setup"

class CombineExportBody(BaseModel):
    parts: list[CombinePartInput]   # ordered list, min 2
    title: str                       # combined document title
```

Commit: `feat: CombinePartInput + CombineExportBody schemas`

---

### Task 2 — Combine export API endpoint (5 min)

**File:** `api/app/routes/exports.py`

Add import at top:
```python
from app.dependencies.auth import require_editor
from app.schemas import SOPDetail, ExportResponse, with_sas, CombineExportBody
```
(replace existing `require_viewer` import line — keep both)

Add after the existing `export_sop` function:
```python
@router.post("/sops/combine/export", response_model=ExportResponse)
async def export_combined_sop(
    body: CombineExportBody,
    current_user: Annotated[User, Depends(require_editor)],
    fmt: str = Query("docx", alias="format", pattern="^(docx|pdf)$"),
    db: AsyncSession = Depends(get_db),
) -> ExportResponse:
    """Combine 2+ SOPs into one DOCX/PDF. Steps are renumbered continuously."""
    if len(body.parts) < 2:
        raise HTTPException(status_code=400, detail="At least 2 parts required")

    parts_data = []
    offset = 0
    for part_input in body.parts:
        stmt = (
            select(SOP)
            .where(SOP.id == part_input.sop_id)
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
            raise HTTPException(status_code=404, detail=f"SOP {part_input.sop_id} not found")

        sop.steps.sort(key=lambda s: s.sequence)
        sop_detail = SOPDetail.model_validate(sop)

        # Build steps list with continuous numbering (overwrite sequence)
        steps_serialized = []
        for step in sop_detail.steps:
            steps_serialized.append({
                "id": str(step.id),
                "sequence": step.sequence + offset,   # continuous numbering
                "title": step.title,
                "description": step.description or "",
                "sub_steps": step.sub_steps or [],
                "annotated_screenshot_url": step.annotated_screenshot_url,
                "screenshot_url": step.screenshot_url,
                "callouts": [
                    {"callout_number": c.callout_number, "label": c.label}
                    for c in step.callouts
                ],
            })
        offset += len(sop_detail.steps)

        sop_data = {
            "sop_title": sop_detail.title,
            "client_name": sop_detail.client_name or "",
            "process_name": sop_detail.process_name or "",
            "meeting_date": str(sop_detail.meeting_date) if sop_detail.meeting_date else "",
            "steps": steps_serialized,
            "sections": [
                {
                    "section_title": sec.section_title,
                    "content_type": sec.content_type,
                    "content_text": sec.content_text or "",
                    "content_json": sec.content_json,
                    "display_order": sec.display_order,
                }
                for sec in sop_detail.sections
            ],
        }
        parts_data.append({"label": part_input.label, "sop_data": sop_data})

    from datetime import datetime
    combined_id = f"combined-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"

    render_payload = {
        "combined_id": combined_id,
        "format": fmt,
        "title": body.title,
        "parts": parts_data,
        "azure_blob_base_url": settings.azure_blob_base_url,
        "azure_sas_token": settings.azure_blob_sas_token,
    }

    try:
        async with httpx.AsyncClient(timeout=600.0) as client:
            resp = await client.post(
                f"{settings.extractor_url}/api/render-combined",
                json=render_payload,
            )
            resp.raise_for_status()
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=503, detail="Combined export timed out") from exc
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:300] if exc.response else str(exc)
        raise HTTPException(status_code=503, detail=f"Extractor error: {detail}") from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Extractor unavailable: {exc}") from exc

    render_result = resp.json()
    file_url_base = render_result["pdf_url"] if fmt == "pdf" else render_result["docx_url"]
    if not file_url_base:
        raise HTTPException(status_code=500, detail="Extractor returned no file URL")

    # No export_history insert — no single sop_id
    download_url = with_sas(file_url_base) or file_url_base
    filename = f"{combined_id}.{fmt}"
    return ExportResponse(download_url=download_url, filename=filename, format=fmt)
```

Commit: `feat: POST /api/sops/combine/export — combine N SOPs into one DOCX/PDF`

---

### Task 3 — Combined DOCX template builder (10 min)

**New file:** `extractor/app/build_combined_template.py`

```python
"""
Build the combined SOP DOCX template.
Jinja2 variables: title, today, toc_entries[{label, step_range}], parts[{label, steps[...]}]
"""
from pathlib import Path
from docx import Document
from docx.shared import Pt, Inches, RGBColor, Cm
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.text import WD_ALIGN_PARAGRAPH

ORANGE   = RGBColor(0xE8, 0x5C, 0x1A)
DARK     = RGBColor(0x1A, 0x1A, 0x2E)
WHITE    = RGBColor(0xFF, 0xFF, 0xFF)
BORDER   = RGBColor(0xD1, 0xD5, 0xDB)

COMBINED_TEMPLATE_PATH = Path("/data/templates/sop_combined_template.docx")


def build(force: bool = False):
    if COMBINED_TEMPLATE_PATH.exists() and not force:
        return
    COMBINED_TEMPLATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    doc = Document()

    # ── Page margins ──────────────────────────────────────────────────────────
    for section in doc.sections:
        section.top_margin    = Cm(2.0)
        section.bottom_margin = Cm(2.0)
        section.left_margin   = Cm(2.5)
        section.right_margin  = Cm(2.5)

    # ── Cover: title ─────────────────────────────────────────────────────────
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("{{ title }}")
    run.font.size = Pt(22)
    run.font.bold = True
    run.font.color.rgb = DARK
    run.font.name = "Calibri"

    # Metadata line
    p2 = doc.add_paragraph()
    p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r2 = p2.add_run("Generated: {{ today }}")
    r2.font.size = Pt(10)
    r2.font.color.rgb = RGBColor(0x6B, 0x72, 0x80)
    r2.font.name = "Calibri"

    doc.add_paragraph()

    # ── TOC header ────────────────────────────────────────────────────────────
    p_toc = doc.add_paragraph()
    r_toc = p_toc.add_run("TABLE OF CONTENTS")
    r_toc.font.size = Pt(11)
    r_toc.font.bold = True
    r_toc.font.color.rgb = ORANGE
    r_toc.font.name = "Calibri"

    # TOC rows loop
    doc.add_paragraph("{%p for entry in toc_entries %}")
    p_row = doc.add_paragraph()
    r_row = p_row.add_run("  {{ entry.label }}  ........  {{ entry.step_range }}")
    r_row.font.size = Pt(10)
    r_row.font.name = "Calibri"
    doc.add_paragraph("{%p endfor %}")

    doc.add_paragraph()

    # ── Parts loop ────────────────────────────────────────────────────────────
    doc.add_paragraph("{%p for part in parts %}")

    # Part header bar
    p_part = doc.add_paragraph()
    pPr = p_part._p.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), "E85C1A")
    pPr.append(shd)
    r_part = p_part.add_run("{{ part.label }}")
    r_part.font.size = Pt(13)
    r_part.font.bold = True
    r_part.font.color.rgb = WHITE
    r_part.font.name = "Calibri"

    doc.add_paragraph()

    # Steps loop within part
    doc.add_paragraph("{%p for step in part.steps %}")

    # Step heading
    p_step = doc.add_paragraph()
    r_step_num = p_step.add_run("Step {{ step.sequence }}: ")
    r_step_num.font.size = Pt(11)
    r_step_num.font.bold = True
    r_step_num.font.color.rgb = ORANGE
    r_step_num.font.name = "Calibri"
    r_step_title = p_step.add_run("{{ step.title }}")
    r_step_title.font.size = Pt(11)
    r_step_title.font.bold = True
    r_step_title.font.color.rgb = DARK
    r_step_title.font.name = "Calibri"

    # Screenshot placeholder
    doc.add_paragraph("{%p if step.screenshot %}{{ step.screenshot }}{%p endif %}")

    # Description
    p_desc = doc.add_paragraph()
    r_desc = p_desc.add_run("{{ step.description }}")
    r_desc.font.size = Pt(10)
    r_desc.font.name = "Calibri"

    # Sub-steps
    doc.add_paragraph("{%p for sub in step.sub_steps %}")
    p_sub = doc.add_paragraph()
    p_sub.paragraph_format.left_indent = Inches(0.4)
    r_sub = p_sub.add_run("• {{ sub }}")
    r_sub.font.size = Pt(10)
    r_sub.font.name = "Calibri"
    doc.add_paragraph("{%p endfor %}")

    doc.add_paragraph()
    doc.add_paragraph("{%p endfor %}")   # end steps loop

    doc.add_paragraph()
    doc.add_paragraph("{%p endfor %}")   # end parts loop

    doc.save(str(COMBINED_TEMPLATE_PATH))


if __name__ == "__main__":
    build(force=True)
    print(f"Built: {COMBINED_TEMPLATE_PATH}")
```

Commit: `feat: build_combined_template.py — combined SOP DOCX template`

---

### Task 4 — render_combined_sop() in doc_renderer (10 min)

**File:** `extractor/app/doc_renderer.py`

Add constant near `TEMPLATE_PATH` (top of file):
```python
COMBINED_TEMPLATE_PATH = Path("/data/templates/sop_combined_template.docx")
```

Add new function after `render_sop` (around line 100):
```python
def render_combined_sop(
    combined_id: str,
    fmt: str,
    title: str,
    parts: list[dict],   # [{label, sop_data: {steps, sections}}]
    azure_blob_base_url: str,
    azure_sas_token: str,
) -> dict:
    """Render a combined multi-part SOP document. Steps already have continuous sequence numbers."""
    try:
        from app.build_combined_template import build as build_combined_template
        build_combined_template(force=False)
    except Exception as exc:
        logger.warning("Combined template builder failed: %s", exc)

    if not COMBINED_TEMPLATE_PATH.exists():
        raise FileNotFoundError(f"Combined template not found: {COMBINED_TEMPLATE_PATH}")

    export_dir = EXPORTS_DIR / "combined"
    export_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix=f"sop_combined_{combined_id}_") as tmp_str:
        tmp_dir = Path(tmp_str)
        tpl = DocxTemplate(str(COMBINED_TEMPLATE_PATH))

        # Build parts context
        parts_ctx = []
        toc_entries = []
        for part in parts:
            steps_raw = part["sop_data"].get("steps", [])
            steps_ctx = []
            for step in steps_raw:
                screenshot = None
                ann_url = step.get("annotated_screenshot_url") or step.get("screenshot_url")
                if ann_url:
                    screenshot = _download_inline_image(tpl, ann_url, tmp_dir, step.get("id", "unknown"))
                steps_ctx.append({
                    "sequence": step.get("sequence", ""),
                    "title": step.get("title", ""),
                    "description": step.get("description") or "",
                    "sub_steps": step.get("sub_steps") or [],
                    "screenshot": screenshot,
                    "callouts": [
                        {"callout_number": c.get("callout_number"), "label": c.get("label", "")}
                        for c in (step.get("callouts") or [])
                    ],
                })

            parts_ctx.append({"label": part["label"], "steps": steps_ctx})

            # TOC entry: "Part 1: Label .... Steps 1–7"
            if steps_ctx:
                step_from = steps_ctx[0]["sequence"]
                step_to   = steps_ctx[-1]["sequence"]
                step_range = f"Steps {step_from}–{step_to}" if step_from != step_to else f"Step {step_from}"
            else:
                step_range = "No steps"
            toc_entries.append({"label": part["label"], "step_range": step_range})

        context = {
            "title": title,
            "today": date.today().strftime("%d %b %Y"),
            "toc_entries": toc_entries,
            "parts": parts_ctx,
        }

        tpl.render(context)

        docx_filename = f"{combined_id}.docx"
        docx_path = export_dir / docx_filename
        tpl.save(str(docx_path))

        # Upload DOCX
        docx_blob_path = f"exports/combined/{docx_filename}"
        docx_base_url = f"{azure_blob_base_url}/{docx_blob_path}"
        _upload_blob(
            docx_path,
            f"{docx_base_url}?{azure_sas_token}",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )

        pdf_base_url: Optional[str] = None
        if fmt == "pdf":
            pdf_path = _convert_to_pdf(docx_path, export_dir)
            pdf_filename = pdf_path.name
            pdf_blob_path = f"exports/combined/{pdf_filename}"
            pdf_base_url = f"{azure_blob_base_url}/{pdf_blob_path}"
            _upload_blob(pdf_path, f"{pdf_base_url}?{azure_sas_token}", "application/pdf")

    return {"docx_url": docx_base_url, "pdf_url": pdf_base_url}
```

Commit: `feat: render_combined_sop() in doc_renderer`

---

### Task 5 — /api/render-combined extractor endpoint (3 min)

**File:** `extractor/app/main.py`

Add Pydantic model (after existing request models, around line 80):
```python
class RenderCombinedRequest(BaseModel):
    combined_id: str
    format: str
    title: str
    parts: list[dict]   # [{label, sop_data}]
    azure_blob_base_url: str
    azure_sas_token: str
```

Add endpoint (after existing `/api/render-doc` endpoint):
```python
@app.post("/api/render-combined")
async def render_combined(req: RenderCombinedRequest):
    """Render a combined multi-part SOP document."""
    from .doc_renderer import render_combined_sop
    try:
        result = await asyncio.to_thread(
            render_combined_sop,
            combined_id=req.combined_id,
            fmt=req.format,
            title=req.title,
            parts=req.parts,
            azure_blob_base_url=req.azure_blob_base_url,
            azure_sas_token=req.azure_sas_token,
        )
        return result
    except Exception as exc:
        logger.error("render_combined failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))
```

Commit: `feat: POST /api/render-combined extractor endpoint`

---

### Task 6 — Frontend types + client function (3 min)

**File:** `frontend/src/api/types.ts` — add after `ProcessMapConfig`:
```ts
export interface CombinePartInput {
  sop_id: string
  label: string
}

export interface CombineExportRequest {
  parts: CombinePartInput[]
  title: string
}
```

**File:** `frontend/src/api/client.ts` — add after `exportSOP`:
```ts
export const exportCombinedSOPs = async (
  body: CombineExportRequest,
  format: 'docx' | 'pdf',
): Promise<ExportResponse> => {
  const headers = await getAuthHeaders() as Record<string, string>
  headers['Content-Type'] = 'application/json'
  const res = await fetch(`${API_BASE}/api/sops/combine/export?format=${format}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Export failed: ${res.status}`)
  return res.json()
}
```

Also add `CombinePartInput`, `CombineExportRequest` to the import line at top of `client.ts`.

Commit: `feat: CombinePartInput types + exportCombinedSOPs client function`

---

### Task 7 — Dashboard "Combine SOPs" button (5 min)

**File:** `frontend/src/routes/dashboard.tsx`

Add `useAuth` import:
```ts
import { useAuth } from '../hooks/useAuth'
import { Link } from '@tanstack/react-router'
```

Inside `Dashboard()` function, add after the existing `useQuery` call:
```ts
const { appUser } = useAuth()
const canCombine = appUser?.role === 'editor' || appUser?.role === 'admin'
```

Add button in the search bar / header row (find the `<div>` that wraps the search input):
```tsx
{canCombine && (
  <Link
    to="/combine"
    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm shrink-0"
  >
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 111.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L15 13.586V12a1 1 0 011-1z" clipRule="evenodd"/>
    </svg>
    Combine SOPs
  </Link>
)}
```

Commit: `feat: dashboard Combine SOPs button (editor/admin only)`

---

### Task 8 — /combine wizard route (25 min)

**New file:** `frontend/src/routes/combine.tsx`

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchSOPs, exportCombinedSOPs } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import type { SOPListItem, CombinePartInput } from '../api/types'

export const Route = createFileRoute('/combine')({
  component: CombinePage,
})

function CombinePage() {
  const { appUser } = useAuth()
  const navigate = useNavigate()
  const canCombine = appUser?.role === 'editor' || appUser?.role === 'admin'

  const [wizardStep, setWizardStep] = useState<0 | 1 | 2>(0)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [parts, setParts] = useState<CombinePartInput[]>([])
  const [combinedTitle, setCombinedTitle] = useState('')
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  const { data: sops, isLoading } = useQuery({
    queryKey: ['sops'],
    queryFn: fetchSOPs,
  })

  const exportMutation = useMutation({
    mutationFn: (fmt: 'docx' | 'pdf') =>
      exportCombinedSOPs({ parts, title: combinedTitle || 'Combined SOP' }, fmt),
    onSuccess: (data) => setDownloadUrl(data.download_url),
  })

  if (!canCombine) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-gray-400">
        You need editor or admin access to combine SOPs.
      </div>
    )
  }

  // ── Step 0: Select SOPs ───────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const goToStep1 = () => {
    const initial = selectedIds.map((id, i) => ({
      sop_id: id,
      label: `Part ${i + 1}`,
    }))
    setParts(initial)
    const selected = sops?.find(s => s.id === selectedIds[0])
    setCombinedTitle(selected ? `${selected.client_name || selected.title} — Combined` : 'Combined SOP')
    setWizardStep(1)
  }

  // ── Step 1: Order & Label ─────────────────────────────────────────────────
  const handleDrop = (toIdx: number) => {
    if (dragIdx === null || dragIdx === toIdx) return
    const next = [...parts]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(toIdx, 0, moved)
    // Re-apply default labels if user hasn't customised them
    setParts(next)
    setDragIdx(null); setDragOverIdx(null)
  }

  const updateLabel = (idx: number, label: string) => {
    setParts(prev => prev.map((p, i) => i === idx ? { ...p, label } : p))
  }

  // ── Labels ────────────────────────────────────────────────────────────────
  const WIZARD_LABELS = ['1. Select SOPs', '2. Order & Label', '3. Preview & Export']

  const sopById: Record<string, SOPListItem> = {}
  sops?.forEach(s => { sopById[s.id] = s })

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Combine SOPs</h1>
        <p className="text-sm text-gray-500 mt-1">
          Select 2 or more SOPs, order them, and export as a single document.
        </p>
      </div>

      {/* Wizard progress */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-0">
          {WIZARD_LABELS.map((label, i) => (
            <div key={i} className="flex items-center flex-1">
              <span className={`flex items-center gap-2 text-sm font-medium ${
                i === wizardStep ? 'text-blue-600' : i < wizardStep ? 'text-green-600' : 'text-gray-400'
              }`}>
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  i === wizardStep ? 'bg-blue-600 text-white' : i < wizardStep ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'
                }`}>
                  {i < wizardStep ? '✓' : i + 1}
                </span>
                <span className="hidden sm:inline">{label}</span>
              </span>
              {i < WIZARD_LABELS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-3 ${i < wizardStep ? 'bg-green-300' : 'bg-gray-100'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step 0: Select */}
      {wizardStep === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Select SOPs to combine</h2>
          <p className="text-sm text-gray-500">Select at least 2 SOPs. They will each become a "Part" in the combined document.</p>
          {isLoading ? (
            <p className="text-gray-400 text-sm">Loading…</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {(sops ?? []).map(sop => (
                <label
                  key={sop.id}
                  className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${
                    selectedIds.includes(sop.id)
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(sop.id)}
                    onChange={() => toggleSelect(sop.id)}
                    className="w-4 h-4 accent-blue-600 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{sop.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {sop.client_name && <span>{sop.client_name} · </span>}
                      {sop.meeting_date && <span>{sop.meeting_date} · </span>}
                      <span>{sop.step_count} steps</span>
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 1: Order & Label */}
      {wizardStep === 1 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Order & label each part</h2>
          <p className="text-sm text-gray-500">Drag to reorder. Edit the label that will appear as a section header in the document.</p>

          {/* Combined title */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Combined Document Title</label>
            <input
              value={combinedTitle}
              onChange={e => setCombinedTitle(e.target.value)}
              className="mt-1 w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Aged Debtor Process — Combined"
            />
          </div>

          <div className="space-y-2">
            {parts.map((part, i) => {
              const sop = sopById[part.sop_id]
              return (
                <div
                  key={part.sop_id}
                  draggable
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={e => { e.preventDefault(); setDragOverIdx(i) }}
                  onDrop={() => handleDrop(i)}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
                  className={`flex items-center gap-3 bg-white border rounded-xl px-4 py-3 shadow-sm transition-colors ${
                    dragOverIdx === i ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-300 shrink-0 cursor-grab">
                    <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0 .001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z"/>
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400 truncate mb-1">{sop?.title}</p>
                    <input
                      value={part.label}
                      onChange={e => updateLabel(i, e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={`Part ${i + 1} label`}
                    />
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{sopById[part.sop_id]?.step_count} steps</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Step 2: Preview & Export */}
      {wizardStep === 2 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Preview & Export</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              <strong>{combinedTitle}</strong> — {parts.reduce((acc, p) => acc + (sopById[p.sop_id]?.step_count ?? 0), 0)} total steps across {parts.length} parts
            </p>
          </div>

          {/* Step preview list */}
          <div className="space-y-4">
            {(() => {
              let offset = 0
              return parts.map(part => {
                const sop = sopById[part.sop_id]
                const stepCount = sop?.step_count ?? 0
                const stepFrom = offset + 1
                const stepTo = offset + stepCount
                offset += stepCount
                return (
                  <div key={part.sop_id} className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="bg-orange-500 px-4 py-2.5">
                      <span className="text-white font-semibold text-sm">{part.label}</span>
                      <span className="text-orange-100 text-xs ml-2">Steps {stepFrom}–{stepTo}</span>
                    </div>
                    <div className="px-4 py-3">
                      <p className="text-xs text-gray-400">{sop?.title}</p>
                      <p className="text-xs text-gray-400">{stepCount} steps from this recording</p>
                    </div>
                  </div>
                )
              })
            })()}
          </div>

          {/* Export buttons */}
          {downloadUrl ? (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-5 py-4">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-green-500 shrink-0">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
              </svg>
              <div className="flex-1">
                <p className="text-sm font-medium text-green-700">Combined document ready</p>
              </div>
              <a
                href={downloadUrl}
                download
                className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700"
              >
                Download
              </a>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => exportMutation.mutate('docx')}
                disabled={exportMutation.isPending}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {exportMutation.isPending ? (
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/>
                  </svg>
                )}
                Export DOCX
              </button>
              <button
                onClick={() => exportMutation.mutate('pdf')}
                disabled={exportMutation.isPending}
                className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Export PDF
              </button>
            </div>
          )}

          {exportMutation.isError && (
            <p className="text-sm text-red-500">{(exportMutation.error as Error).message}</p>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            if (wizardStep === 0) navigate({ to: '/dashboard' })
            else setWizardStep(prev => (prev - 1) as 0 | 1 | 2)
          }}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd"/>
          </svg>
          {wizardStep === 0 ? 'Back to Dashboard' : 'Back'}
        </button>

        {wizardStep < 2 && (
          <button
            onClick={() => {
              if (wizardStep === 0) goToStep1()
              else setWizardStep(2)
            }}
            disabled={wizardStep === 0 && selectedIds.length < 2}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors shadow-sm"
          >
            Next
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
```

Commit: `feat: /combine wizard — select, order, label, export combined SOP`

---

### Task 9 — Rebuild + verify (3 min)

```bash
docker compose build sop-api sop-extractor sop-frontend
docker compose up -d sop-api sop-extractor sop-frontend
```

Verify:
1. Dashboard shows "Combine SOPs" button for editor/admin
2. `/combine` route loads, shows SOP list with checkboxes
3. Select 2 SOPs → Next → Order & Label step works
4. Preview shows correct step numbering (Part 1 ends at N, Part 2 starts at N+1)
5. Export DOCX → downloads combined file with Parts

Commit: `chore: rebuild containers for combine SOP export feature`

---

## Verification Checklist

1. `POST /api/sops/combine/export` — requires editor auth, rejects < 2 parts
2. Step numbers in combined export are continuous (not reset per part)
3. `sop_combined_template.docx` is auto-built on first extractor request
4. DOCX contains bold Part headers + steps under each
5. PDF export also works
6. Dashboard "Combine SOPs" button hidden for viewers
7. Individual SOPs in the system are unchanged after a combined export
8. `/combine` wizard: Back navigates correctly at each step
