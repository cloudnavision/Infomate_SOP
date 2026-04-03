 # SOP Automation Platform — Master Checklist

Last updated: 2026-04-03

---

## Phase 1: Foundation ✅

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

## Phase 1.5: Authentication & Authorization ✅

### 1.5a: Supabase Auth + Azure AD ✅
- [x] Azure AD app registration (Client ID, Secret, Tenant ID)
- [x] Redirect URI added in Azure Portal
- [x] Azure provider enabled in Supabase Auth (Client ID, Secret, Tenant URL)
- [x] Supabase keys noted (Project URL, anon key, JWT Secret)
- [x] Admin user inserted in users table
- [x] .env updated with VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET
- [x] npm install @supabase/supabase-js
- [x] frontend/src/lib/supabase.ts — client singleton
- [x] frontend/src/hooks/useAuth.ts — auth state hook
- [x] frontend/src/contexts/AuthContext.tsx — auth context provider
- [x] frontend/src/api/types.ts — AppUser interface
- [x] frontend/src/api/client.ts — JWT in Authorization header
- [x] api/app/routes/auth.py — GET /api/auth/me (ES256/JWKS)
- [x] docker-compose.yml — build args for VITE_ vars, SUPABASE_JWT_SECRET for API
- [x] frontend/Dockerfile — ARG/ENV for VITE_ vars in build stage

### 1.5b: Sign-in Page + Protected Routes ✅
- [x] frontend/src/routes/login.tsx — "Sign in with Microsoft"
- [x] frontend/src/routes/auth.callback.tsx — OAuth callback
- [x] frontend/src/components/ProtectedRoute.tsx — auth + role wrapper
- [x] frontend/src/components/AccessDenied.tsx — blocked state
- [x] frontend/src/routes/settings.tsx — admin-only page
- [x] Updated __root.tsx — AuthProvider
- [x] Updated dashboard, sop.$id — ProtectedRoute (viewer)
- [x] Updated sop.new — ProtectedRoute (admin)
- [x] Updated Layout.tsx — user info, role badge, conditional nav
- [x] Sign-in flow works end-to-end

### 1.5c: Backend JWT + Role Guards ✅
- [x] api/app/dependencies/auth.py — get_current_user, require_role, require_viewer/editor/admin
- [x] api/app/routes/sops.py — require_viewer + SOP visibility filtering
- [x] api/app/routes/steps.py — require_viewer
- [x] api/app/routes/sections.py — require_viewer
- [x] Health endpoints remain public
- [x] database.py — pool_pre_ping=True (fix stale connections)

### 1.5d: Admin User Management ✅
- [x] api/app/routes/users.py — GET/POST/PATCH/DELETE (require_admin)
- [x] api/app/schemas.py — UserCreate, UserUpdate, UserResponse
- [x] frontend/src/components/UserManagementTable.tsx — full CRUD table
- [x] frontend/src/routes/settings.tsx — user management page
- [x] frontend/src/api/client.ts — fetchUsers, createUser, updateUser, deleteUser
- [x] Self-protection (cannot change own role / delete self)
- [x] Duplicate email check (409 Conflict)
- [x] TanStack Query mutations with cache invalidation

---

## Phase 2: Ingestion + Transcription ✅

### 2a: SharePoint Connection ✅
- [x] "Saara - Sharepoint" oAuth2Api credential (pre-existing)
- [x] Get Root Site → Analyze Root Site → Access Saara Site → Get Document Libraries
- [x] Find Documents Library (Code node — fallback search)
- [x] List SOP Files (Graph API, ordered by lastModifiedDateTime)
- [x] Get Processed Files (Supabase dedup query)
- [x] Filter New MP4 Files (Code node — mp4 + dedup filter)
- [x] Any New Files? (IF node — true/false branch)
- [x] Process One File At a Time (SplitInBatches, size=1)

