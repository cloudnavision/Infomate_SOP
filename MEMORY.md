# SOP Automation Platform — Project Memory
## Last Updated: 2026-03-19 (Phase 1.5 complete)

---

## Project Context

**Client:** Starboard Hotels
**Goal:** Replace 4-6 hour manual SOP process with AI pipeline → draft SOP in ~4 minutes
**Pipeline:** Teams KT recording (MP4) → Gemini 2.5 Flash transcription → FFmpeg frame extraction → callout annotation → section generation → DOCX/PDF export

**Stack:**
- Frontend: React 18 + TypeScript + Vite + Tailwind + TanStack Router + TanStack Query + Zustand
- Backend: Python 3.11 + FastAPI + SQLAlchemy 2.0 async + Pydantic v2
- Database: PostgreSQL 16 on Supabase (transaction pooler port 6543)
- Auth: Supabase Auth + Azure AD SSO (Microsoft single sign-on)
- AI: Gemini 2.5 Flash (transcription, annotation, section generation)
- OCR: Google Cloud Vision (pixel-precise callout matching)
- Pipeline: n8n (externally hosted, 3 workflows via webhooks)
- Frame extraction: FFmpeg + PySceneDetect
- Export: python-docx + Pillow, LibreOffice headless for PDF
- Storage: Azure Blob Storage (video, images, DOCX/PDF)
- CDN/HTTPS: Cloudflare Tunnel (sideloaded on host)

---

## Current State

### Phase 1: Foundation ✅ Complete

| Sub-Part | Description | Status |
|----------|-------------|--------|
| 1a | Docker Compose (3 containers) + Supabase schema + seed data + verify script | ✅ Complete |
| 1b | FastAPI CRUD routes: SOPs, steps, callouts, sections, transcript, watchlist | ✅ Complete |
| 1c | React scaffold: TanStack Router, SOP list page, step detail view | ✅ Complete |

### Phase 1.5: Authentication & Authorization ✅ Complete

| Sub-Part | Description | Status |
|----------|-------------|--------|
| 1.5a | Supabase Auth + Azure AD SSO config, Supabase client, useAuth hook, GET /api/auth/me | ✅ Complete |
| 1.5b | Sign-in page, OAuth callback, ProtectedRoute wrapper, role-based nav | ✅ Complete |
| 1.5c | Backend JWT validation (ES256/JWKS), role guards on all API routes, SOP visibility by role | ✅ Complete |
| 1.5d | Admin user management API (CRUD) + Settings page with user table | ✅ Complete |

### Phase 2: Video + Transcript ◀ Next
### Phase 3: Callout Editor ⬜
### Phase 4: Pipeline Integration ⬜
### Phase 5: Exports + Polish ⬜

---

## Architecture v2.0

```
Docker Compose (3 local containers):
┌─────────────────────────────────────────────┐
│  sop-frontend    React (Vite/serve) :5173   │
│  sop-api         FastAPI            :8000   │
│  sop-extractor   FFmpeg+Python      :8001   │
│  Shared volume: ./data                      │
│  Network: sop-network                       │
└─────────────────────────────────────────────┘

External Services (not in Docker Compose):
- Supabase     PostgreSQL via transaction pooler, port 6543
- Supabase Auth  Azure AD SSO (ES256/JWKS JWT verification)
- n8n          Hosted externally, webhook communication
- Cloudflare   Tunnel runs as host daemon (cloudflared tunnel run)
```

---

## Auth Architecture (Phase 1.5)

**Flow:**
```
User → /login → "Sign in with Microsoft" → Azure AD OAuth
  → Supabase callback → JWT session established
  → Frontend calls GET /api/auth/me with Bearer token
  → Backend validates ES256 JWT via Supabase JWKS endpoint
  → Looks up user email in users table
  → Found + role loaded → Dashboard
  → Not found → "Access denied" → Sign out
```

**Role Model (Option B):**
| Role | Who | Can do |
|------|-----|--------|
| Viewer | GMs, Directors (44+) | View published SOPs, watch videos, search transcripts |
| Editor | BPO processing team | All Viewer + review drafts, edit callouts, approve steps |
| Admin | Team leads, managers | All Editor + upload, publish/delete SOPs, manage users |

**User Provisioning:** Admin pre-registers users via Settings page. Unregistered users get "Access denied."

**JWT Verification:** ES256 algorithm via JWKS endpoint (not HS256 legacy secret). Supabase project uses ECC (P-256) signing keys.

**SOP Visibility by Role:**
- Viewer → published only
- Editor → published, draft, in_review
- Admin → all statuses

---

