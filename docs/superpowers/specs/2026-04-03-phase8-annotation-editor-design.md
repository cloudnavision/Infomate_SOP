# Phase 8 — Annotation Editor Design Spec

**Date:** 2026-04-03
**Status:** Draft
**Stack:** React + Konva.js + FastAPI + sop-extractor

---

## Goal

Allow Editor-role users to correct Gemini-generated callout coordinates on step screenshots via a drag-and-drop canvas modal. After editing, re-render the annotated screenshot PNG and persist changes to Supabase.

---

## Context

- Phase 4 generated callouts using Gemini-only (Workflow 3b) — all have `confidence = gemini_only`
- `target_x` / `target_y` are stored as **integers (0–100)** in `step_callouts` table (`Mapped[int]` in models.py). Integer precision (1%) is sufficient for callout positioning — **no DB migration needed**. All coordinate values must be rounded to int before writing.
- `annotated_screenshot_url` stores the pre-rendered PNG with circles drawn by sop-extractor
- A PATCH endpoint for callouts does **not** exist yet — must be created
- A re-render endpoint does **not** exist yet in sop-extractor — must be created
- Editor role already exists in auth system (Phase 1.5); `require_editor` dependency already defined in `auth.py`
- Role in frontend is available via `useAuth().appUser.role` — **not** via `useSOPStore`

---

## Scope (Phase 8)

**In scope:**
- "Edit Callouts" button in StepCard — Editor role only
- Full-screen modal with Konva.js canvas
- Drag to reposition callouts, add new, delete existing
- PATCH `/api/steps/{step_id}/callouts` — bulk update callout positions
- POST `/api/render-annotated/{step_id}` in sop-extractor — re-render PNG
- Confidence colour coding (green/amber/blue)

**Out of scope:**
- Editing callout label text or descriptions (Phase 9+)
- Multi-step batch edit
- Undo/redo history
- Callout reordering

---

## UI Design

### Entry Point — StepCard

In `StepCard.tsx`, below the screenshot thumbnail, for Editor role only:

```
┌─────────────────────────────┐
│  [screenshot thumbnail]     │
│  Click to expand full...    │  ← existing lightbox (all roles)
│  [✎ Edit Callouts]          │  ← NEW — Editor role only
└─────────────────────────────┘
```

The button is hidden for Viewer role via `useSOPStore` role check.

### Annotation Editor Modal

Full-screen modal overlay (z-index above everything). Two-column layout:

```
┌─────────────────────────────────────────────────────────────────┐
│ [STEP N]  Step Title                    [gemini_only ⚠]  [Cancel] [Save] │
├──────────────────────────────────────┬──────────────────────────┤
│                                      │  CALLOUTS — N total      │
│  [toolbar: move | add | delete]      │  ┌────────────────────┐  │
│                                      │  │ ① Label   [gemini] │  │
│  [Konva Stage — screenshot + dots]   │  │ description        │  │
│                                      │  │ x:18% y:12%  [✕]  │  │
│                                      │  └────────────────────┘  │
│  [hint: drag to reposition]          │  ┌────────────────────┐  │
│                                      │  │ ② ...              │  │
│                                      │  └────────────────────┘  │
│                                      │  [↻ Re-render PNG]       │
├──────────────────────────────────────┴──────────────────────────┤
│  Step N of M · N callouts · ⚠ Gemini-only — verify positions   │
└─────────────────────────────────────────────────────────────────┘
```

### Callout Dot Colour Coding

| Colour | Meaning |
|--------|---------|
| 🟢 Green | `confidence = ocr_exact` or `ocr_fuzzy` |
| 🟡 Amber | `confidence = gemini_only` (not yet repositioned) |
| 🔵 Blue | `was_repositioned = true` (user has moved it) |

---

## Data Flow

### Load
```
StepCard → [Edit Callouts] click
  → open AnnotationEditorModal
  → use existing callouts from useSOPStore (already loaded with step data)
  → no extra API call needed on open
```

### Save
```
User repositions dots → local state only (no auto-save)
[Save Changes] click
  → PATCH /api/steps/{step_id}/callouts
      body: [{ id, target_x, target_y, was_repositioned: true }, ...]
  → sop-api updates step_callouts in Supabase
  → (optional) POST /api/sop-extractor-proxy/render-annotated/{step_id}
      → sop-extractor re-renders PNG → uploads to Azure Blob
      → sop-api updates step.annotated_screenshot_url in Supabase
  → modal closes → StepCard refreshes screenshot
```

### Re-render PNG (separate button)
```
[↻ Re-render Annotated PNG] click (inside modal)
  → POST /api/steps/{step_id}/render-annotated (sop-api proxy)
  → sop-extractor: load screenshot_url → draw circles at target_x/y → upload PNG
  → returns new annotated_screenshot_url
  → update local state (preview updates immediately)
```

---

## New API Endpoints

### 1. PATCH `/api/steps/{step_id}/callouts`

