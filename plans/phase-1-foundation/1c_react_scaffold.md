# Phase 1c: React Scaffold + Basic SOP Page

### Objective
Build the React frontend with routing, state management, API integration, and a basic SOP procedure page showing the step sidebar and step detail panel.

### Architecture Note
No nginx proxy — the frontend calls the API directly using `VITE_API_URL` environment variable.
- Local dev: `VITE_API_URL=http://localhost:8000`
- Production: `VITE_API_URL=https://api.sop.yourdomain.com` (via Cloudflare)
- Vite bakes env vars at build time — for the Docker prod stage, pass as `--build-arg`

### What to Build

**Install Dependencies:**
- @tanstack/react-router — file-based routing with type-safe params
- @tanstack/react-query — server state management + caching
- zustand — client state (selected step, edit mode)
- @tanstack/router-plugin — Vite plugin for route generation
- lucide-react — icons
- clsx — conditional class names

**API Layer (src/api/):**
- `types.ts` — TypeScript interfaces matching the Pydantic schemas from api/app/schemas.py:
  - SOP, SOPListItem, SOPStep, StepCallout, StepDiscussion, StepClip
  - TranscriptLine, SOPSection, WatchlistItem
- `client.ts` — fetch wrapper using VITE_API_URL + TanStack Query key factories:
  ```typescript
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  // All calls: fetch(`${API_BASE}/api/sops`)
  ```
  - fetchSOPs(), fetchSOP(id), fetchTranscript(id), fetchSections(id)
  - sopKeys.all, sopKeys.detail(id), sopKeys.steps(id), sopKeys.transcript(id)

**State (src/hooks/):**
- `useSOPStore.ts` — Zustand store:
  - selectedStepId: string | null
  - editMode: boolean
  - setSelectedStep(id)
  - toggleEditMode()

**Routes (src/routes/):**
From CONVERSATION_SUMMARY.md route structure:
- `__root.tsx` — QueryClientProvider + Layout wrapper
- `index.tsx` — redirect to /dashboard
- `dashboard.tsx` — SOP list page, fetches GET /api/sops, renders SOPCard for each
- `sop.$id.tsx` — SOP layout with tab navigation (Procedure, Overview, Matrices, History), fetches SOP data
- `sop.$id.procedure.tsx` — Main page: StepSidebar + StepDetail side by side
- `sop.$id.overview.tsx` — Renders sections based on content_type (text → paragraph, list → bullets, table → HTML table)
- `sop.$id.matrices.tsx` — Placeholder
- `sop.$id.history.tsx` — Placeholder
- `sop.new.tsx` — Placeholder

**Components (src/components/):**
- `Layout.tsx` — Header with platform name, nav links (Dashboard)
- `StepSidebar.tsx` — Ordered list of steps:
  - Props: steps, onStepClick
  - Active step highlighted (blue left border + bg)
  - Shows sequence number + title
  - Truncates long titles
- `StepDetail.tsx` — Selected step detail:
  - Step title as heading
  - Description paragraph
  - Screenshot area (placeholder — "Screenshot available after pipeline processing")
  - Sub-steps as list
  - CalloutList component
  - DiscussionCard components
  - Null state: "Select a step from the sidebar"
- `CalloutList.tsx` — Callouts for a step:
  - Confidence colour dot: ocr_exact=green, ocr_fuzzy=amber, gemini_only=red
  - Callout number + label
- `DiscussionCard.tsx` — Discussion context card:
  - Type icon: question=💬, clarification=ℹ️, decision=⚡, warning=⚠️
  - Summary text
  - Speaker names as badges
- `SOPCard.tsx` — Card for dashboard list:
  - Title, client name, status badge, step count, meeting date
  - Clickable — navigates to /sop/{id}/procedure

**Procedure Page Layout:**
```
┌───────────────┬─────────────────────────────────┐
│               │                                 │
│  StepSidebar  │         StepDetail              │
│               │                                 │
│  1. Log in ←  │  Step 1: Log in to Shared...    │
│  2. Share     │                                 │
│  3. Verify    │  Description text...            │
│  4. Duplicate │                                 │
│  5. Clear     │  [Screenshot Placeholder]       │
│  6. Update    │                                 │
│  7. PM Folio  │  Sub-steps:                     │
│  8. Finalise  │  • Navigate to SBH Accounts     │
│               │  • Open Credit Check             │
│               │                                 │
│               │  Callouts:                      │
│               │  🟢 1. SBH Accounts folder      │
│               │  🟢 2. Credit Check folder       │
│               │  🟡 3. Aged Date folder          │
│               │                                 │
│               │  Discussion:                    │
│               │  ℹ️ Team confirmed no access...  │
└───────────────┴─────────────────────────────────┘
```

- Auto-select first step on page load
- Clicking step updates detail panel via Zustand store
- TanStack Query fetches SOP data once, caches it
- Frontend calls API at VITE_API_URL (no nginx proxy)

### Validation
- [ ] `npm run build` produces no TypeScript errors
- [ ] http://localhost:5173/ redirects to /dashboard
- [ ] /dashboard shows SOP card for Aged Debtor Report
- [ ] Clicking card navigates to /sop/{id}/procedure
- [ ] Sidebar shows 8 steps in order
- [ ] Clicking step updates detail panel
- [ ] First step auto-selected on load
- [ ] Step 1 shows 3 callouts with green/amber dots
- [ ] Step 1 shows discussion card with clarification icon
- [ ] Step 6 shows discussion card with warning icon
- [ ] /sop/{id}/overview shows purpose, inputs, outputs, risks sections
- [ ] Tab navigation works between Procedure/Overview/Matrices/History

### Checklist
- [ ] Install TanStack Router + Query + Zustand + lucide-react + clsx
- [ ] Configure TanStack Router plugin in vite.config.ts
- [ ] Create src/api/types.ts
- [ ] Create src/api/client.ts (using VITE_API_URL)
- [ ] Create src/hooks/useSOPStore.ts
- [ ] Create src/routes/__root.tsx
- [ ] Create src/routes/index.tsx
- [ ] Create src/routes/dashboard.tsx
- [ ] Create src/routes/sop.$id.tsx
- [ ] Create src/routes/sop.$id.procedure.tsx
- [ ] Create src/routes/sop.$id.overview.tsx
- [ ] Create src/routes/sop.$id.matrices.tsx (placeholder)
- [ ] Create src/routes/sop.$id.history.tsx (placeholder)
- [ ] Create src/routes/sop.new.tsx (placeholder)
- [ ] Create src/components/Layout.tsx
- [ ] Create src/components/StepSidebar.tsx
- [ ] Create src/components/StepDetail.tsx
- [ ] Create src/components/CalloutList.tsx
- [ ] Create src/components/DiscussionCard.tsx
- [ ] Create src/components/SOPCard.tsx
- [ ] Wire procedure page with data fetching
- [ ] All validation checks pass

### Status: ⬜ Next