## Key Architecture Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Supabase over local Postgres | Managed DB, connection pooling built-in, free tier adequate |
| 2 | Transaction pooler port 6543 | Required for Supabase pgBouncer; direct 5432 unreliable with async |
| 3 | No nginx proxy | Cloudflare Tunnel handles ingress; CORS middleware on FastAPI covers dev |
| 4 | n8n externally hosted | Reuses existing n8n instance; lighter local Docker footprint |
| 5 | Cloudflare as host daemon | More reliable than container; avoids Docker-in-Docker networking |
| 6 | Gemini 2.5 Flash for all AI | ~$0.43/SOP; best multimodal for video frames + long transcripts |
| 7 | Hybrid annotation (Gemini + Vision OCR) | Gemini ~60% spatial, Vision OCR pixel-precise; combined ~92% |
| 8 | SQLAlchemy 2.0 async ORM | Type-safe, Mapped[], async sessions compatible with Supabase pooler |
| 9 | TanStack Router file-based routing | Type-safe, colocated loaders, matches component file tree in blueprint |
| 10 | Zustand for UI state | Lightweight; avoids Redux boilerplate for step selection + editor mode |
| 11 | Supabase Auth + Azure AD SSO | Client's users in Azure AD; Supabase handles OAuth flow |
| 12 | ES256/JWKS over HS256 secret | Supabase migrated to ECC (P-256) keys; JWKS provides public key |
| 13 | Admin pre-registers users | Controlled access — only specific people can use the platform |
| 14 | 3-role hierarchy (V/E/A) | Maps to real user groups; extensible for future roles |
| 15 | pool_pre_ping=True | Detects stale pgBouncer connections before failing mid-request |

---

## Environment

**Working directory:** `d:\CloudNavision\1. Projects\SOP\SOP Automation System\sop-platform\`

**Key env vars (.env):**
```
DATABASE_URL=postgresql+asyncpg://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
VITE_API_URL=http://localhost:8000
VITE_SUPABASE_URL=https://hzluuqhbkiblmojxgbab.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_JWT_SECRET=<legacy-jwt-secret>
N8N_WEBHOOK_BASE_URL=<to be filled>
GEMINI_API_KEY=<to be filled>
EXTRACTOR_URL=http://sop-extractor:8001
```

---

## Key File Locations

### Infrastructure
| File | Purpose |
|------|---------|
| `sop-platform/docker-compose.yml` | 3-service compose + build args for VITE_ vars |
| `sop-platform/docker-compose.dev.yml` | Dev compose (volume mounts for hot reload) |
| `sop-platform/.env` | Real credentials (never commit) |
| `sop-platform/.env.example` | Template including Supabase Auth vars |
| `sop-platform/frontend/Dockerfile` | 3-stage with ARG/ENV for VITE_ build vars |
| `sop-platform/schema/001_initial_schema.sql` | 6 enums, 12 tables, triggers, pg_trgm |
| `sop-platform/schema/002_seed_aged_debtor.sql` | Dev seed: 1 SOP, 8 steps, 5 callouts, 4 sections |
| `sop-platform/scripts/verify_infrastructure.sh` | 11-check infra verification script |

### Backend (API)
| File | Purpose |
|------|---------|
| `api/app/config.py` | pydantic-settings (DB URL, Supabase JWT secret, CORS, n8n) |
| `api/app/database.py` | async engine (statement_cache_size=0, pool_pre_ping=True) |
| `api/app/models.py` | 13 SQLAlchemy 2.0 models + 6 Python enums |
| `api/app/schemas.py` | Pydantic v2 schemas (SOP, Step, User, etc.) |
| `api/app/routes/auth.py` | GET /api/auth/me (ES256/JWKS JWT validation) |
| `api/app/routes/sops.py` | GET /api/sops (role-filtered), GET /api/sops/{id} |
| `api/app/routes/steps.py` | Steps with callouts, discussions |
| `api/app/routes/sections.py` | Sections, transcript, watchlist |
| `api/app/routes/users.py` | CRUD /api/users (admin only) |
| `api/app/routes/media.py` | Dev video streaming (placeholder) |
| `api/app/dependencies/auth.py` | get_current_user, require_role, require_viewer/editor/admin |

### Frontend
| File | Purpose |
|------|---------|
| `frontend/src/lib/supabase.ts` | Supabase client singleton (auth only) |
| `frontend/src/hooks/useAuth.ts` | Auth state: user, appUser, signInWithMicrosoft, signOut |
| `frontend/src/contexts/AuthContext.tsx` | AuthProvider wrapping app in __root.tsx |
| `frontend/src/hooks/useSOPStore.ts` | Zustand store (selectedStepId, editMode) |
| `frontend/src/api/types.ts` | TypeScript interfaces (SOP, Step, AppUser, etc.) |
| `frontend/src/api/client.ts` | Fetch wrapper with JWT auth headers + query keys |
| `frontend/src/routes/login.tsx` | Sign-in page with "Sign in with Microsoft" |
| `frontend/src/routes/auth.callback.tsx` | OAuth callback handler |
| `frontend/src/routes/dashboard.tsx` | SOP list (ProtectedRoute viewer) |
| `frontend/src/routes/sop.$id.tsx` | SOP layout with tabs (ProtectedRoute viewer) |
| `frontend/src/routes/sop.$id.procedure.tsx` | Step sidebar + detail |
| `frontend/src/routes/settings.tsx` | User management (ProtectedRoute admin) |
| `frontend/src/components/ProtectedRoute.tsx` | Auth + role hierarchy check wrapper |
| `frontend/src/components/Layout.tsx` | Header with user info, role badge, conditional nav |
| `frontend/src/components/UserManagementTable.tsx` | User CRUD table (add/edit/delete) |
| `frontend/src/components/AccessDenied.tsx` | Blocked state for unregistered users |

### Plan Documents
| File | Purpose |
|------|---------|
| `plans/MASTER_PLAN.md` | Phase overview, architecture diagram |
| `plans/phase-1-foundation/PHASE_1_PLAN.md` | Phase 1 detailed checklist |
| `plans/phase-1-foundation/PHASE_1_ISSUES.md` | 13 issues logged |
| `plans/phase-1.5-auth/PHASE_1.5_PLAN.md` | Auth overview + access control matrix |
| `plans/phase-1.5-auth/PHASE_1.5_ISSUES.md` | 8 issues logged |
| `plans/phase-1.5-auth/Phase 1.5 - CONVERSATION_SUMMARY.md` | Auth build record |
| `plans/phase-2-video-transcript/PHASE_2_PLAN.md` | Video + Transcript overview |
| `plans/phase-2-video-transcript/2a_video_player.md` | VideoPlayer plan |
| `plans/phase-2-video-transcript/2b_step_sync.md` | useStepSync plan |
| `plans/phase-2-video-transcript/2c_transcript_panel.md` | TranscriptPanel plan |
| `plans/phase-2-video-transcript/2d_navigation_features.md` | Navigation features plan |

---

## Seed Data IDs (Aged Debtor SOP)

| Entity | UUID |
|--------|------|
| Admin user (seed) | `00000000-0000-0000-0000-000000000001` |
| Aged Debtor SOP | `10000000-0000-0000-0000-000000000001` |
| Steps 1–8 | `20000000-0000-0000-0000-00000000000{1-8}` |

**Auth users in Supabase:**
- `saara@cloudnavision.com` — Saara Kaizer — Admin
- `admin@infomate.com` — System Admin — Admin
- `saara.kaizer@gmail.com` — sk — Viewer

---

## Known Quirks

1. **VITE_ env vars bake-time:** Must pass as Docker build args, not just runtime env. Frontend Dockerfile Stage 2 has ARG/ENV lines for VITE_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY.

2. **Supabase transaction pooler:** Port 6543, pool size ≤10. asyncpg prefix: `postgresql+asyncpg://`. Must set `statement_cache_size=0` and `prepared_statement_cache_size=0` in connect_args. `pool_pre_ping=True` required.

