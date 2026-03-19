# SOP Automation Platform — Master Checklist

Last updated: 2026-03-19

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

## Phase 1.5: Authentication & Authorization

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

## Phase 2: Video + Transcript (Week 2-3)

### 2a: Video Player ⬜
- [ ] npm install video.js @types/video.js @tanstack/react-virtual
- [ ] Place test MP4 in data/uploads/
- [ ] Seed data SQL update (video_url + step timestamps)
- [ ] api/app/routes/media.py — dev video streaming with Range support
- [ ] frontend/src/hooks/useSOPStore.ts — add video state fields
- [ ] frontend/src/components/VideoPlayer.tsx + CSS
- [ ] frontend/src/routes/sop.$id.procedure.tsx — layout with VideoPlayer
- [ ] Video plays, seeks, speed control works

### 2b: Step Sync Hook ⬜
- [ ] frontend/src/hooks/useStepSync.ts
- [ ] frontend/src/components/StepSidebar.tsx — add timestamps
- [ ] Click step → video seeks; video play → step auto-selects

### 2c: Transcript Panel ⬜
- [ ] frontend/src/components/TranscriptPanel.tsx + CSS
- [ ] frontend/src/routes/sop.$id.procedure.tsx — add to grid layout
- [ ] Search, auto-scroll, click-to-seek, speaker colours

### 2d: Navigation Features ⬜
- [ ] frontend/src/components/ClipModeBar.tsx + CSS
- [ ] frontend/src/components/StepDetail.tsx — onWatchStep button
- [ ] Keyboard shortcuts (↑↓ Space C)
- [ ] Clip mode, Watch Step all work

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

### 5f: Testing ⬜
- [ ] End-to-end test with real recording
- [ ] Prompt tuning
- [ ] Performance optimisation
- [ ] Production deployment
