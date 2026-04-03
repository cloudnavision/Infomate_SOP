# Procedure Page UI Redesign — Design Spec
**Date:** 2026-04-03
**Status:** Pending approval
**Scope:** Frontend only — no backend/API changes

---

## Goal

Redesign the SOP procedure page to match the reference mockup:
- Professional header with export actions
- Left sidebar shows both steps and sections navigation
- Center column: video + transcript + discussion (stacked)
- Right column: rich step detail card (screenshot, KT quote, callouts)

---

## Layout

### Page structure

```
┌─────────────────────────────────────────────────────────────────┐
│ SOPPageHeader                                                     │
│ "Aged debtor report"  Starboard Hotels | v1.x | 31 Dec 2025     │
│                       [Export DOCX] [Export PDF] [Share link]    │
├──────────────┬─────────────────────────┬────────────────────────┤
│ Left 220px   │ Center 1fr              │ Right 320px            │
│              │                         │                        │
│ PROCEDURE    │ VideoPlayer             │ StepCard               │
│ STEPS        │                         │                        │
│ 1. Login…    │ TranscriptPanel         │                        │
│ 2. Share…    │  (search + speakers)    │                        │
│              │                         │                        │
│ SECTIONS     │ DiscussionCard          │                        │
│ Process map  │  (if step has one)      │                        │
│ Comm matrix  │                         │                        │
└──────────────┴─────────────────────────┴────────────────────────┘
```

Grid: `grid-cols-[220px_1fr_320px]` — no collapse toggle (transcript is always visible in center).

---

## Components

### 1. `SOPPageHeader` (new)

Renders above the 3-column grid.

**Left:** SOP title (h1, bold)
**Sub-line:** `{client_name} | v1.x | Updated {meeting_date formatted as "31 Dec 2025"}`
- Version is always `v1.x` (no versioning system yet — static placeholder)
- Updated date = `sop.meeting_date` if available, else `sop.created_at` date

**Right:** Three action buttons
- **Export DOCX** — disabled, onClick shows inline toast "Export coming soon"
- **Export PDF** — disabled, onClick shows inline toast "Export coming soon"
- **Share link** — enabled, onClick copies `window.location.href` to clipboard, shows toast "Link copied!"

Toast: small fixed-bottom-right notification, disappears after 2s. A simple local `useState` is enough — no toast library needed.

---

### 2. `StepSidebar` (modify existing)

Add a `sections` prop (array of `SOPSection` — the type from `api/types.ts`; already included in `SOPDetail.sections`, no extra fetch needed).

Below the steps list, render a second block:

```
SECTIONS          ← small uppercase label
Process map       ← clickable, navigates to Overview tab § anchor
Communication matrix
Quality parameters
Statement of work
Property watch list
```

Each section link navigates to `/sop/{id}/overview` (TanStack Router `<Link>`). If the Overview tab doesn't yet support anchor scrolling, just navigate to the tab — anchor scroll is a Phase 7 polish item.

Pass `sop.sections` from `ProcedurePage` down to `StepSidebar`.

---

### 3. `StepCard` (new — replaces `StepDetail` in right panel)

A scrollable right-column card showing details for the selected step.

**Sections (top to bottom):**

1. **Step badge + title**
   - Circle badge with step number (blue, like the reference)
   - Step title as h2

2. **Description** — `step.description` text, if present

3. **Annotated screenshot thumbnail**
   - Show `step.annotated_screenshot_url` if available, else `step.screenshot_url`
   - Fixed height ~160px, object-fit cover, rounded
   - "Click to expand full screenshot" text link below image
   - Clicking opens `ScreenshotModal`
   - If neither URL exists: render nothing (no placeholder — clip processing badge not needed here)

4. **"From the KT session" block**
   - Pull transcript lines where `timestamp_sec` is within `[step.timestamp_start, step.timestamp_end]`
   - `timestamp_end` may be `null` — treat `null` as `Infinity` (no upper bound)
   - Show up to 3 lines as a styled quote block (italic, gray background)
   - Format: `"[content]"` — speaker attribution below each line
   - If no lines fall in range: show the single line with `timestamp_sec` closest to `step.timestamp_start` (by absolute difference)
   - If no transcript at all: render nothing

