# Phase 7: Exports + Polish — Implementation Plan
**Date:** 2026-04-03
**Spec:** `docs/superpowers/specs/2026-04-03-phase7-exports-polish-design.md`
**Order:** 7b-1 → 7b-2 → 7b-3 → 7a-1…7a-5 → 7c

---

## 1. File Map

| File | Action |
|---|---|
| `api/app/schemas.py` | Modify — add `pipeline_status`/`pipeline_stage` to `SOPListItem`; add `ExportResponse`; add public `with_sas` alias |
| `api/app/routes/sops.py` | Modify — add correlated subqueries for pipeline status |
| `api/app/routes/exports.py` | **Create** — `POST /api/sops/{id}/export` |
| `api/app/main.py` | Modify — register exports router |
| `api/app/models.py` | **No change** — `ExportHistory` model already exists at line 463 |
| `extractor/app/main.py` | Modify — add `POST /api/render-doc` endpoint + request/response models |
| `extractor/app/doc_renderer.py` | **Create** — docxtpl render + LibreOffice PDF + Azure upload |
| `extractor/requirements.txt` | Modify — add `docxtpl>=0.16.0` and `httpx>=0.27.0` |
| `extractor/Dockerfile` | Modify — add LibreOffice apt package |
| `data/templates/create_placeholder_template.py` | **Create** — one-time script to generate placeholder .docx |
| `data/templates/sop_template.docx` | **Create** — run above script to generate |
| `frontend/src/api/types.ts` | Modify — add `pipeline_status`/`pipeline_stage` to `SOPListItem` |
| `frontend/src/api/client.ts` | Modify — add `exportSOP(id, format)` |
| `frontend/src/components/SOPCard.tsx` | Modify — pipeline badge + action buttons |
| `frontend/src/routes/dashboard.tsx` | Modify — search bar + filtered list |
| `frontend/src/components/SOPPageHeader.tsx` | Modify — wire export buttons |

---

## 2. Tasks

### TASK 1 — Backend: Add pipeline_status/pipeline_stage to SOPListItem schema

**File:** `api/app/schemas.py`
**Lines to edit:** 215–225 (`SOPListItem` class)

**Change:** Add two optional fields after `step_count`:

```python
class SOPListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    status: SOPStatus
    client_name: Optional[str] = None
    process_name: Optional[str] = None
    meeting_date: Optional[date] = None
    created_at: datetime
    step_count: int = 0
    pipeline_status: Optional[str] = None   # latest pipeline_runs.status
    pipeline_stage: Optional[str] = None    # latest pipeline_runs.current_stage
```

**Verify:** No rebuild needed yet. Continue to Task 2.

---

### TASK 2 — Backend: Add correlated subqueries to list_sops

**File:** `api/app/routes/sops.py`

**Change 1 — add imports** at line 5:
Add `PipelineRun` to the models import:
```python
from app.models import SOP, SOPStep, SOPStatus, PipelineRun, User, UserRole
```

**Change 2 — add subqueries** after line 36 (after `step_count_subq`):
```python
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
```

**Change 3 — update select statement** at line 38:
```python
    stmt = select(
        SOP,
        step_count_subq.label("step_count"),
        latest_run_status_subq.label("pipeline_status"),
        latest_run_stage_subq.label("pipeline_stage"),
    ).order_by(SOP.created_at.desc())
```

**Change 4 — update SOPListItem constructor** at lines 51–60:
```python
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
```

> Note: `PipelineRun.status` is a `PipelineStatus` enum — call `.value` to get the string.

**Verify:**
```bash
cd "d:/CloudNavision/1. Projects/SOP/SOP Automation System/sop-platform"
docker compose exec sop-api python -c "import app.routes.sops"
echo "Exit code: $?"
```
Expected: `Exit code: 0` (no import errors).

Then:
```bash
curl -s http://localhost:8000/api/sops \
  -H "Authorization: Bearer <token>" | python -m json.tool | grep -A2 "pipeline"
```
Expected: `"pipeline_status": "completed"` (or `null`) for each SOP.

---

