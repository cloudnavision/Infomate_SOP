# Phase 6 Design Spec — Video + Transcript UI
**Date:** 2026-04-02
**Author:** Claude (brainstorming session)
**Status:** Reviewed — pending user approval
**Scope:** Procedure tab only (`/sop/:id/procedure`)

---

## 1. Problem Statement

The Procedure page currently shows step text, sub-steps, and callouts — but the video clips (Phase 5) and transcript (Phase 2) are not surfaced in the UI. Hotel staff learning a procedure have no way to watch the trainer demonstrate each step or read what was said during the KT session.

Phase 6 adds a **Video Player** and **Transcript Panel** to the Procedure page with 3-way synchronisation: clicking a step plays its clip, the transcript auto-scrolls to the relevant lines, and playing the full video auto-advances the step highlight.

---

## 2. Scope

### In scope
- 3-panel layout for the Procedure tab
- `VideoPlayer` component (Video.js, clip mode + full video mode)
- `TranscriptPanel` component (virtualised, searchable, click-to-seek)
- `useStepSync` hook (3-way sync with circular-update guard)
- Zustand store extensions
- Annotated screenshot fallback when no clip exists

### Out of scope (future phases)
- Step completion checkmarks (no DB schema)
- Video download (security: requires signed endpoint)
- New comments on transcript lines (needs own table + UI)
- Callout editor changes (Phase 4 complete, no regressions)
- Matrices tab, History tab (separate phases)

---

## 3. Layout

The Procedure tab becomes a **3-panel horizontal split**. Other tabs (Overview, Matrices, History) are unaffected.

```
┌──────────────┬──────────────────────────────┬──────────────────────┐
│  Steps  [7]  │  ▶ ████████████████  0:34    │  🔍 Search transcript│
│              │  [  Video Player   ] [Full ▾] │  ──────────────────  │
│  ● 1 Login   │  ─────────────────────────── │  0:12  Saara         │
│    2 Share   │  Step 1: Log in to the        │  Navigate to SBH     │
│    3 Verify  │  Shared Folder                │  accounts folder...  │
│    4 Dupl.   │                               │                      │
│    5 Clear   │  Navigate to the SBH          │► 0:34  Saara         │
│    6 Update  │  Accounts shared folder and   │  You'll find the     │
│    7 Verify  │  locate the Aged Debtor...    │  Credit Check sub... │
│              │                               │                      │
│              │  SUB-STEPS                    │  0:51  John          │
│              │  • Open SBH Accounts folder   │  So this is the      │
│              │  • Navigate into Credit Check │  same folder we use  │
│              │                               │  for the weekly...   │
│              │  CALLOUTS                     │                      │
│              │  ● 1. SBH Accounts folder     │                      │
└──────────────┴──────────────────────────────┴──────────────────────┘
      20%                   45%                         35%
```

**Responsive behaviour:** Transcript panel has a collapse toggle (chevron button). Defaults open on screens ≥ 1280px, collapsed on narrower screens. When collapsed, the middle panel expands to fill the space.

---

## 4. Video Player

### Library
**Video.js** — new dependencies to install:
```
npm install video.js @videojs/http-streaming
npm install -D @types/video.js
```
Also requires CSS import: `import 'video.js/dist/video-js.css'`

### Modes

| Mode | Source | Behaviour |
|---|---|---|
| **Clip** (default) | `step.clips[0].clip_url` | Autoplays when step is selected. Pauses at end. No auto-advance. |
| **Full video** | `sop.video_url` | Seeks to `step.timestamp_start` on step selection. Continues playing through whole recording. |

Toggle: "Full Video" button in top-right corner of player. Persists in Zustand store (`videoMode`).

**Guard:** When `sop.video_url` is null, the "Full Video" toggle is **disabled** with a tooltip "Full video not available". This prevents switching to full video mode with no source.

### Placeholder Fallback Chain
When no clip exists for a step, the video area shows the best available content:

```
1. clips[0].clip_url           → Video.js player
2. annotated_screenshot_url    → <img> + "Clip processing..." badge (amber)
3. screenshot_url              → <img> + "Clip processing..." badge (amber)
4. (none)                      → Gray placeholder (existing behaviour)
```

The badge disappears automatically once the clip URL becomes available (React Query refetch on window focus).

---

## 5. Transcript Panel

### Display
- Full transcript always visible (all lines, not filtered by step)
- Each line shows: `[MM:SS]  Speaker  content text`
- Lines linked to the **current step** (`linked_step_id = selectedStepId`):
  - Blue left border (2px)
  - Light blue background (`bg-blue-50`)
- Auto-scrolls to the **first** linked line when step changes

### Interactions
| Action | Result |
|---|---|
| Click any transcript line | Video seeks to `line.timestamp_sec` |
| Step changes | Panel scrolls to first linked line |
| Type in search box | Lines filtered in real-time (case-insensitive) |
| Clear search | Full transcript restored |

### Empty State
When `fetchTranscript` returns an empty array, the panel shows:
> "No transcript available for this SOP."

### Virtualisation
Uses `@tanstack/react-virtual` — new dependency to install:
```
npm install @tanstack/react-virtual
```
Only visible lines are rendered (performance for 100+ line transcripts).

---

## 6. 3-Way Synchronisation

### Sync Rules

| Trigger | Video | Sidebar | Transcript |
|---|---|---|---|
| User clicks step | Seeks to step start | Highlights step | Scrolls to linked lines |
| Video time crosses next step's `timestamp_start` *(full video mode only)* | Continues playing | Auto-advances highlight | Auto-scrolls |
| User clicks transcript line | Seeks to `timestamp_sec` | Updates step if timestamp is in a step's range | Line stays in view |
| Clip ends *(clip mode)* | Pauses | No change | No change |

### `useStepSync` Hook

Coordinates all three panels. Key state field: `seekSource: 'user' | 'sync' | null`.

- When a **user action** triggers a seek → set `seekSource = 'user'`
- The video `timeupdate` handler only fires step-advance logic when `seekSource !== 'sync'`
- Prevents circular loops: user clicks step → video seeks → timeupdate → don't re-select step

```ts
// Pseudocode
function useStepSync(steps: SOPStep[]) {
  // videoMode consumed from store (not a param)
  const { selectedStepId, setSelectedStep, seekSource, setSeekSource, videoMode } = useSOPStore()
  const playerRef = useRef<VideoJsPlayer>()

  // When step changes → seek video
  useEffect(() => {
    if (seekSource === 'sync') return  // already syncing, skip
    const step = steps.find(s => s.id === selectedStepId)
    if (!step) return
    playerRef.current?.currentTime(step.timestamp_start)
  }, [selectedStepId])

  // When video time updates → advance step (full video mode only)
  const handleTimeUpdate = useCallback((time: number) => {
    setSeekSource(null)  // reset guard at top of every timeupdate
    if (videoMode !== 'full') return
    const currentStep = steps.find(s =>
      time >= s.timestamp_start && (s.timestamp_end == null || time < s.timestamp_end)
    )
    if (currentStep && currentStep.id !== selectedStepId) {
      setSeekSource('sync')
      setSelectedStep(currentStep.id)
      // seekSource resets to null on next timeupdate call
    }
  }, [steps, selectedStepId, videoMode])
}
```

**`seekSource` lifecycle:**
- Starts as `null`
- Set to `'sync'` when video auto-advances a step
- Reset to `null` at the top of the next `handleTimeUpdate` call
- This ensures user clicks are never blocked for more than one video frame (typically ~33ms)

---

## 7. Zustand Store Changes

**File:** `src/hooks/useSOPStore.ts`

Add to existing store:

```ts
// New fields
currentVideoTime: number           // seconds, updated by Video.js timeupdate
isPlaying: boolean                 // player state
videoMode: 'clip' | 'full'         // persists across step changes
seekSource: 'user' | 'sync' | null // circular-update guard

// New actions
setCurrentVideoTime: (t: number) => void
setIsPlaying: (v: boolean) => void
setVideoMode: (m: 'clip' | 'full') => void
setSeekSource: (s: 'user' | 'sync' | null) => void
```