**Location:** `api/app/routes/steps.py`
**Auth:** Editor role required
**Body:**
```json
[
  { "id": "uuid", "target_x": 23, "target_y": 14, "was_repositioned": true },
  { "id": "uuid", "target_x": 55, "target_y": 30, "was_repositioned": false }
]
```
**Note:** `target_x` and `target_y` are integers (0–100). Frontend must `Math.round()` before sending.

**Logic:** Bulk update `step_callouts` rows where `step_id` matches. On first reposition (transitioning `was_repositioned` false → true), server copies current `target_x/y` into `original_x/y` before overwriting. Return updated callout list.

### 2. POST `/api/steps/{step_id}/render-annotated`

**Location:** `api/app/routes/steps.py` (proxy to extractor)
**Auth:** Editor role required (`Depends(require_editor)`)
**Logic:** Fetch step + callouts from DB → POST to `http://sop-extractor:8001/api/render-annotated` (internal Docker network only, not exposed via Cloudflare) → update `steps.annotated_screenshot_url` → return `{ annotated_screenshot_url }`.

### 3. POST `/api/render-annotated` (sop-extractor)

**Location:** `extractor/app/main.py`
**Body:**
```json
{
  "step_id": "uuid",
  "screenshot_url": "https://...",
  "callouts": [
    { "number": 1, "target_x": 23, "target_y": 14 }
  ],
  "azure_blob_base_url": "https://<account>.blob.core.windows.net/infsop",
  "azure_sas_token": "?sv=..."
}
```
**Note:** `azure_blob_base_url` and `azure_sas_token` sourced from sop-api environment variables — same pattern as `/api/render-doc`. This endpoint is **internal only** (Docker network), not exposed via Cloudflare tunnel.

**Logic:** Download screenshot from Azure SAS URL → draw numbered circles using Pillow (already in requirements.txt at v10.4.0) → upload PNG to Azure Blob at `frames/{step_id}/annotated.png` → return `{ annotated_screenshot_url }`.

---

## New Frontend Components

### `AnnotationEditorModal.tsx`

- Full-screen modal, z-50
- Props: `sopId`, `stepId`, `stepTitle`, `stepNumber`, `screenshotUrl`, `callouts[]`, `onClose`, `onSaved`
  - `sopId` is required for React Query cache invalidation (`sopKeys.detail(sopId)`) after save
- State: `localCallouts` (copy of prop callouts for editing), `saving`, `rerendering`, `activeDotId`
- Konva `Stage` + `Layer` + one `Circle` + `Text` per callout
- **Coordinate mapping:** `x_px = (target_x / 100) * stageWidth`, `y_px = (target_y / 100) * stageHeight` where `stageWidth`/`stageHeight` are the rendered Konva Stage dimensions (not the native image resolution). On `onDragEnd`: `target_x = Math.round((node.x() / stageWidth) * 100)`.
- Drag: Konva built-in `draggable` on each `Circle` group — `onDragEnd` updates `localCallouts`
- Add mode: `Stage` onClick → add new callout at click position
- On Save: PATCH endpoint → if success: invalidate `sopKeys.detail(sopId)` → close modal

### Changes to `StepCard.tsx`

- Import `useAuth` from auth context; read `appUser?.role`
- StepCard already receives `sopId` via props or parent context — pass it down to modal
- Add `useState<boolean>` for `editorOpen`
- Below screenshot thumbnail: render `<button>Edit Callouts</button>` if role === 'editor' or role === 'admin'
- Render `<AnnotationEditorModal sopId={sopId} stepId={...} ...>` when `editorOpen`

---

## File Map

| File | Action |
|------|--------|
| `frontend/src/components/AnnotationEditorModal.tsx` | Create — Konva modal editor |
| `frontend/src/components/StepCard.tsx` | Edit — add Edit Callouts button + modal mount |
| `frontend/src/api/client.ts` | Edit — add `patchCallouts()`, `renderAnnotated()` |
| `frontend/src/api/types.ts` | Edit — add `CalloutPatchItem` interface |
| `api/app/routes/steps.py` | Edit — add PATCH callouts + POST render-annotated endpoints |
| `api/app/schemas.py` | Edit — add `CalloutPatchItem`, `CalloutPatchResponse`, `RenderAnnotatedResponse` |
| `extractor/app/main.py` | Edit — add `POST /api/render-annotated` endpoint |
| `extractor/app/annotator.py` | Create — Pillow circle-drawing + Azure upload logic |
| `extractor/requirements.txt` | Edit — confirm `Pillow` present (likely already installed) |

---

## Key Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Konva.js for canvas | Declarative React binding, built-in drag, no raw canvas API |
| 2 | Percentages (not pixels) for coordinates | Resolution-independent; DB already stores as 0–100 float |
| 3 | No auto-save | Prevents accidental overwrites; explicit Save is safer |
| 4 | Re-render is a separate button | Pillow render takes ~2s; don't block Save flow |
| 5 | Pillow for PNG annotation | Already available in extractor image; simpler than Konva server-side |
| 6 | Bulk PATCH (not per-callout) | One round-trip; atomic — all positions update together |
