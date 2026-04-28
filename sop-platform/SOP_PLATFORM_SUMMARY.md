# SOP Automation Platform — Build Summary

**Client:** Starboard Hotels  
**Stack:** React · FastAPI · PostgreSQL (Supabase) · n8n · Gemini 2.5 Flash · Azure Blob · Docker

---

## What It Does

Converts a Microsoft Teams KT (Knowledge Transfer) recording into a fully structured SOP document in ~4 minutes — automatically.

---

## Pipeline (Backend — n8n Workflows)

| Step | Workflow | What Happens |
|------|----------|--------------|
| 1 | Workflow 1 | SharePoint → download video → Gemini transcribes audio + detects screen share periods |
| 2 | Workflow 2b | FFmpeg crops video to screen share area → PySceneDetect extracts key frames → upload PNGs to Azure Blob |
| 3 | Workflow 3 | Gemini + GCP Vision OCR analyses each screenshot → detects UI elements → generates numbered callout annotations |
| 4 | Workflow 5b | Gemini generates step titles, descriptions, sub-steps, and all Overview sections (Purpose, Risks, Comm Matrix, etc.) |

---

## Platform Features (UI)

### Dashboard
- List of all SOPs with status badges (Processing / Draft / In Review / Published / Archived)
- Pipeline stage indicator, tags, client/process name
- Search, filter, create new SOP

### Procedure Tab
- Side-by-side layout: video player · transcript · step detail
- Annotated screenshots with numbered pentagon/arrow callout badges
- Step descriptions + sub-steps
- Video seek sync — click a step to jump to that timestamp
- Approve / delete steps (Editor/Admin)
- Rename steps inline

### Overview Tab
- Auto-generated sections: Purpose, Input, Process Description, Output, Risks, Training Prerequisites, Software & Access, Communication Matrices, Quality Parameters, etc.
- Tables and lists rendered from Gemini output

### Process Map Tab
- Drag-and-drop swimlane builder
- Assign steps to lanes (departments/roles)
- Mark decision steps (diamond shape)
- Viewers get read-only preview

### Annotation Editor (Editor/Admin only)
- Full-screen Konva.js canvas
- Drag callout badges to reposition on screenshot
- Rotate callouts (±45° increments)
- Delete callouts
- Add new callouts by clicking on the screenshot
- Highlight boxes (coloured overlays) for key UI areas
- Save → re-renders annotated PNG via Pillow and uploads to Azure Blob
- Colour coding: green = OCR match, amber = Gemini only, blue = repositioned

### Export
- **Generate Word (.docx)** — full SOP document with:
  - Cover page, table of contents
  - All Overview sections (lists as bullets, tables with orange headers)
  - Process map diagram
  - Detailed procedure with annotated screenshots + callout references
- **Generate PDF** — same via LibreOffice headless conversion
- Download directly from UI

### Role-Based Access
- **Viewer** — read-only: Procedure, Overview, Process Map
- **Editor** — + annotation editing, step management, export, Metrics, History tabs
- **Admin** — + user management, all editor permissions

---

## Key Technical Decisions

- **Coordinates:** Callouts stored as raw pixels (not %) — natural mapping to image dimensions
- **Annotation rendering:** Pillow draws pentagon/arrow badges with 2D rotation matrix
- **Section content:** Lists → RichText bullet points; Tables → python-docx tables injected post-render (avoids docxtpl Subdoc XML corruption)
- **Cache busting:** `updated_at` timestamp appended to annotated screenshot URLs so browser always fetches fresh after edits
- **Screen share crop:** Gemini detects content-only bounding box (excludes webcam participant strip)
- **Export timeout:** 300s httpx timeout for large SOPs (26 steps × screenshot downloads)

---

## Infrastructure

```
Docker Compose:
  sop-frontend   (React/Vite)        → localhost:5173
  sop-api        (FastAPI)           → localhost:8000
  sop-extractor  (FastAPI + FFmpeg)  → internal:8001
  sop-tunnel     (Cloudflare)        → soptest.cloudnavision.com → extractor

Storage:  Azure Blob (cnavinfsop / infsop container)
Database: Supabase PostgreSQL
Auth:     Supabase Auth (JWT)
AI:       Gemini 2.5 Flash (Gemini File API + GCP Vision OCR)
```