### TASK 3 — Frontend: Update SOPListItem type

**File:** `frontend/src/api/types.ts`
**Lines to edit:** 156–165 (`SOPListItem` interface)

```typescript
export interface SOPListItem {
  id: string
  title: string
  status: SOPStatus
  client_name: string | null
  process_name: string | null
  meeting_date: string | null
  created_at: string
  step_count: number
  pipeline_status: string | null
  pipeline_stage: string | null
}
```

**Verify:** TypeScript picks this up when SOPCard is updated in next task.

---

### TASK 4 — Frontend: Add pipeline badge to SOPCard

**File:** `frontend/src/components/SOPCard.tsx`

**Full replacement** of the component (the card becomes non-`Link` to support action buttons; navigation is handled by the "Open" button):

```tsx
import { useNavigate } from '@tanstack/react-router'
import clsx from 'clsx'
import type { SOPListItem, SOPStatus } from '../api/types'

interface Props {
  sop: SOPListItem
}

const statusConfig: Record<SOPStatus, { label: string; className: string }> = {
  processing: { label: 'Processing', className: 'bg-amber-100 text-amber-800' },
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-800' },
  in_review: { label: 'In Review', className: 'bg-blue-100 text-blue-800' },
  published: { label: 'Published', className: 'bg-green-100 text-green-800' },
  archived: { label: 'Archived', className: 'bg-gray-200 text-gray-600' },
}

function PipelineBadge({ status, stage }: { status: string | null; stage: string | null }) {
  if (!status || status === 'completed') return null
  if (status === 'failed') {
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
        Pipeline failed
      </span>
    )
  }
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
      Processing… {stage ? `(${stage})` : ''}
    </span>
  )
}

export function SOPCard({ sop }: Props) {
  const navigate = useNavigate()
  const status = statusConfig[sop.status] ?? statusConfig.draft

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation()
    navigate({ to: '/sop/$id/procedure', params: { id: sop.id } })
  }

  return (
    <div
      onClick={() => navigate({ to: '/sop/$id/procedure', params: { id: sop.id } })}
      className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow p-6 border border-gray-100 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <h3 className="text-base font-semibold text-gray-900 leading-snug">{sop.title}</h3>
        <span className={clsx('shrink-0 text-xs font-medium px-2.5 py-1 rounded-full', status.className)}>
          {status.label}
        </span>
      </div>
      {sop.client_name && (
        <p className="text-sm text-gray-500 mb-1">{sop.client_name}</p>
      )}
      {sop.process_name && (
        <p className="text-sm text-gray-400 mb-2">{sop.process_name}</p>
      )}

      {/* Pipeline badge — shown when pipeline is active or failed */}
      <div className="mb-3">
        <PipelineBadge status={sop.pipeline_status} stage={sop.pipeline_stage} />
      </div>

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span>{sop.step_count} steps</span>
          {sop.meeting_date && <span>{sop.meeting_date}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpen}
            className="text-xs px-2.5 py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Open →
          </button>
          <button
            disabled
            title="Export not available yet"
            onClick={(e) => e.stopPropagation()}
            className="text-xs px-2.5 py-1 border border-gray-200 rounded text-gray-400 cursor-not-allowed"
          >
            Export PDF
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Verify (browser):**
Open `http://localhost:5173/dashboard`
- Cards show "Open →" and "Export PDF" buttons
- "Export PDF" is greyed out with "Export not available yet" tooltip
- Clicking "Open →" navigates to SOP page
- Clicking the card body also navigates
- Pipeline badge visible for SOPs with active/failed pipelines

---

### TASK 5 — Frontend: Add search bar to Dashboard

**File:** `frontend/src/routes/dashboard.tsx`

**Full replacement:**