### 2b: Azure Blob Upload ✅
- [x] Azure Blob container `infsop` (pre-existing, not sop-media)
- [x] SAS token confirmed with write permissions
- [x] Download from SharePoint (Graph API /items/{id}/content, responseFormat=file)
- [x] Generate SOP ID (UUID + blob_url + mime_type)
- [x] Upload to Azure Blob (PUT, SAS token, BlockBlob, 300s timeout)
- [x] Create SOP Record (Supabase sops, status=processing)
- [x] Create Pipeline Run (Supabase pipeline_runs, status=transcribing)
- [x] Mark File Processed (upsert with merge-duplicates — BEFORE Gemini)
- [x] MP4 confirmed in Azure Blob, SOP record in Supabase ✅

### 2c: Gemini Transcription ✅
- [x] Start Gemini Upload (resumable, fullResponse=true for header capture)
- [x] Reattach Binary (Code node — re-attaches binary lost after Azure PUT)
- [x] Complete Gemini Upload (PUT to signed URL, 600s timeout)
- [x] Wait for File Processing (10s Wait node)
- [x] Check File Status (GET /v1beta/files/{name})
- [x] File Active? (IF — poll loop until state=ACTIVE)
- [x] Gemini Transcription (generateContent, 900s timeout)
- [x] Gemini Screen Detection (generateContent, 900s timeout, parallel)
- [x] API key auth via x-goog-api-key (not Vertex AI — see PHASE_2_PLAN.md)

### 2d: Supabase Write ✅
- [x] Merge Results (combine Transcription + Screen Detection outputs)
- [x] Parse Transcript (Code node — transcript_lines array, cost calculation)
- [x] Insert Transcript Lines (bulk POST to Supabase)
- [x] Update SOP Record (PATCH — participants, screen_share_periods, video_duration_sec)
- [x] Update Pipeline Run (PATCH — status=extracting_frames, api_cost, stage_results)
- [x] All verified in Supabase with direct SQL queries ✅

### Cloudflare Tunnel ✅
- [x] cloudflared as host daemon (not in Docker Compose)
- [x] CLOUDFLARE_TUNNEL_TOKEN in .env
- [x] soptest.cloudnavision.com → localhost:8000 (sop-api)
- [x] Health check confirmed ✅

---

## Phase 3: Frame Extraction ✅

### 3a: sop-extractor /extract endpoint ✅
- [x] extractor/app/scene_detector.py — FFmpeg crop, PySceneDetect, phash dedup
- [x] extractor/app/main.py — POST /extract endpoint + Pydantic models
- [x] extractor/requirements.txt — all dependencies
- [x] sop-extractor Docker container rebuilt and running
- [x] Manual test: curl confirmed frames extracted + uploaded to Azure Blob

### 3b: n8n Workflow 2 — Frame Extraction ✅
- [x] Saara - SOP_Workflow 2 - Frame Extraction.json — imported to n8n
- [x] Supabase + Azure credentials configured
- [x] Tested: sop_steps rows in Supabase with screenshot_url → Azure Blob frames ✅
- [x] pipeline_runs.status = classifying_frames ✅

---

## Phase 4: Gemini Classification ✅ ⚠️

### 4a: n8n Workflow 3b — Gemini Only (running) ✅
- [x] Saara - SOP_Workflow 3b - Gemini Only.json — imported and active
- [x] gemini_description populated per step
- [x] step_callouts rows inserted (151 callouts, all confidence = gemini_only)
- [x] pipeline_runs.status = generating_annotations ✅

### 4b: n8n Workflow 3 — Full Hybrid (OCR) ⬜ → adding 2026-04-03
- [ ] Google service account set up (Cloud Vision API)
- [ ] Workflow 3 imported and credentials configured
- [ ] Re-run against existing SOPs — callout accuracy ~92% (vs ~60% Gemini-only)
- [ ] Verify callouts updated with ocr_exact / ocr_fuzzy confidence values

---

## Phase 5: Extracting Clips ✅

### 5a: sop-extractor /clip endpoint ✅
- [x] extractor/app/clip_extractor.py — FFmpeg stream-copy per step
- [x] extractor/app/main.py — POST /clip + GET /clip-status/{job_id}
- [x] Async job tracking
- [x] Clips uploaded to Azure Blob

### 5b: n8n Workflow 4 — Extract Clips ✅
- [x] Saara - SOP_Workflow 4 - Extract Clips.json — imported and active
- [x] Polls generating_annotations → POST /api/clip
- [x] step_clips rows inserted with clip_url ✅
- [x] pipeline_runs.status = completed ✅