3. **JWT algorithm:** Supabase uses ECC (P-256) / ES256, NOT HS256. Backend uses `PyJWKClient` to fetch public keys from JWKS endpoint. Legacy JWT secret in .env is kept but not used for token verification.

4. **Clock skew warning:** Supabase gotrue-js warns "Session issued in the future" due to slight clock difference. Harmless — `leeway=60` in JWT decode handles it.

5. **SQLAlchemy enum pattern:** Use `SAEnum(PythonEnum, name="enum_name", create_type=False)` to reference pre-existing DB enum types.

6. **TanStack Router v1:** `useRouteContext` unreliable for parent-to-child data. Use `useQuery` with same key — React Query cache prevents duplicate network calls.

7. **routeTree.gen.ts:** Auto-generated by TanStack Router Vite plugin. Never edit manually.

8. **Windows line endings:** Fix with `sed -i 's/\r$//' .env` in WSL.

---

## TL Feedback Log

| Date | Feedback | Action Taken |
|------|----------|--------------|
| 2026-03 | 6-container setup too heavy | Reduced to 3 containers |
| 2026-03 | Add auth before Phase 2 | Built Phase 1.5 with Supabase Auth + Azure AD SSO |

---

## Daily Commands

```bash
# Start all containers
cd sop-platform && sudo docker compose up -d

# Rebuild after code changes
sudo docker compose build sop-api sop-frontend && sudo docker compose up -d

# View logs
sudo docker compose logs -f sop-api
sudo docker compose logs -f sop-frontend

# Stop all
sudo docker compose down
```

---

## Next Steps — Phase 2

Phase 2 plan docs are complete in `plans/phase-2-video-transcript/`. Build order: 2a → 2b → 2c → 2d.

**Before starting 2a:**
- Place test MP4 in `sop-platform/data/uploads/`
- Run seed data SQL update in Supabase (video_url + step timestamps)
- Install: `npm install video.js @types/video.js @tanstack/react-virtual`