```tsx
import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchSOPs, sopKeys } from '../api/client'
import { SOPCard } from '../components/SOPCard'
import { ProtectedRoute } from '../components/ProtectedRoute'

export const Route = createFileRoute('/dashboard')({
  component: () => (
    <ProtectedRoute requiredRole="viewer">
      <Dashboard />
    </ProtectedRoute>
  ),
})

function Dashboard() {
  const [search, setSearch] = useState('')
  const { data: sops, isLoading, error } = useQuery({
    queryKey: sopKeys.all,
    queryFn: fetchSOPs,
  })

  if (isLoading) return <p className="text-gray-500">Loading SOPs...</p>
  if (error) return <p className="text-red-600">Error loading SOPs: {(error as Error).message}</p>
  if (!sops || sops.length === 0) return <p className="text-gray-400">No SOPs found.</p>

  const filtered = sops.filter((s) => {
    const q = search.toLowerCase()
    return (
      s.title.toLowerCase().includes(q) ||
      (s.client_name ?? '').toLowerCase().includes(q) ||
      (s.process_name ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
      <input
        type="text"
        placeholder="Search SOPs…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-4 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
      />
      {filtered.length === 0 ? (
        <p className="text-gray-400">No SOPs match "{search}".</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((sop) => (
            <SOPCard key={sop.id} sop={sop} />
          ))}
        </div>
      )}
    </div>
  )
}
```

**Verify (browser):**
Type in search box → cards filter in real-time across title, client name, process name.
Clear → all cards reappear.

---

### TASK 6 — Extractor: Add LibreOffice to Dockerfile

**File:** `extractor/Dockerfile`
**Edit:** Add `libreoffice` to the apt-get install block (lines 18–23):

```dockerfile
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    curl \
    libreoffice \
    && rm -rf /var/lib/apt/lists/*
```

> ⚠️ LibreOffice adds ~200MB to the image. Build will take ~5 minutes.

**Verify after rebuild (Task 11):**
```bash
docker compose exec sop-extractor libreoffice --version
```
Expected: `LibreOffice 7.x.x.x ...`

---

### TASK 7 — Extractor: Add docxtpl to requirements.txt

**File:** `extractor/requirements.txt`

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
scenedetect[opencv]==0.6.4
imagehash==4.3.1
Pillow==10.4.0
opencv-python-headless==4.10.0.84
numpy==1.26.4
requests==2.32.3
docxtpl>=0.16.0
httpx>=0.27.0
```

> `httpx` added for async-compatible HTTP in the render endpoint if needed; `requests` stays for blocking downloads.

---

### TASK 8 — Create placeholder sop_template.docx

**File to create:** `data/templates/create_placeholder_template.py`

```python
"""
One-time script: generates a minimal sop_template.docx with docxtpl Jinja2 placeholders.
Run once from within the sop-extractor container or with python-docx installed locally.

Usage:
    pip install python-docx
    python data/templates/create_placeholder_template.py
"""
from pathlib import Path
from docx import Document
from docx.shared import Pt

def create():
    doc = Document()

    # Cover info
    doc.add_heading('{{ sop_title }}', level=1)
    for label, var in [
        ('Client', '{{ client_name }}'),
        ('Process', '{{ process_name }}'),
        ('Meeting Date', '{{ meeting_date }}'),
        ('Generated', '{{ generated_date }}'),
        ('Total Steps', '{{ step_count }}'),
    ]:
        p = doc.add_paragraph()
        r = p.add_run(f'{label}: ')
        r.bold = True
        p.add_run(var)

    # Sections (1-4, 6-14)
    doc.add_heading('Sections', level=2)
    doc.add_paragraph('{%- for section in sections %}')
    doc.add_heading('{{ section.section_title }}', level=3)
    doc.add_paragraph('{{ section.content_text | default("") }}')
    doc.add_paragraph('{%- endfor %}')

    # Detailed procedure (Section 5)
    doc.add_heading('Detailed Procedure', level=2)
    doc.add_paragraph('{%- for step in steps %}')
    doc.add_heading('{{ step.sequence }}. {{ step.title }}', level=3)
    doc.add_paragraph('{{ step.description | default("") }}')
    doc.add_paragraph(
        '{%- for sub in step.sub_steps %}\n'
        '• {{ sub }}\n'
        '{%- endfor %}'
    )
    doc.add_paragraph(
        '{%- if step.screenshot %}{{ step.screenshot }}{%- endif %}'
    )
    doc.add_paragraph(
        '{%- for callout in step.callouts %}'
        '{{ callout.callout_number }}. {{ callout.label }}\n'
        '{%- endfor %}'
    )
    doc.add_paragraph('{%- endfor %}')

    out = Path(__file__).parent / 'sop_template.docx'
    doc.save(out)
    print(f'Template created: {out}')