---

## 8. New Components

### `VideoPlayer.tsx`
- Wraps Video.js instance
- Props: `step: SOPStep`, `sopVideoUrl: string | null`, `videoMode: 'clip' | 'full'`
- Exposes `seek(seconds: number)` via ref
- Renders placeholder fallback chain when no clip
- Shows "Full Video" toggle button

### `TranscriptPanel.tsx`
- Props: `sopId: string`, `selectedStepId: string | null`, `onSeek: (seconds: number) => void`
- Fetches transcript via its own `useQuery(sopKeys.transcript(sopId), () => fetchTranscript(sopId))`
- **Data ownership note:** Transcript is fetched separately (not passed as prop from parent) because transcripts can be 100+ lines and are independent of the SOP detail query. React Query deduplicates the request if the parent also fetches it.
- Search filters a **derived** `filteredLines` array via `useMemo` — never mutates the React Query cache
- Virtualised list via `@tanstack/react-virtual`
- Shows "No transcript available." empty state when lines array is empty

### `useStepSync.ts`
- Consumes `useSOPStore`
- Returns `{ playerRef, handleTimeUpdate }`
- All sync logic lives here, not in components

---

## 9. Modified Files

| File | Change |
|---|---|
| `src/routes/sop.$id.procedure.tsx` | Change flex layout to 3-column CSS grid; render `VideoPlayer` + `TranscriptPanel` |
| `src/components/StepDetail.tsx` | Replace gray placeholder div with video/screenshot fallback logic; update root element from `flex-1` to grid-compatible class |
| `src/hooks/useSOPStore.ts` | Add 4 new state fields + actions |
| `src/api/client.ts` | No change needed — `fetchTranscript` already exists |

**Note on `StepDetail` sizing:** The component currently uses `flex-1 min-w-0` on its root div, which works in a flex container but has no effect in a CSS Grid layout. The root div class must be changed to a grid-compatible class (e.g. `overflow-y-auto`) when the parent switches to `display: grid`.

---

## 10. API Dependencies

All data already exists in the database. No new API endpoints needed.

| Data | Source | Already in types.ts? |
|---|---|---|
| Step clips | `step.clips[0].clip_url` | ✅ `StepClip.clip_url` |
| Full video URL | `sop.video_url` | ✅ `SOPDetail.video_url` |
| Transcript lines | `fetchTranscript(sopId)` | ✅ `TranscriptLine` |
| Step timestamps | `step.timestamp_start`, `step.timestamp_end` | ✅ `SOPStep` |

---

## 11. New Dependencies

```bash
npm install video.js @videojs/http-streaming @tanstack/react-virtual
npm install -D @types/video.js
```

---

## 12. Acceptance Criteria

- [ ] Selecting a step in the sidebar autoplays its clip in the video player
- [ ] "Full Video" toggle switches to the original recording at the correct timestamp
- [ ] Transcript panel shows all lines; current step's lines are highlighted in blue
- [ ] Clicking a transcript line seeks the video to that timestamp
- [ ] In full video mode, playing past a step's end timestamp auto-advances the sidebar
- [ ] In clip mode, no auto-advance on clip end
- [ ] Steps with no clip show annotated screenshot + "Clip processing..." badge
- [ ] Steps with no annotated screenshot show raw screenshot + badge
- [ ] Steps with nothing show existing gray placeholder
- [ ] Transcript search filters lines in real-time
- [ ] Transcript panel collapse toggle works; collapses by default on screens < 1280px
- [ ] No circular update loops (seekSource guard works)
- [ ] "Full Video" toggle is disabled with tooltip when `sop.video_url` is null
- [ ] TranscriptPanel shows "No transcript available." when transcript is empty
- [ ] Transcript search uses derived filtered array (React Query cache not mutated)
