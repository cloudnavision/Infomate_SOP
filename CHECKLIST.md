# SOP Automation Platform — Master Checklist

Last updated: 2026-03-26

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

## Phase 2: Ingestion + Transcription (n8n Pipeline) ✅

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

### Cloudflare Tunnel (set up during Phase 2 pause) ✅
- [x] cloudflared container with network_mode: "host"
- [x] CLOUDFLARE_TUNNEL_TOKEN in .env
- [x] soptest.cloudnavision.com → http://localhost:8001 (sop-extractor)
- [x] Health check confirmed: ffmpeg=true, mermaid_cli=true ✅

---

## Phase 3: Frame Extraction

### 3a: sop-extractor /extract endpoint ⬜
- [ ] `extractor/app/scene_detector.py` — full implementation (FFmpeg crop, PySceneDetect, phash dedup)
- [ ] `extractor/app/main.py` — `POST /extract` endpoint + Pydantic models
- [ ] `extractor/requirements.txt` — add `requests==2.32.3`
- [ ] Rebuild sop-extractor Docker container
- [ ] Manual test: `curl soptest.cloudnavision.com/extract` with test payload

### 3b: n8n Workflow 2 — Frame Extraction ⬜
- [ ] `n8n-workflows/Saara - SOP_Workflow 2 - Frame Extraction.json` — created
- [ ] Import to n8n (delete any old version first, then import fresh)
- [ ] Update Setup Config node with real Supabase + Azure credentials
- [ ] Test: set pipeline_run status=extracting_frames, trigger workflow
- [ ] Verify sop_steps rows in Supabase with screenshot_url → Azure Blob frames
- [ ] Verify pipeline_runs.status = classifying_frames

---

## Phase 4: Gemini Frame Classification

### 4a: n8n Workflow 3 — Gemini Vision Classification ⬜
- [ ] `n8n-workflows/Saara - SOP_Workflow 3 - Gemini Classification.json` — created
- [ ] Import to n8n (delete any old version first)
- [ ] Setup Config — fill in GEMINI_API_KEY + AZURE_BLOB_SAS_TOKEN
- [ ] Test: set pipeline_run status=classifying_frames, trigger workflow
- [ ] Verify sop_steps.gemini_description populated for each useful step
- [ ] Verify step_callouts rows in Supabase (1-5 per step)
- [ ] Verify pipeline_runs.status = generating_annotations

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