5. **▶ Play from [timestamp] link**
   - Format: `Play from 00:52`
   - `timestamp = formatTime(step.timestamp_start)`
   - onClick calls `onSeek(step.timestamp_start)` — prop passed from ProcedurePage

6. **Callouts** — existing `<CalloutList>` component, unchanged

7. **Discussions** — existing `<DiscussionCard>` components, unchanged

**Props:**
```ts
interface StepCardProps {
  step: SOPStep | null
  transcriptLines: TranscriptLine[]   // full transcript, passed from ProcedurePage, filtered internally
  onSeek: (seconds: number) => void   // calls seekTo from useStepSync — will switch video to 'full' mode if in 'clip' mode (intentional)
}
```

**Sub-steps:** Render `step.sub_steps` as a bulleted list between description and screenshot (same as current `StepDetail` — do not drop this).

---

### 4. `ScreenshotModal` (new)

Lightbox overlay for full screenshot view.

- Full-screen dark overlay (`fixed inset-0 bg-black/80 z-50`)
- Centered image, max 90vw × 90vh, object-fit contain
- Close button top-right (×) or click overlay to close
- No zoom/pan needed (Phase 8 annotation editor will handle that)

---

### 5. `TranscriptPanel` (modify)

The internal `useQuery` is removed. Lines are passed as a prop from `ProcedurePage` (lifted query).

**Revised props interface:**
```ts
interface Props {
  lines: TranscriptLine[]       // replaces sopId — data fetched in ProcedurePage
  onSeek: (seconds: number) => void
}
```

Other changes:
- Add "All speakers" filter pill button next to search — clicking cycles through `[All, ...unique speakers derived from lines prop]`
- Header label: "Synced transcript" (explicit `<h3>` or `<span>`)
- Virtualiser, search, auto-scroll logic unchanged
- Only one toast shows at a time (LIFO replacement — new toast replaces old, acceptable for this use case)

---

### 6. `ProcedurePage` (modify)

- Add `SOPPageHeader` above the grid
- Change grid from `grid-cols-[272px_1fr_300px]` to `grid-cols-[220px_1fr_320px]`
- Remove transcript collapse toggle state and button
- Move `TranscriptPanel` to center column (below VideoPlayer)
- Move `DiscussionCard` to center column (below TranscriptPanel)
- Add `StepCard` to right column
- Pass `sop.sections` to `StepSidebar`
- Pass `transcriptLines` and `onSeek` to `StepCard`

The `useQuery` for transcript (currently inside `TranscriptPanel`) needs to also be accessible in `StepCard` for the KT quote block. Options:
- **Lift the transcript query to `ProcedurePage`** and pass lines as a prop to both `TranscriptPanel` and `StepCard` ← recommended (single fetch, no duplication)
- Alternative: `StepCard` calls its own `useQuery` — React Query deduplicates, but it's messier

---

## Files Changed

| File | Action |
|---|---|
| `frontend/src/components/SOPPageHeader.tsx` | Create |
| `frontend/src/components/StepCard.tsx` | Create |
| `frontend/src/components/ScreenshotModal.tsx` | Create |
| `frontend/src/components/StepSidebar.tsx` | Modify (add sections) |
| `frontend/src/components/TranscriptPanel.tsx` | Modify (speaker filter, label) |
| `frontend/src/components/StepDetail.tsx` | **Delete** — remove import from `ProcedurePage`; functionality moved to `StepCard` |
| `frontend/src/routes/sop.$id.procedure.tsx` | Modify (new grid, header, lifted query) |

---

## Out of Scope

- Actual DOCX/PDF export implementation (Phase 7)
- Share link authentication / expiry (Phase 7)
- Overview tab anchor scrolling (Phase 7 polish)
- Transcript speaker editing (Phase 7)
- Annotation editor (Phase 8)
