# 7a: DOCX/PDF Export

**Status: ✅ Complete — 2026-04-03**

## Files Changed

| File | Action |
|------|--------|
| `extractor/Dockerfile` | Added `libreoffice` to apt-get install |
| `extractor/requirements.txt` | Added `docxtpl>=0.16.0`, `httpx>=0.27.0` |
| `extractor/app/doc_renderer.py` | Created — docxtpl render + LibreOffice PDF + Azure upload |
| `extractor/app/main.py` | Added `RenderDocRequest`, `RenderDocResponse` models + `POST /api/render-doc` endpoint |
| `data/templates/sop_template.docx` | Created — placeholder Word template with Jinja2 placeholders |
| `data/templates/create_placeholder_template.py` | Created — one-time script to regenerate the template |
| `api/app/schemas.py` | Added `ExportResponse` schema + `with_sas` public alias |
| `api/app/routes/exports.py` | Created — `POST /api/sops/{id}/export` full implementation |
| `api/app/main.py` | Registered `exports.router` |
| `frontend/src/api/client.ts` | Added `exportSOP(id, format)` function + `ExportResponse` interface |
| `frontend/src/components/SOPPageHeader.tsx` | Wired Export DOCX / Export PDF buttons with loading state |

## Template Contract
Placeholder template at `data/templates/sop_template.docx` uses docxtpl Jinja2 syntax.
TL can replace with branded version — no code changes needed (mounted via `./data:/data` volume).

## Export Flow
```
User clicks Export DOCX/PDF
  → exportSOP(id, format) in client.ts
  → POST /api/sops/{id}/export?format=docx|pdf
  → sop-api fetches SOP + serializes (SAS tokens on URLs)
  → POST http://sop-extractor:8001/api/render-doc (120s timeout)
  → extractor: docxtpl.render() → save .docx → LibreOffice → upload both to Azure
  → extractor returns { docx_url, pdf_url }
  → sop-api saves to export_history → returns { download_url (with SAS), filename, format }
  → frontend: <a download> click triggers browser download
```

## Notes
- `export_history` table pre-existed in `schema/001_initial_schema.sql` — no migration needed
- LibreOffice PDF conversion takes ~10–15s for a typical SOP
- Screenshots downloaded by extractor from Azure (SAS URLs in the payload from sop-api)