if __name__ == '__main__':
    create()
```

**Run the script:**
```bash
# From the sop-platform root (where ./data is):
pip install python-docx
python "data/templates/create_placeholder_template.py"
```
Expected: `Template created: data/templates/sop_template.docx`

**Verify:**
```bash
ls -lh "data/templates/sop_template.docx"
```
Expected: file exists, size ~6-15 KB.

---

### TASK 9 — Extractor: Create doc_renderer.py

**File to create:** `extractor/app/doc_renderer.py`

```python
"""
SOP Document Renderer
Phase 7a: docxtpl template injection + LibreOffice PDF conversion + Azure Blob upload
"""
import io
import logging
import subprocess
import tempfile
from datetime import date
from pathlib import Path
from typing import Optional

import requests
from docxtpl import DocxTemplate, InlineImage
from docx.shared import Inches

logger = logging.getLogger(__name__)

TEMPLATE_PATH = Path("/data/templates/sop_template.docx")
EXPORTS_DIR = Path("/data/exports")


def render_sop(
    sop_id: str,
    fmt: str,   # 'docx' or 'pdf'
    sop_data: dict,
    azure_blob_base_url: str,  # e.g. https://cnavinfsop.blob.core.windows.net/infsop
    azure_sas_token: str,
) -> dict:
    """
    Render a SOP document from the Word template.

    Returns:
        {"docx_url": str, "pdf_url": str | None}
        URLs are base Azure Blob URLs without SAS (safe for DB storage).
    """
    if not TEMPLATE_PATH.exists():
        raise FileNotFoundError(f"Template not found: {TEMPLATE_PATH}")

    export_dir = EXPORTS_DIR / sop_id
    export_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix=f"sop_render_{sop_id}_") as tmp_str:
        tmp_dir = Path(tmp_str)

        tpl = DocxTemplate(str(TEMPLATE_PATH))

        # Build context
        context = _build_context(tpl, sop_data, tmp_dir)

        # Render
        tpl.render(context)

        # Save rendered docx to exports dir
        docx_filename = f"sop_{sop_id}.docx"
        docx_path = export_dir / docx_filename
        tpl.save(str(docx_path))
        logger.info("Rendered DOCX: %s (%.1f KB)", docx_path, docx_path.stat().st_size / 1024)

        # Upload DOCX
        docx_blob_path = f"exports/{sop_id}/{docx_filename}"
        docx_base_url = f"{azure_blob_base_url}/{docx_blob_path}"
        _upload_blob(docx_path, f"{docx_base_url}?{azure_sas_token}", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        logger.info("Uploaded DOCX → %s", docx_blob_path)

        pdf_base_url: Optional[str] = None

        if fmt == "pdf":
            pdf_filename = f"sop_{sop_id}.pdf"
            pdf_path = _convert_to_pdf(docx_path, export_dir)
            logger.info("PDF created: %s (%.1f KB)", pdf_path, pdf_path.stat().st_size / 1024)

            pdf_blob_path = f"exports/{sop_id}/{pdf_filename}"
            pdf_base_url = f"{azure_blob_base_url}/{pdf_blob_path}"
            _upload_blob(pdf_path, f"{pdf_base_url}?{azure_sas_token}", "application/pdf")
            logger.info("Uploaded PDF → %s", pdf_blob_path)

    return {"docx_url": docx_base_url, "pdf_url": pdf_base_url}


def _build_context(tpl: DocxTemplate, sop_data: dict, tmp_dir: Path) -> dict:
    """Build the Jinja2 context dict for docxtpl."""
    steps_raw = sop_data.get("steps", [])
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
                {
                    "callout_number": c.get("callout_number"),
                    "label": c.get("label", ""),
                }
                for c in (step.get("callouts") or [])
            ],
        })

    sections_ctx = [
        {
            "section_title": s.get("section_title", ""),
            "content_text": s.get("content_text") or "",
        }
        for s in (sop_data.get("sections") or [])
    ]

    today = date.today().strftime("%d %b %Y")

    return {
        "sop_title": sop_data.get("sop_title", ""),
        "client_name": sop_data.get("client_name") or "",
        "process_name": sop_data.get("process_name") or "",
        "meeting_date": sop_data.get("meeting_date") or "",
        "generated_date": today,
        "step_count": sop_data.get("step_count", len(steps_raw)),
        "steps": steps_ctx,
        "sections": sections_ctx,
    }


