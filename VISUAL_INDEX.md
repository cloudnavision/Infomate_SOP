# SOP Automation Platform — Visual Design Index
## All diagrams and mockups from brainstorming session

---

### 1. SOP Automation Pipeline Architecture
- **Type**: SVG flowchart
- **Shows**: End-to-end pipeline from MP4 upload → n8n extraction → React review → n8n assembly → final output
- **Key insight**: Three-stage architecture with human-in-the-loop review between two automated stages

### 2. Annotation Accuracy — Three-Stage Flow
- **Type**: SVG structural diagram
- **Shows**: The three sub-problems of annotation: WHAT to annotate (semantic), WHERE to place it (spatial), HOW to render it (mechanical)
- **Key insight**: Problem 2 (spatial precision) is where the biggest accuracy gap lives

### 3. Hybrid Annotation Matching Flow
- **Type**: Interactive HTML widget
- **Shows**: Side-by-side comparison of Gemini semantic output vs Google Vision OCR output, with the matched annotation result
- **Key insight**: Gemini identifies elements by name, OCR provides pixel-precise coordinates, matching logic connects them

### 4. React Callout Editor Mockup
- **Type**: Interactive HTML mockup
- **Shows**: The SOP review interface with screenshot, draggable callout markers (green/amber/red confidence), sidebar with editable labels, and transcript context
- **Key insight**: Reviewer workload is proportional to AI uncertainty — green markers need a glance, red markers need manual adjustment

### 5. Teams Recording Composition Challenge
- **Type**: SVG diagram
- **Shows**: Why Teams recordings are hard for scene detection — gallery view vs screen share, false trigger sources (speaker switch, webcam motion, layout change, control bar, loading frames)
- **Key insight**: Naive FFmpeg produces ~40 frames, only ~5 are useful. Need multi-stage filtering.

### 6. FFmpeg vs PySceneDetect Comparison
- **Type**: SVG comparison diagram
- **Shows**: Fixed threshold (FFmpeg) vs adaptive detection (PySceneDetect), and the threshold dilemma (low=noise, medium=misses scrolls, high=misses 40%)
- **Key insight**: PySceneDetect adaptive mode eliminates the single-threshold tradeoff

### 7. Docker Service Architecture
- **Type**: SVG structural diagram
- **Shows**: The frame-extractor Docker container with its 5 internal stages, connected to n8n via webhook
- **Key insight**: Single container, single endpoint, async processing with webhook callback

### 8. Cost Breakdown — 60-Minute Meeting
- **Type**: Interactive HTML widget with model selector
- **Shows**: Itemised cost per pipeline stage, toggleable between Gemini 2.5 Flash ($0.43/meeting) and Gemini 2.0 Flash ($0.16/meeting)
- **Key insight**: Transcription accounts for ~80% of cost; total is under $0.50/meeting

### 9. SOP DOCX Section Anatomy
- **Type**: Interactive HTML widget
- **Shows**: All 14 sections of the SOP document, colour-coded by data source (static template, AI-generated, diagram, human-reviewed)
- **Key insight**: Most sections are AI-generated text/tables; only §5 (Detailed Procedure) requires human review

### 10. Template vs Generation Comparison
- **Type**: SVG comparison diagram
- **Shows**: Why template editing (python-docx) is better than generation from scratch (docx-js) for this use case
- **Key insight**: Template approach = 300 lines Python, client can tweak formatting in Word without code changes

### 11. Pillow Annotation Rendering Flow
- **Type**: Interactive HTML widget
- **Shows**: Before/after of raw frame vs annotated frame, with the Python Pillow code that renders callout circles
- **Key insight**: Rendering is purely mechanical — no AI judgment, 100% accurate once coordinates are set

### 12. n8n DOCX Assembly Workflow
- **Type**: SVG flowchart
- **Shows**: Full n8n workflow from React approval webhook → parallel Gemini calls → Pillow render → Mermaid render → python-docx assembly → final DOCX output
- **Key insight**: Parallel Gemini calls with batch mode (50% discount) keep the assembly under 60 seconds

### 13. Interactive SOP Web Page Concept
- **Type**: Interactive HTML mockup (full-page)
- **Shows**: The dynamic SOP experience — step sidebar, embedded video player with timestamp sync, step detail panel with annotated screenshot, synced transcript with search, discussion context cards
- **Key insight**: The React review app and SOP delivery app merge into one — same URL, different permissions

### 14. Architecture Shift — DOCX to Platform
- **Type**: SVG structural diagram
- **Shows**: How the shared data store feeds both the dynamic web app (primary) and static exports (secondary, on-demand)
- **Key insight**: DOCX/PDF become export buttons, not the primary deliverable

### 15. React SOP Platform Tech Stack
- **Type**: SVG structural diagram
- **Shows**: Frontend (React + Video.js + Konva + TanStack) and Backend (FastAPI + PostgreSQL + Azure Blob) with infrastructure layer
- **Key insight**: Konva.js for the callout editor, Video.js for programmatic video control, both lazy-loaded

### 16. React App Route Structure
- **Type**: SVG flowchart
- **Shows**: Route tree (/dashboard, /sop/:id, /sop/new, /settings) with sub-routes and the procedure page component breakdown (StepSidebar, VideoPlayer, StepDetail, CalloutEditor, TranscriptPanel)
- **Key insight**: Five components share state via Zustand store; Konva only loads in edit mode

### 17. Konva Callout Editor Architecture
- **Type**: Interactive HTML widget
- **Shows**: 4-layer canvas stack (screenshot → highlight → callouts → hit areas), read mode vs edit mode capabilities, and the lazy-loading optimisation
- **Key insight**: Read mode uses no Konva at all — just CSS-positioned hotspots on a static image

### 18. Docker Compose Full Stack
- **Type**: Interactive HTML widget
- **Shows**: All 6 Docker containers (frontend, API, frame-extractor, postgres, n8n, cloudflare-tunnel) with their images, ports, and the shared /data volume structure
- **Key insight**: Everything runs on one Azure VM; shared volume connects all containers

### 19. Upload Pipeline Status Mockup
- **Type**: Interactive HTML mockup
- **Shows**: Real-time progress tracker for video processing — completed stages with metrics, in-progress stage with progress bar, pending stages greyed out, running API cost display
- **Key insight**: SSE from FastAPI pushes progress events; admin sees exactly what the pipeline is doing

### 20. SOP Platform Entity Relationship Diagram
- **Type**: Interactive HTML (Mermaid.js ERD)
- **Shows**: Full database schema with all 11 tables and their relationships
- **Key insight**: sop_steps is the central table connecting callouts, clips, discussions, and transcript lines

### 21. n8n Workflow 1 — Extraction Pipeline
- **Type**: SVG flowchart
- **Shows**: All 14 nodes of the extraction workflow, from webhook trigger through parallel Gemini+Blob branches, frame extraction, annotation loop, clip extraction, to final status update
- **Key insight**: Parallel execution of transcription + screen detection + blob upload saves ~40% of pipeline time