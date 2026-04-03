# Phase 7: Exports + Polish

**Objective:** Make the platform production-ready — DOCX/PDF document export, dashboard polish (pipeline status, search, card actions), and Cloudflare ZTNA for external access.

**Status: ✅ Complete (7c deferred)**

**Detailed implementation plan:** [`docs/superpowers/plans/2026-04-03-phase7-exports-polish.md`](../../docs/superpowers/plans/2026-04-03-phase7-exports-polish.md)
**Design spec:** [`docs/superpowers/specs/2026-04-03-phase7-exports-polish-design.md`](../../docs/superpowers/specs/2026-04-03-phase7-exports-polish-design.md)

---

## Sub-Parts

| Sub-Part | File | Description | Status |
|----------|------|-------------|--------|
| 7b | [7b_dashboard_polish.md](7b_dashboard_polish.md) | Pipeline status badges, search bar, SOPCard action buttons | ✅ Complete |
| 7a | [7a_docx_pdf_export.md](7a_docx_pdf_export.md) | docxtpl template render, LibreOffice PDF, Azure upload, export API | ✅ Complete |
| 7c | [7c_cloudflare_ztna.md](7c_cloudflare_ztna.md) | Frontend exposed via sop.cloudnavision.com with Access policy | ⬜ Deferred |

---

## Architecture

```
7b — Dashboard (frontend only + small backend change)
  GET /api/sops → pipeline_status + pipeline_stage via correlated subquery
  Dashboard: search bar (client-side filter) + SOPCard badges + action buttons

7a — Export pipeline
  SOPPageHeader (Export DOCX / Export PDF)
      → POST /api/sops/{id}/export?format=docx|pdf   (sop-api)
      → POST http://sop-extractor:8001/api/render-doc  (internal)
      → sop-extractor: docxtpl render + LibreOffice → Azure Blob upload
      → sop-api: save export_history → return SAS download URL
      → Frontend: browser download triggered

7c — Cloudflare ZTNA (deferred)
  Cloudflare Tunnel public hostname: sop.cloudnavision.com → sop-frontend:5173
  Access policy: @keells.com or @cloudnavision.com emails
  .env: VITE_API_URL + CORS_ORIGINS updated → frontend rebuild
```

---

## Key Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | docxtpl over python-docx hardcoded styling | Template decoupled from code — TL designs in Word, code injects data |
| 2 | LibreOffice in sop-extractor (not sop-api) | ./data volume is only on extractor; all file I/O must go through it |
| 3 | No n8n workflow for export | User-triggered, synchronous (~15s), within HTTP timeout — no queue needed |
| 4 | export_history table pre-existed in 001_initial_schema.sql | No migration needed — table and ORM model already defined |
| 5 | 7c deferred | No code changes needed; requires Cloudflare dashboard access (TL owns) |
