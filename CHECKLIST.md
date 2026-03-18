# SOP Automation Platform — Master Checklist

Last updated: 2026-03-18

---

## Phase 1: Foundation (Week 1-2)

### 1a: Docker Infrastructure ✅
- [x] docker-compose.yml — 3 containers (frontend, API, extractor)
- [x] docker-compose.dev.yml — hot reload overrides
- [x] .env.example — Supabase URL, n8n webhook URL, VITE_API_URL
- [x] Frontend Dockerfile — Node 20 (dev / build / serve, no nginx)
- [x] API Dockerfile — Python 3.11 + LibreOffice + Pillow
- [x] Extractor Dockerfile — FFmpeg + Node + Mermaid CLI
- [x] Scaffold apps with health endpoints
- [x] Supabase schema applied
- [x] Seed data loaded
- [x] Verification: 11/11 passing
- [x] Architecture updated: 6 → 3 containers after TL feedback

### 1b: FastAPI CRUD ✅
- [x] api/app/config.py — pydantic-settings (Supabase connection)
- [x] api/app/database.py — async SQLAlchemy engine + session
- [x] api/app/models.py — 12 tables + 6 enums + relationships
- [x] api/app/schemas.py — Pydantic v2 response schemas
- [x] api/app/routes/sops.py — GET /api/sops, GET /api/sops/{id}
- [x] api/app/routes/steps.py — steps with callouts, discussions
- [x] api/app/routes/sections.py — sections, transcript, watchlist
- [x] Routes registered in main.py
- [x] All endpoints tested with Supabase data

### 1c: React Scaffold ✅
- [x] Install TanStack Router + Query + Zustand + lucide-react
- [x] src/api/types.ts — TypeScript interfaces
- [x] src/api/client.ts — fetch wrapper + query keys
- [x] src/hooks/useSOPStore.ts — Zustand store
- [x] Route files — dashboard, sop.$id, procedure, overview, matrices, history
- [x] Layout.tsx — header + navigation
- [x] StepSidebar.tsx — clickable step list
- [x] StepDetail.tsx — step info + callouts + discussions
- [x] CalloutList.tsx — confidence colour dots
- [x] DiscussionCard.tsx — type icons + speakers
- [x] SOPCard.tsx — dashboard card
- [x] Procedure page renders with API data
- [x] Build passes with no TypeScript errors

---

## Phase 2: Video + Transcript (Week 2-3)

### 2a: Video Player ⬜
- [ ] Video.js integration
- [ ] Programmatic seek
- [ ] Clip mode (restrict to step time range)
- [ ] Time update events at 4Hz

### 2b: Step Sync Hook ⬜
- [ ] useStepSync — coordinates video, sidebar, transcript
- [ ] Circular update prevention (seekSource flag)
- [ ] Step click → video seek
- [ ] Video time → step selection

### 2c: Transcript Panel ⬜
- [ ] Virtualised list (react-virtual)
- [ ] Auto-scroll to active line
- [ ] Speaker colour coding
- [ ] Search with text highlighting
- [ ] Click line → seek video

### 2d: Navigation Features ⬜
- [ ] Clip mode toggle
- [ ] "Watch this step" button
- [ ] Keyboard shortcuts (↑↓ steps, Space play/pause, C clip mode)
- [ ] Step timestamps in sidebar

---

## Phase 3: Callout Editor (Week 3-4)

### 3a: Konva Canvas ⬜
- [ ] 4-layer canvas (screenshot, highlight, callouts, hit areas)
- [ ] Responsive scaling with coordinate mapping
- [ ] Lazy loading (edit mode only)

### 3b: Drag-Drop ⬜
- [ ] Draggable callout markers
- [ ] Add callout (click on canvas)
- [ ] Delete callout
- [ ] Label editing in side panel

### 3c: Confidence Colours ⬜
- [ ] Green (ocr_exact), Amber (ocr_fuzzy), Red (gemini_only)
- [ ] Legend in toolbar

### 3d: Optimistic Updates ⬜
- [ ] TanStack Query mutations with instant UI feedback
- [ ] Rollback on API failure

### 3e: Read Mode ⬜
- [ ] CSS-positioned hotspots on static image (no Konva)
- [ ] Hover tooltips

---

## Phase 4: Pipeline Integration (Week 4-5)

### 4a: Frame Extractor Service ⬜
- [ ] Scene detection (PySceneDetect adaptive)
- [ ] Perceptual deduplication (imagehash)
- [ ] Transition frame filtering (T+1.5s offset)
- [ ] Clip extraction (FFmpeg)

### 4b: n8n Workflow 1 — Extraction ⬜
- [ ] Webhook trigger from API
- [ ] Gemini transcription
- [ ] Screen share detection
- [ ] Frame extraction call to sop-extractor
- [ ] Annotation matching (Gemini + OCR)
- [ ] Clip extraction
- [ ] Azure Blob upload

### 4c: n8n Workflow 2 — Section Generation ⬜
- [ ] Load transcript + steps from Supabase
- [ ] 17 Gemini prompts
- [ ] Batch processing (4 parallel)
- [ ] Upsert sections to Supabase
- [ ] Mermaid process map rendering

### 4d: Upload Page ⬜
- [ ] File upload form
- [ ] SSE pipeline progress
- [ ] Stage-by-stage status display
- [ ] Cost tracker

### 4e: Annotation Matching ⬜
- [ ] Gemini semantic identification
- [ ] Google Vision OCR bounding boxes
- [ ] Levenshtein matching algorithm
- [ ] Region disambiguation
- [ ] Confidence scoring

---

## Phase 5: Exports + Polish (Week 5-6)

### 5a: Export Workflow ⬜
- [ ] n8n Workflow 3 webhook integration
- [ ] Annotation re-rendering (Pillow)
- [ ] DOCX generation (python-docx template)

### 5b: DOCX Template ⬜
- [ ] Master template with placeholder tokens
- [ ] All 14 sections mapped

### 5c: PDF Export ⬜
- [ ] LibreOffice headless conversion

### 5d: Dashboard ⬜
- [ ] SOP list with status badges
- [ ] Search and filters
- [ ] SOPCard with actions

### 5e: Cloudflare Setup ⬜
- [ ] cloudflared installed on host
- [ ] Tunnel configured for frontend + API
- [ ] Access policies defined

### 5f: RBAC ⬜
- [ ] Viewer / Editor / Admin roles
- [ ] JWT verification from Cloudflare Access
- [ ] Frontend conditional rendering
- [ ] API role guards

### 5g: Testing ⬜
- [ ] End-to-end test with real recording
- [ ] Prompt tuning
- [ ] Performance optimisation
- [ ] Production deployment
