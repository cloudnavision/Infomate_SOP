# Chat Summary — SOP Automation Platform Build
## Phase 1.5 Authentication & Authorization (Complete)

---

## Starting Point

Phase 1 complete — Docker infrastructure (3 containers), FastAPI CRUD, React scaffold all working. TL guided to add authentication before continuing with Phase 2 (Video + Transcript).

Decision: Use Supabase Auth + Azure AD SSO for single sign-on with Microsoft.

---

## What Was Discussed & Decided

### Authentication Approach
- **SSO Provider:** Microsoft Azure AD via Supabase Auth
- **Sign-in method:** Microsoft SSO only (single sign-on)
- **User provisioning:** Admin pre-registers users (Option 3 — controlled access). Only users whose email exists in the `users` table can access the platform. Unregistered users see "Access denied."

### Role Model — Option B (Viewer / Editor / Admin)
Brainstormed three options and selected Option B based on real user analysis:

| Role | Who | Permissions |
|------|-----|------------|
| **Viewer** | 44+ GMs, Directors, Management Accountants | View published SOPs, watch videos, search transcripts |
| **Editor** | BPO processing team (Suchith, Manjula, etc.) | All Viewer + review drafts, edit callouts, edit text, approve steps |
| **Admin** | Team leads + managers (Lasya, Jehan, Ranga) | All Editor + upload recordings, publish/delete SOPs, manage users |

**Future flexibility:** Can add roles (`ALTER TYPE user_role ADD VALUE`), add SOP-level access (junction table), or switch to Azure AD group-based roles — all additive, no breaking changes.

### Role Assignment
- Admin sets role when adding the user
- Admin can change roles later via Settings page
- Self-protection: admin cannot change own role or delete themselves

---

## What Was Built

### Phase 1.5a: Supabase Auth + Azure AD Configuration ✅
- Azure AD app registration (Client ID, Secret, Tenant ID)
- Supabase Azure provider configured with tenant URL
- `@supabase/supabase-js` installed in frontend
- `frontend/src/lib/supabase.ts` — Supabase client singleton (auth only)
- `frontend/src/hooks/useAuth.ts` — auth state hook (user, appUser, loading, accessDenied, signInWithMicrosoft, signOut)
- `frontend/src/contexts/AuthContext.tsx` — AuthProvider wrapping the app
- `frontend/src/routes/auth.callback.tsx` — OAuth callback handler
- `frontend/src/api/client.ts` — updated to inject Authorization: Bearer token on every API call
- `frontend/src/api/types.ts` — added AppUser interface
- `api/app/routes/auth.py` — GET /api/auth/me endpoint with ES256/JWKS JWT validation
- `api/app/config.py` — added supabase_jwt_secret setting
- Environment variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET

### Phase 1.5b: Sign-in Page + Protected Routes ✅
- `frontend/src/routes/login.tsx` — "Sign in with Microsoft" button page
- `frontend/src/components/ProtectedRoute.tsx` — auth + role hierarchy wrapper
- `frontend/src/components/AccessDenied.tsx` — blocked state for unregistered users
- `frontend/src/routes/settings.tsx` — admin-only settings page
- Updated `__root.tsx` — wrapped with AuthProvider
- Updated `dashboard.tsx`, `sop.$id.tsx` — wrapped with ProtectedRoute (viewer)
- Updated `sop.new.tsx` — wrapped with ProtectedRoute (admin)
- Updated `Layout.tsx` — user name, Admin badge, Sign out, conditional nav links

### Phase 1.5c: Backend JWT + Role Guards ✅
- `api/app/dependencies/auth.py` — get_current_user, require_role(), require_viewer/editor/admin
- Updated `api/app/routes/sops.py` — require_viewer + SOP visibility filtering by role
- Updated `api/app/routes/steps.py` — require_viewer
- Updated `api/app/routes/sections.py` — require_viewer on sections, transcript, watchlist
- Health endpoints remain public

### Phase 1.5d: Admin User Management ✅
- `api/app/routes/users.py` — GET/POST/PATCH/DELETE /api/users (all require_admin)
- `api/app/schemas.py` — added UserCreate, UserUpdate, UserResponse
- `frontend/src/components/UserManagementTable.tsx` — full table with add/edit/delete
- `frontend/src/routes/settings.tsx` — replaced placeholder with UserManagementTable
- `frontend/src/api/client.ts` — added fetchUsers, createUser, updateUser, deleteUser + userKeys
- Self-protection: cannot change own role or delete yourself
- Duplicate email check: 409 Conflict
- TanStack Query mutations with cache invalidation

---

## Issues Encountered (8 total)

See: [PHASE_1.5_ISSUES.md](PHASE_1.5_ISSUES.md)

---

## Key Technical Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Supabase Auth over Cloudflare ZTNA | Already using Supabase for DB; built-in OAuth support with Azure AD |
| 2 | ES256/JWKS over HS256 shared secret | Supabase migrated to ECC (P-256) signing keys; JWKS endpoint provides public key |
| 3 | PyJWKClient for JWT verification | Handles JWKS fetching, key caching, and kid matching automatically |
| 4 | Admin pre-registers users | Controlled access — only specific people can use the platform |
| 5 | Role hierarchy (admin > editor > viewer) | Simple numeric comparison; extensible for future roles |
| 6 | SOP visibility by role | Viewers see published only; editors see draft/in_review; admins see all |
| 7 | Vite build args for env vars | VITE_ vars baked at build time; must pass through Docker build args |
| 8 | pool_pre_ping=True | Detects stale pgBouncer connections before failing mid-request |

---

## Environment Updates

**New .env variables (Phase 1.5):**
```
VITE_SUPABASE_URL=https://hzluuqhbkiblmojxgbab.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_JWT_SECRET=<legacy-jwt-secret>
```

**docker-compose.yml changes:**
- Added build args to sop-frontend: VITE_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
- Added SUPABASE_JWT_SECRET to sop-api environment

**frontend/Dockerfile changes:**
- Stage 2 (build): Added ARG/ENV for VITE_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY

**Seed data:**
- Inserted admin user: `saara@cloudnavision.com` with role `admin`

---

## Documentation Created

| File | Location | Purpose |
|------|----------|---------|
| PHASE_1.5_PLAN.md | plans/phase-1.5-auth/ | Phase 1.5 overview + architecture + checklist |
| 1.5a_supabase_azure_auth.md | plans/phase-1.5-auth/ | Supabase + Azure AD configuration plan |
| 1.5b_signin_protected_routes.md | plans/phase-1.5-auth/ | Sign-in page + protected routes plan |
| 1.5c_backend_jwt_guards.md | plans/phase-1.5-auth/ | Backend JWT validation + role guards plan |
| 1.5d_admin_user_management.md | plans/phase-1.5-auth/ | Admin user management plan |

---

## Next Steps

- Phase 2: Video + Transcript (VideoPlayer, useStepSync, TranscriptPanel, keyboard shortcuts)
- Phase 2 plan files already created in `plans/phase-2-video-transcript/`
- Build order: 2a → 2b → 2c → 2d