def _download_inline_image(
    tpl: DocxTemplate,
    url: str,
    tmp_dir: Path,
    step_id: str,
) -> Optional[InlineImage]:
    """Download a screenshot and return an InlineImage object for docxtpl."""
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        img_path = tmp_dir / f"screenshot_{step_id}.png"
        img_path.write_bytes(resp.content)
        return InlineImage(tpl, str(img_path), width=Inches(5.5))
    except Exception as exc:
        logger.warning("Could not download screenshot for step %s: %s", step_id, exc)
        return None


def _convert_to_pdf(docx_path: Path, output_dir: Path) -> Path:
    """Convert a .docx to .pdf using LibreOffice headless."""
    cmd = [
        "libreoffice",
        "--headless",
        "--convert-to", "pdf",
        "--outdir", str(output_dir),
        str(docx_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f"LibreOffice conversion failed: {result.stderr[-500:]}")

    pdf_path = output_dir / docx_path.with_suffix(".pdf").name
    if not pdf_path.exists():
        raise RuntimeError(f"LibreOffice ran successfully but PDF not found at {pdf_path}")
    return pdf_path


def _upload_blob(local_path: Path, sas_url: str, content_type: str) -> None:
    """PUT a file to Azure Blob Storage using a SAS URL."""
    data = local_path.read_bytes()
    resp = requests.put(
        sas_url,
        data=data,
        headers={
            "x-ms-blob-type": "BlockBlob",
            "Content-Type": content_type,
        },
        timeout=120,
    )
    resp.raise_for_status()
```

**Verify:** Import check only (no rebuild yet):
```bash
# On host — syntax check only
python -c "
import ast, pathlib
src = pathlib.Path('extractor/app/doc_renderer.py').read_text()
ast.parse(src)
print('Syntax OK')
"
```
Expected: `Syntax OK`

---

### TASK 10 — Extractor: Add POST /api/render-doc endpoint

**File:** `extractor/app/main.py`
**Add the following models and endpoint** just before the `# ── /extract ──` section (before line 182):

**New Pydantic models** (insert after line 115, after `class ExtractResponse`):
```python
# ── /api/render-doc ───────────────────────────────────────────────────────────

class RenderDocRequest(BaseModel):
    sop_id: str
    format: str = "docx"          # 'docx' or 'pdf'
    azure_blob_base_url: str      # e.g. https://cnavinfsop.blob.core.windows.net/infsop
    azure_sas_token: str
    sop_data: dict                # Full SOP payload — see doc_renderer._build_context


class RenderDocResponse(BaseModel):
    docx_url: str                 # Azure base URL (no SAS)
    pdf_url: Optional[str] = None
```

**New import** — `Optional` is not yet imported. Line 13 currently reads:
```python
from typing import Any
```
Change it to:
```python
from typing import Any, Optional
```

**New endpoint** — insert after the `/test-data-volume` endpoint (after line 178):
```python
# ── /api/render-doc ───────────────────────────────────────────────────────────

@app.post("/api/render-doc", response_model=RenderDocResponse, tags=["export"])
async def render_doc(req: RenderDocRequest) -> RenderDocResponse:
    """
    Render a SOP DOCX (and optionally PDF) from the Word template.
    Called internally by sop-api only — not exposed externally.
    Template must exist at /data/templates/sop_template.docx.
    """
    from .doc_renderer import render_sop  # local import avoids startup failure if template missing

    try:
        result = await asyncio.to_thread(
            render_sop,
            sop_id=req.sop_id,
            fmt=req.format,
            sop_data=req.sop_data,
            azure_blob_base_url=req.azure_blob_base_url,
            azure_sas_token=req.azure_sas_token,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Render failed for sop_id=%s", req.sop_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return RenderDocResponse(docx_url=result["docx_url"], pdf_url=result["pdf_url"])
```

**Verify:** Syntax check:
```bash
python -c "
import ast, pathlib
src = pathlib.Path('extractor/app/main.py').read_text()
ast.parse(src)
print('Syntax OK')
"
```

---

### TASK 11 — Rebuild extractor and smoke-test

```bash
cd "d:/CloudNavision/1. Projects/SOP/SOP Automation System/sop-platform"
docker compose build sop-extractor
docker compose up -d sop-extractor
docker compose logs sop-extractor --tail=20
```

Expected logs end with: `Application startup complete.`

**Smoke test — health:**
```bash
curl -s http://localhost:8001/health | python -m json.tool
```
Expected: `{"status": "ok", ...}`

**Smoke test — LibreOffice:**
```bash
docker compose exec sop-extractor libreoffice --version
```
Expected: `LibreOffice 7.x.x.x ...`

**Smoke test — template check (after template is created in Task 8):**
```bash
curl -s http://localhost:8001/test-data-volume | python -m json.tool
```
Expected: `"templates": true`

---

### TASK 12 — API: Add ExportResponse schema + public with_sas alias

**File:** `api/app/schemas.py`
**Add at the end of file** (after line 259):

```python

class ExportResponse(BaseModel):
    download_url: str   # Azure URL with SAS token appended
    filename: str
    format: str         # 'docx' or 'pdf'


# Public alias so routes can import this without referencing a private symbol
with_sas = _with_sas
```

> Note: `ExportHistory` ORM model already exists in `models.py` at line 463 with all required columns — **no changes to `models.py` are needed**.

---

### TASK 13 — API: Create exports.py route

**File to create:** `api/app/routes/exports.py`

```python
"""
Phase 7a: SOP Export endpoint
POST /api/sops/{id}/export?format=docx|pdf
"""
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from sqlalchemy import select

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

    # Sort before serialising
    sop.steps.sort(key=lambda s: s.sequence)
    sop.sections.sort(key=lambda s: s.display_order)

    # 2. Serialize with SAS-appended URLs
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
            }
            for sec in sop_detail.sections
        ],
    }

    # Parse azure_blob_base_url into base URL (strip SAS if present)
    azure_blob_base_url = settings.azure_blob_base_url
    azure_sas_token = settings.azure_blob_sas_token

    render_payload = {
        "sop_id": str(sop_id),
        "format": fmt,
        "azure_blob_base_url": azure_blob_base_url,
        "azure_sas_token": azure_sas_token,
        "sop_data": sop_data,
    }

    # 4. Call extractor
    extractor_url = settings.extractor_url
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(f"{extractor_url}/api/render-doc", json=render_payload)
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

    # 6. Return download URL with SAS
    download_url = with_sas(file_url_base) or file_url_base
    filename = f"sop_{sop_id}.{fmt}"

    return ExportResponse(
        download_url=download_url,
        filename=filename,
        format=fmt,
    )
```

**Verify:** Syntax check:
```bash
python -c "
import ast, pathlib
src = pathlib.Path('api/app/routes/exports.py').read_text()
ast.parse(src)
print('Syntax OK')
"
```

---

### TASK 14 — API: Register exports router in main.py

**File:** `api/app/main.py`
**Edit line 24** — add `exports` to the routes import:
```python
from app.routes import sops, steps, sections, auth, users, exports
```

**Add after line 51** (after `app.include_router(users.router)`):
```python
# ── Export Routes (Phase 7a) ──────────────────────────────────
app.include_router(exports.router)
```

**Rebuild and verify:**
```bash
cd "d:/CloudNavision/1. Projects/SOP/SOP Automation System/sop-platform"
docker compose build sop-api
docker compose up -d sop-api
docker compose logs sop-api --tail=20
```
Expected: `Application startup complete.`

```bash
curl -s http://localhost:8000/openapi.json | python -m json.tool | grep "export"
```
Expected: `"/api/sops/{sop_id}/export"` in the paths.

---

### TASK 15 — Frontend: Add exportSOP to client.ts

**File:** `frontend/src/api/client.ts`
**Add after line 53** (after `fetchWatchlist`):
```typescript
export interface ExportResponse {
  download_url: string
  filename: string
  format: string
}

export async function exportSOP(id: string, format: 'docx' | 'pdf'): Promise<ExportResponse> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}/api/sops/${id}/export?format=${format}`, {
    method: 'POST',
    headers,
  })
  if (!res.ok) {
    throw new Error(`Export failed: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<ExportResponse>
}
```

---

### TASK 16 — Frontend: Wire export buttons in SOPPageHeader

**File:** `frontend/src/components/SOPPageHeader.tsx`
**Full replacement:**

```tsx
import { useState } from 'react'
import type { SOPDetail } from '../api/types'
import { exportSOP } from '../api/client'

interface Props {
  sop: SOPDetail
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function SOPPageHeader({ sop }: Props) {
  const [toast, setToast] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'docx' | 'pdf' | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  function handleShare() {
    navigator.clipboard.writeText(window.location.href)
    showToast('Link copied!')
  }

  async function handleExport(format: 'docx' | 'pdf') {
    setExporting(format)
    showToast('Generating…')
    try {
      const { download_url, filename } = await exportSOP(sop.id, format)
      const a = document.createElement('a')
      a.href = download_url
      a.download = filename
      a.click()
      showToast('Download started!')
    } catch {
      showToast('Export failed')
    } finally {
      setExporting(null)
    }
  }

  const dateStr = sop.meeting_date
    ? formatDate(sop.meeting_date)
    : formatDate(sop.created_at)

  const meta = [sop.client_name, 'v1.x', dateStr ? `Updated ${dateStr}` : null]
    .filter(Boolean)
    .join(' | ')

  return (
    <div className="flex items-start justify-between pb-4 border-b border-gray-100 mb-4 shrink-0">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{sop.title}</h1>
        {meta && <p className="text-sm text-gray-500 mt-0.5">{meta}</p>}
      </div>

      <div className="flex items-center gap-2 shrink-0 mt-1">
        <button
          onClick={() => handleExport('docx')}
          disabled={exporting !== null}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {exporting === 'docx' ? 'Generating…' : 'Export DOCX'}
        </button>
        <button
          onClick={() => handleExport('pdf')}
          disabled={exporting !== null}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {exporting === 'pdf' ? 'Generating…' : 'Export PDF'}
        </button>
        <button
          onClick={handleShare}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Share link
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
```

**Verify (browser — after frontend rebuild):**
1. Open a SOP procedure page
2. Click "Export DOCX" → toast "Generating…" → browser download starts
3. Click "Export PDF" → toast "Generating…" → ~15s → browser download starts
4. File opens in Word / PDF viewer correctly

---

### TASK 17 — Frontend: Enable "Export PDF" on SOPCard

**File:** `frontend/src/components/SOPCard.tsx`
**Only change:** Replace the disabled Export PDF button with a wired one.

Find the disabled button (added in Task 4):
```tsx
          <button
            disabled
            title="Export not available yet"
            onClick={(e) => e.stopPropagation()}
            className="text-xs px-2.5 py-1 border border-gray-200 rounded text-gray-400 cursor-not-allowed"
          >
            Export PDF
          </button>
```

Replace with:
```tsx
          <button
            onClick={async (e) => {
              e.stopPropagation()
              try {
                const { download_url, filename } = await exportSOP(sop.id, 'pdf')
                const a = document.createElement('a')
                a.href = download_url
                a.download = filename
                a.click()
              } catch {
                // silent — user can retry from SOP page with full toast feedback
              }
            }}
            className="text-xs px-2.5 py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Export PDF
          </button>
```

**Add import** at top of SOPCard.tsx:
```tsx
import { exportSOP } from '../api/client'
```

---

### TASK 18 — Rebuild frontend + end-to-end smoke test

```bash
cd "d:/CloudNavision/1. Projects/SOP/SOP Automation System/sop-platform"
docker compose build sop-frontend
docker compose up -d sop-frontend
```

**Browser checklist:**
- [ ] Dashboard loads, search bar filters cards
- [ ] Cards show pipeline badges where applicable
- [ ] "Open →" button navigates, "Export PDF" wired
- [ ] SOP page header shows "Export DOCX" / "Export PDF" (enabled)
- [ ] Export DOCX → download triggered, file opens in Word
- [ ] Export PDF → download triggered (~15s), file opens in PDF viewer

---

### TASK 19 — Cloudflare ZTNA (no code)

All steps are in the Cloudflare Zero Trust dashboard. No code changes.

**Step 1 — Add public hostname:**
Zero Trust → Networks → Tunnels → [existing tunnel] → Public Hostnames → Add:
- Subdomain: `sop`
- Domain: `cloudnavision.com`
- Service: `http://sop-frontend:5173`

**Step 2 — Create Access application:**
Zero Trust → Access → Applications → Add:
- Name: `SOP Platform`
- Domain: `sop.cloudnavision.com`
- Policy: Allow — Email ends in `@keells.com` OR `@cloudnavision.com`

**Step 3 — Update `.env`:**
```env
VITE_API_URL=https://soptest.cloudnavision.com
CORS_ORIGINS=["https://sop.cloudnavision.com","http://localhost:5173","http://localhost:3000"]
```

**Step 4 — Rebuild frontend with new VITE_API_URL:**
```bash
docker compose build sop-frontend && docker compose up -d sop-frontend
```

**Verify:**
Open `https://sop.cloudnavision.com` → Cloudflare login prompt → dashboard loads.

---

## 3. Commit Plan

| After Task(s) | Commit message |
|---|---|
| 1–2 | `feat(api): add pipeline_status/stage to SOPListItem` |
| 3–5 | `feat(dashboard): pipeline badges, search bar, card actions` |
| 6–7 | `build(extractor): add LibreOffice + docxtpl to image` |
| 8 | `chore: add placeholder sop_template.docx and generator script` |
| 9–10 | `feat(extractor): add /api/render-doc endpoint (docxtpl + LibreOffice)` |
| 11 | **Verification only — no files committed.** Gate between extractor build and API work. |
| 12–14 | `feat(api): POST /api/sops/{id}/export endpoint` |
| 15–17 | `feat(frontend): wire export buttons in SOPPageHeader and SOPCard` |
| 18 | **Verification only — no files committed.** End-to-end smoke test gate. |
| 19 | `chore: cloudflare ZTNA — frontend public hostname + access policy` |

---

## 4. Known Gotchas

| # | Gotcha | Solution |
|---|---|---|
| 1 | `PipelineRun.status` is a SQLAlchemy enum — returns `PipelineStatus` enum object, not string | Call `.value` in `SOPListItem` constructor: `str(row[2].value) if row[2] is not None else None` |
| 2 | LibreOffice build adds ~5 min to `docker build sop-extractor` | Build once, don't rebuild unless dependencies change |
| 3 | LibreOffice PDF output file is named `<docx_stem>.pdf` — must use `docx_path.with_suffix(".pdf").name` | Already handled in `_convert_to_pdf` |
| 4 | `docxtpl` Jinja2 tags in `.docx` must be in paragraph runs that don't span multiple XML runs | If template breaks, open in Word and re-type the `{% %}` tags to keep them in a single run |
| 5 | `_with_sas` is a module-level function in `schemas.py` — importing it in `exports.py` requires: `from app.schemas import _with_sas` | Already in the exports.py code above |
| 6 | Azure SAS token in `.env` may have `%3D` URL-encoding — use as-is; Azure accepts both forms | No change needed |
| 7 | `data/templates/` directory must exist before running the placeholder script | Already created by extractor's `DATA_SUBDIRS` initialization on startup |

