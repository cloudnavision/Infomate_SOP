# Phase 1.5: Authentication & Authorization

**Objective:** Add Microsoft SSO authentication via Supabase Auth + Azure AD, with role-based access control (Viewer/Editor/Admin). Only pre-registered users can access the platform — admin manages user registration and role assignment.

**Save to:** `plans/phase-1.5-auth/PHASE_1.5_PLAN.md`

---

## Sub-Parts

| Sub-Part | Description | Status |
|----------|-------------|--------|
| 1.5a | Supabase Auth + Azure AD SSO configuration + Supabase client setup | ⬜ Pending |
| 1.5b | Sign-in page + protected routes + auth callback + session management | ⬜ Pending |
| 1.5c | Backend JWT validation + role-based API guards | ⬜ Pending |
| 1.5d | Admin user management page (add/remove users, assign roles) | ⬜ Pending |

---

## Architecture

**Auth Flow:**
```
User visits app
  → Not authenticated? → Redirect to /login
  → /login shows "Sign in with Microsoft" button
  → Click → Supabase triggers Azure AD OAuth flow
  → User signs in with Microsoft credentials
  → Azure AD redirects back to /auth/callback
  → Supabase exchanges code for session (JWT)
  → App checks: does user's email exist in users table?
    → YES: Load user record with role → redirect to /dashboard
    → NO: Show "Access denied — contact your administrator" → sign out
```

**Role Model (Option B):**

| Role | Permissions |
|------|-------------|
| **Viewer** | View published SOPs, watch videos, search transcripts, view all sections |
| **Editor** | All Viewer permissions + review draft SOPs, edit callouts, edit step text, approve steps, regenerate sections |
| **Admin** | All Editor permissions + upload recordings, trigger pipelines, publish/archive/delete SOPs, manage users and roles, export DOCX/PDF |

**Access Control Matrix:**

| Resource / Action | Viewer | Editor | Admin |
|-------------------|--------|--------|-------|
| View published SOPs | ✅ | ✅ | ✅ |
| Watch video / search transcript | ✅ | ✅ | ✅ |
| View draft SOPs | ❌ | ✅ | ✅ |
| Edit step text / callouts | ❌ | ✅ | ✅ |
| Approve / reject steps | ❌ | ✅ | ✅ |
| Regenerate AI sections | ❌ | ✅ | ✅ |
| Upload recordings | ❌ | ❌ | ✅ |
| Publish / archive SOPs | ❌ | ❌ | ✅ |
| Delete SOPs | ❌ | ❌ | ✅ |
| Export DOCX / PDF | ❌ | ❌ | ✅ |
| Manage users / roles | ❌ | ❌ | ✅ |
| Access /sop/new (upload page) | ❌ | ❌ | ✅ |
| Access /settings (user management) | ❌ | ❌ | ✅ |

**Technology:**

| Component | Technology |
|-----------|-----------|
| Auth provider | Supabase Auth |
| SSO provider | Azure AD (Microsoft) |
| Frontend auth client | @supabase/supabase-js |
| Backend JWT validation | python-jose + Supabase JWKS |
| Session storage | Supabase manages sessions (cookies/localStorage) |
| User records | Existing `users` table in Supabase PostgreSQL |

---

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Auth provider | Supabase Auth | Already using Supabase for DB; built-in OAuth support |
| SSO only | Microsoft Azure AD | Client's users are in Azure AD tenant |
| User provisioning | Pre-registered by admin | Controlled access — only specific people can use the platform |
| Role model | Viewer / Editor / Admin | Maps to real user groups (44+ GMs, BPO team, team leads) |
| Role assignment | Admin sets at registration time | One-time setup per user, simple to manage |
| Unregistered user handling | "Access denied" + auto sign-out | Clear feedback, no accidental access |
| Future flexibility | Additive changes only | Can add roles, SOP-level access, or Azure AD groups later |

---

## Sub-Part Plans

- [1.5a: Supabase Auth + Azure AD Configuration](1.5a_supabase_azure_auth.md)
- [1.5b: Sign-in Page + Protected Routes](1.5b_signin_protected_routes.md)
- [1.5c: Backend JWT + Role Guards](1.5c_backend_jwt_guards.md)
- [1.5d: Admin User Management](1.5d_admin_user_management.md)

---

## Build Order

Strict sequence — each depends on the previous:

1. **1.5a** — Configure Supabase Auth + Azure AD, install Supabase client, create auth utilities
2. **1.5b** — Sign-in page, auth callback, protected route wrapper, session management
3. **1.5c** — Backend JWT validation middleware, role guard decorator, protect existing API routes
4. **1.5d** — Admin user management page (CRUD users with roles)

---

## Checklist

```
1.5a: Supabase Auth + Azure AD Configuration
- [ ] Configure Azure AD app registration (client ID, secret, tenant)
- [ ] Enable Azure provider in Supabase Auth dashboard
- [ ] npm install @supabase/supabase-js
- [ ] frontend/src/lib/supabase.ts — Supabase client singleton
- [ ] frontend/src/hooks/useAuth.ts — auth state hook
- [ ] Add VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY to .env

1.5b: Sign-in Page + Protected Routes
- [ ] frontend/src/routes/login.tsx — sign-in page
- [ ] frontend/src/routes/auth.callback.tsx — OAuth callback handler
- [ ] frontend/src/components/ProtectedRoute.tsx — auth + role check wrapper
- [ ] frontend/src/components/AccessDenied.tsx — unauthorized message
- [ ] Update all routes with ProtectedRoute wrapper
- [ ] Redirect unauthenticated users to /login

1.5c: Backend JWT + Role Guards
- [ ] pip install python-jose[cryptography] httpx
- [ ] api/app/middleware/auth.py — JWT validation
- [ ] api/app/dependencies/auth.py — get_current_user + require_role
- [ ] Protect all existing API routes with auth
- [ ] Role guards on sensitive endpoints

1.5d: Admin User Management
- [ ] api/app/routes/users.py — CRUD endpoints (admin only)
- [ ] frontend/src/routes/settings.tsx — user management page
- [ ] frontend/src/components/UserManagementTable.tsx — user list + add/edit/remove
- [ ] Admin can add user with email + role
- [ ] Admin can change user's role
- [ ] Admin can remove user access
```

---

## Status: ⬜ Pending
