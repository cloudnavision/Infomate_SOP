# Phase 7: Exports + Polish — Design Spec
**Date:** 2026-04-03
**Status:** Pending approval
**Sub-projects:** 7b (Dashboard Polish) → 7a (DOCX/PDF Export) → 7c (Cloudflare ZTNA)

---

## Sub-project 7b — Dashboard Polish

### Goal
Make the dashboard production-ready: pipeline status visibility, search, and per-card export actions.

### 7b-1: Pipeline status on SOPCard

**Backend change — `GET /api/sops`:**
Add `pipeline_status` and `pipeline_stage` to `SOPListItem` by joining the latest `pipeline_runs` row per SOP.

Add a correlated subquery (same pattern as existing `step_count_subq`).
In the existing query the row tuple is `(SOP, step_count)` — i.e. `row[0]=SOP`, `row[1]=step_count`.
After adding the two new subqueries the tuple becomes `(SOP, step_count, pipeline_status, pipeline_stage)`.
The `SOPListItem` constructor call must be updated to include `pipeline_status=row[2], pipeline_stage=row[3]`.
```python
# Latest pipeline run status per SOP
latest_run_subq = (
    select(PipelineRun.status)
    .where(PipelineRun.sop_id == SOP.id)
    .order_by(PipelineRun.started_at.desc())
    .limit(1)
    .correlate(SOP)
    .scalar_subquery()
)
latest_stage_subq = (
    select(PipelineRun.current_stage)
    .where(PipelineRun.sop_id == SOP.id)
    .order_by(PipelineRun.started_at.desc())
    .limit(1)
    .correlate(SOP)
    .scalar_subquery()
)
```

**Schema change — `SOPListItem`:**
```python
pipeline_status: Optional[str] = None   # latest pipeline_runs.status
pipeline_stage: Optional[str] = None    # latest pipeline_runs.current_stage
```

**Frontend — `SOPListItem` type:**
```ts
pipeline_status: string | null
pipeline_stage: string | null
```

**`SOPCard` badge logic:**
```
pipeline_status == 'failed'     → red badge "Pipeline failed"
pipeline_status not in          → blue badge "Processing…" + stage label
  ['completed', null]
pipeline_status == 'completed'  → no badge (SOP status drives UI)
or null
```

Badge renders as a small pill below the SOP status badge. Does not replace it.

---

### 7b-2: Search bar

Client-side only — no API changes. Filters the already-loaded `sops` array.

**Placement:** Above the grid in `dashboard.tsx`.

**Filters across:** `sop.title`, `sop.client_name`, `sop.process_name` (case-insensitive includes).

**State:** Local `useState<string>` in `Dashboard` component.

```tsx
const filtered = sops.filter((s) => {
  const q = search.toLowerCase()
  return (
    s.title.toLowerCase().includes(q) ||
    (s.client_name ?? '').toLowerCase().includes(q) ||
    (s.process_name ?? '').toLowerCase().includes(q)
  )
})
```

---

### 7b-3: SOPCard action buttons

Add two small action buttons to each card (visible always, not hover-only — simpler, more accessible):

- **Open →** existing navigate behaviour (whole card is still clickable)
- **Export PDF** → calls `POST /api/sops/{id}/export?format=pdf` (implemented in 7a). Disabled with tooltip "Export not available yet" until 7a is complete. After 7a: triggers download.

The card's click-to-navigate behaviour is preserved. Action buttons use `e.stopPropagation()` to prevent navigation when clicked.

---

## Sub-project 7a — DOCX/PDF Export

### Goal
User clicks Export DOCX or Export PDF → formatted SOP document downloads automatically.

### Architecture

> **Volume constraint:** `./data:/data` is mounted on **sop-extractor only** (not sop-api).
> sop-api must never read or write to the filesystem. All file I/O (template loading,
> screenshot download, docx/pdf generation, upload) is delegated to sop-extractor.
> sop-api's role is: fetch SOP data from Supabase → POST payload to extractor → receive URLs → save to DB.

```
SOPPageHeader (Export DOCX / Export PDF button)
    → POST /api/sops/{id}/export?format=docx|pdf
    → sop-api: fetch full SOP from Supabase, build render payload
    → POST http://sop-extractor:8001/api/render-doc  (internal)
    → sop-extractor:
        1. Load sop_template.docx from /data/templates/
        2. Download annotated screenshots from Azure Blob (httpx)
        3. docxtpl.DocxTemplate.render(context)
        4. Save filled .docx to /data/exports/{sop_id}/
        5. If PDF: subprocess LibreOffice --headless --convert-to pdf
        6. Upload both files to Azure Blob: exports/{sop_id}/
        7. Return { docx_url, pdf_url }
    → sop-api: save to export_history, return download URL with SAS
    → Frontend: window.open(url) triggers browser download
```

### Template contract

The Word template (`sop_template.docx`) uses `docxtpl` Jinja2 syntax.

**Scalar variables:**
```
{{ sop_title }}
{{ client_name }}
{{ process_name }}
{{ meeting_date }}
{{ generated_date }}
{{ step_count }}
```

**Steps loop (Section 5 — Detailed Procedure):**
```
{% for step in steps %}
  {{ step.sequence }}. {{ step.title }}
  {{ step.description }}
  {% for sub in step.sub_steps %}• {{ sub }}{% endfor %}
  {% if step.screenshot %}{{ step.screenshot }}{% endif %}
  {% for callout in step.callouts %}
    {{ callout.callout_number }}. {{ callout.label }}
  {% endfor %}
{% endfor %}
```
`step.screenshot` is a `docxtpl.InlineImage` object — docxtpl embeds it inline.