---

## Phase 6: Video + Transcript UI ✅

### 6a: Dependencies ✅
- [x] npm install video.js @videojs/http-streaming @tanstack/react-virtual
- [x] npm install -D @types/video.js

### 6b: Zustand Store Extension ✅
- [x] src/hooks/useSOPStore.ts — videoMode (clip/full) + setVideoMode

### 6c: VideoPlayer Component ✅
- [x] src/components/VideoPlayer.tsx — Video.js, clip/full toggle, vjs fill:true + 260px fixed height, fallback chain (annotated screenshot → screenshot → placeholder)

### 6d: TranscriptPanel Component ✅
- [x] src/components/TranscriptPanel.tsx — virtualised, searchable, speaker filter dropdown, auto-scroll to linked step, "Synced transcript" label, data lifted from ProcedurePage

### 6e: useStepSync Hook ✅
- [x] src/hooks/useStepSync.ts — 3-way sync (video ↔ step ↔ transcript), seekSource ref guard

### 6f: SOPPageHeader ✅
- [x] src/components/SOPPageHeader.tsx — title, client/version/date metadata, Export DOCX/PDF (disabled placeholders), Share link (copy URL + toast)

### 6g: StepCard ✅
- [x] src/components/StepCard.tsx — step badge, description, sub-steps, screenshot thumbnail, KT session quote block, Play from timestamp, callouts, discussions
- [x] src/components/ScreenshotModal.tsx — fullscreen lightbox (Escape to close)

### 6h: Updated StepSidebar ✅
- [x] src/components/StepSidebar.tsx — SECTIONS block below steps list

### 6i: Update ProcedurePage ✅
- [x] src/routes/sop.$id.procedure.tsx — 3-col grid [220px|1fr|320px], SOPPageHeader, lifted transcript query, StepCard in right panel, transcript in center
- [x] Auto-select first step on load

### 6j: Browser Verification ✅
- [x] Step click → clip plays
- [x] Full video toggle → seeks to step timestamp
- [x] Transcript lines highlighted blue for current step
- [x] Click transcript line → video seeks
- [x] Speaker filter dropdown works
- [x] Screenshot thumbnail → fullscreen modal
- [x] Share link → copies URL, toast appears

### Known Issue (tracked)
- sopnew SOP has NULL step descriptions/sub_steps — pipeline stage that generates them (Gemini step content workflow) never ran for this recording. See memory note. UI is ready — will display automatically when data exists.

---

## Phase 7: Exports + Polish ⬜

### 7a: DOCX/PDF Export
- [ ] n8n Workflow 3 (export) — python-docx template injection
- [ ] Annotation re-rendering with Pillow
- [ ] LibreOffice headless PDF conversion
- [ ] Azure Blob upload + export_history record

### 7b: Dashboard Polish
- [ ] SOP list with pipeline status badges
- [ ] Full-text search across SOPs
- [ ] SOPCard actions (export, share)

### 7c: Cloudflare ZTNA
- [ ] Frontend exposed via Cloudflare tunnel
- [ ] Access policies: viewer/editor/admin roles
- [ ] Production deployment verified

---

## Phase 8: Annotation Editor (Konva.js) ⬜

> Prerequisite: Phase 4b (GCP Vision OCR) must be complete so callout accuracy is ~92% before building editor.

### 8a: react-konva Setup
- [ ] npm install konva react-konva
- [ ] Lazy loaded for Editor role only

### 8b: Canvas Callout Editor
- [ ] Annotated screenshot rendered on Konva Stage
- [ ] Numbered callout circles draggable on canvas
- [ ] Confidence colour coding: green (ocr_exact), amber (ocr_fuzzy), red (gemini_only)
- [ ] Save updated x/y positions to step_callouts via API

### 8c: Backend
- [ ] PATCH /api/sops/{id}/steps/{step_id}/callouts/{callout_id} — update x, y, match_method=manual
- [ ] Re-render annotated screenshot PNG via Pillow after position update

### 8d: Integration
- [ ] Editor role sees canvas editor on procedure page
- [ ] Viewer role sees static annotated screenshot (no Konva)