**Sections loop (Sections 1–4, 6–14):**
```
{% for section in sections %}
  {{ section.section_title }}
  {{ section.content_text }}
  {% if section.content_json %}
    (table rendered via docxtpl RichText or separate table loop)
  {% endif %}
{% endfor %}
```

**Template file location:** `/data/templates/sop_template.docx`
Mounted via the existing `./data:/data` volume in docker-compose.yml.
TL drops the template into `sop-platform/data/templates/` — no rebuild needed.

**Fallback template:** A minimal `.docx` template is committed to the repo at `data/templates/sop_template.docx` with basic formatting. TL replaces it with the branded version without any code changes.

---

### New API endpoint

**`POST /api/sops/{id}/export`**
- Query param: `format=docx` (default) or `format=pdf`
- Auth: `require_viewer` (any logged-in user can export)
- Returns: `{ download_url: string, filename: string, format: string }`
- On error: 503 if extractor unavailable, 404 if SOP not found

---

### New extractor endpoint

**`POST /api/render-doc`**
- Called internally by sop-api only (not exposed externally)
- Body: full SOP data payload (JSON)
- Returns: `{ docx_url: string, pdf_url: string }`
- Timeout: 60s (LibreOffice conversion can be slow)

---

### New DB table — `export_history`

```sql
CREATE TABLE export_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sop_id          UUID NOT NULL REFERENCES sops(id) ON DELETE CASCADE,
    format          TEXT NOT NULL CHECK (format IN ('docx', 'pdf')),
    file_url        TEXT NOT NULL,
    file_size_bytes BIGINT,
    sop_version     INTEGER,
    generated_by    UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Migration added as `schema/003_export_history.sql`.

---

### New Python dependency

`extractor/requirements.txt`: add `docxtpl>=0.16.0`

---

### Frontend changes

**`SOPPageHeader.tsx`:** Wire Export DOCX and Export PDF buttons.

```tsx
async function handleExport(format: 'docx' | 'pdf') {
  showToast('Generating…')
  try {
    const { download_url, filename } = await exportSOP(sop.id, format)  // from client.ts — uses API_BASE
    const a = document.createElement('a')
    a.href = download_url
    a.download = filename
    a.click()
    showToast('Download started!')
  } catch {
    showToast('Export failed')
  }
}
```

`exportSOP` in `client.ts` must use `API_BASE` (not a relative `/api/...` URL) so it works in dev
(frontend :5173, API :8000) and production alike.

Remove `disabled` attribute from both export buttons.

---

### Files changed — 7a

| File | Action |
|---|---|
| `extractor/app/doc_renderer.py` | Create — docxtpl + LibreOffice render logic |
| `extractor/app/main.py` | Add `POST /api/render-doc` endpoint |
| `extractor/requirements.txt` | Add `docxtpl>=0.16.0` |
| `data/templates/sop_template.docx` | Create — minimal placeholder template |
| `api/app/routes/exports.py` | Create — `POST /api/sops/{id}/export` |
| `api/app/main.py` | Register exports router |
| `api/app/models.py` | Add `ExportHistory` ORM model |
| `api/app/schemas.py` | Add `ExportResponse` schema |
| `schema/003_export_history.sql` | Create — migration SQL |
| `frontend/src/components/SOPPageHeader.tsx` | Wire export buttons |
| `frontend/src/api/client.ts` | Add `exportSOP(id, format)` function |

---

## Sub-project 7c — Cloudflare ZTNA

### Goal
Frontend accessible externally via `sop.cloudnavision.com` with Cloudflare Zero Trust access control. Zero code changes.

### Steps (all in Cloudflare Zero Trust dashboard)

**1. Add public hostname to existing tunnel**
Cloudflare Zero Trust → Networks → Tunnels → select existing tunnel → Public Hostnames → Add:
```
Subdomain: sop
Domain:    cloudnavision.com
Service:   http://sop-frontend:5173
```

**2. Create Cloudflare Access application**
Zero Trust → Access → Applications → Add:
```
Name:     SOP Platform
Domain:   sop.cloudnavision.com
Policy:   Allow — Email ends in @keells.com OR @cloudnavision.com
          (or specific Azure AD group if configured)
```

**3. Update `.env` for production**
```
VITE_API_URL=https://soptest.cloudnavision.com
CORS_ORIGINS=["https://sop.cloudnavision.com","http://localhost:5173","http://localhost:3000"]
```

**4. Rebuild frontend** with new `VITE_API_URL` baked in:
```bash
docker compose build sop-frontend && docker compose up -d sop-frontend
```

### No code changes required.

---

## Implementation order

```
7b-1: Pipeline status on SOPCard (backend + frontend)
7b-2: Search bar (frontend only)
7b-3: SOPCard action buttons (frontend only — disabled until 7a)
    ↓
7a-1: export_history DB migration
7a-2: doc_renderer.py + /api/render-doc (extractor)
7a-3: /api/sops/{id}/export (api)
7a-4: Wire SOPPageHeader export buttons (frontend)
7a-5: Create placeholder sop_template.docx
    ↓
7c:   Cloudflare dashboard config + .env update + rebuild
```

---

## Out of scope

- Export history UI (list of past exports per SOP)
- Email delivery of exported documents
- Custom template per client (Phase 8+)
- Mermaid diagram rendering in DOCX (Phase 8+)
- Cloudflare Access with Azure AD SSO (can be added later — email policy sufficient for now)
