# Phase 6 Implementation Plan — Video + Transcript UI
**Date:** 2026-04-02
**Spec:** `docs/superpowers/specs/2026-04-02-phase6-video-transcript-ui-design.md`
**Working directory:** `sop-platform/frontend/`

> **Note:** No test runner is installed in this project. Verification gate for each task is `npm run typecheck` (TypeScript compilation) + browser check at `http://localhost:5173`.

---

## File Map

### New files
| File | Purpose |
|---|---|
| `src/components/VideoPlayer.tsx` | Video.js wrapper — clip/full toggle, placeholder fallback chain |
| `src/components/TranscriptPanel.tsx` | Virtualised transcript — highlight, search, click-to-seek |
| `src/hooks/useStepSync.ts` | 3-way sync hook — video ↔ step ↔ transcript with seekSource guard |

### Modified files
| File | Change |
|---|---|
| `src/hooks/useSOPStore.ts` | Add 3 new state fields + actions (`seekSource` moved to ref in useStepSync) |
| `src/components/StepDetail.tsx` | Remove gray placeholder; fix `flex-1` → grid-compatible class |
| `src/routes/sop.$id.procedure.tsx` | 3-column grid layout; add VideoPlayer + TranscriptPanel |

---

## Task 1 — Install dependencies
**Time estimate:** 2 min

```bash
cd "d:/CloudNavision/1. Projects/SOP/SOP Automation System/sop-platform/frontend"
npm install video.js @videojs/http-streaming @tanstack/react-virtual
npm install -D @types/video.js
```

**Verify:**
```bash
npm run typecheck
```
Expected: zero errors (new packages don't introduce types yet — just confirming install succeeds).

Also verify `package.json` now contains:
```json
"video.js": "^8.x.x",
"@videojs/http-streaming": "^3.x.x",
"@tanstack/react-virtual": "^3.x.x"
```

---

## Task 2 — Extend Zustand store
**File:** `src/hooks/useSOPStore.ts`
**Time estimate:** 3 min

> **Note:** `seekSource` is intentionally NOT in the store. It lives as a `useRef` inside `useStepSync` (synchronous, no re-render overhead). Only store state that components need to read reactively.

Replace the entire file:

```typescript
import { create } from 'zustand'

interface SOPState {
  selectedStepId: string | null
  editMode: boolean
  isPlaying: boolean
  videoMode: 'clip' | 'full'

  setSelectedStep: (id: string | null) => void
  toggleEditMode: () => void
  setIsPlaying: (v: boolean) => void
  setVideoMode: (m: 'clip' | 'full') => void
}

export const useSOPStore = create<SOPState>((set) => ({
  selectedStepId: null,
  editMode: false,
  isPlaying: false,
  videoMode: 'clip',

  setSelectedStep: (id) => set({ selectedStepId: id }),
  toggleEditMode: () => set((state) => ({ editMode: !state.editMode })),
  setIsPlaying: (v) => set({ isPlaying: v }),
  setVideoMode: (m) => set({ videoMode: m }),
}))
```

**Verify:**
```bash
npm run typecheck
```
Expected: zero errors.

---

## Task 3 — Create VideoPlayer component
**File:** `src/components/VideoPlayer.tsx` (new file)
**Time estimate:** 5 min

> **C1 fix:** The `<video>` element is always rendered in the DOM so `videojs()` can initialize on mount. When no source is available, the player div is hidden (`hidden` class) and fallback content is shown instead. Never conditionally render the `<video>` element.
>
> **W2 fix:** Removed `vjs-theme-forest` class — it requires a separate `@videojs/themes` package not installed. Default Video.js skin is used.
>
> **W3 fix:** Source swap effect checks if the new source differs from the current player source before calling `.src()`, preventing unnecessary restarts.

```typescript
import { useEffect, useRef } from 'react'
import videojs from 'video.js'
import type Player from 'video.js/dist/types/player'
import 'video.js/dist/video-js.css'
import type { SOPStep } from '../api/types'
import { useSOPStore } from '../hooks/useSOPStore'

interface Props {
  step: SOPStep | null
  sopVideoUrl: string | null
  playerRef: React.MutableRefObject<Player | null>
  onTimeUpdate: (time: number) => void
}

export function VideoPlayer({ step, sopVideoUrl, playerRef, onTimeUpdate }: Props) {
  const { videoMode, setVideoMode } = useSOPStore()
  const videoElRef = useRef<HTMLVideoElement>(null)

  const clipUrl = step?.clips?.[0]?.clip_url ?? null
  const hasFullVideo = !!sopVideoUrl
  const currentSrc = videoMode === 'clip' ? clipUrl : sopVideoUrl

  // Initialise Video.js once on mount
  // The <video> element is always in the DOM so this effect always finds videoElRef.current
  useEffect(() => {
    if (!videoElRef.current) return

    const player = videojs(videoElRef.current, {
      controls: true,
      fluid: true,
      preload: 'auto',
    })

    playerRef.current = player

    player.on('timeupdate', () => {
      onTimeUpdate(player.currentTime() ?? 0)
    })

    return () => {
      player.dispose()
      playerRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Swap source only when it actually changes (W3: prevents unnecessary restarts)
  useEffect(() => {
    if (!playerRef.current || !currentSrc) return
    const existingSrc = playerRef.current.currentSrc()
    if (existingSrc === currentSrc) return  // already loaded, skip
    playerRef.current.src([{ src: currentSrc, type: 'video/mp4' }])
    if (videoMode === 'clip') {
      playerRef.current.play()?.catch(() => {/* autoplay may be blocked by browser */})
    }
  }, [currentSrc, videoMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // On step change in full video mode — seek to step start
  useEffect(() => {
    if (!playerRef.current || videoMode !== 'full' || !step) return
    playerRef.current.currentTime(step.timestamp_start)
  }, [step?.id, videoMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fallback content shown when no video source is available
  const renderFallback = () => {
    if (step?.annotated_screenshot_url) {
      return (
        <div className="relative">
          <img src={step.annotated_screenshot_url} className="w-full rounded" alt="Annotated screenshot" />
          <span className="absolute top-2 right-2 bg-amber-100 text-amber-700 text-xs px-2 py-1 rounded-full border border-amber-200">
            Clip processing...
          </span>
        </div>
      )
    }
    if (step?.screenshot_url) {
      return (
        <div className="relative">
          <img src={step.screenshot_url} className="w-full rounded" alt="Screenshot" />
          <span className="absolute top-2 right-2 bg-amber-100 text-amber-700 text-xs px-2 py-1 rounded-full border border-amber-200">
            Clip processing...
          </span>
        </div>
      )
    }
    return (
      <div className="bg-gray-100 rounded-lg p-8 border border-dashed border-gray-300 text-center">
        <p className="text-sm text-gray-400">Screenshot available after pipeline processing</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden mb-4 shrink-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {videoMode === 'clip' ? 'Step Clip' : 'Full Recording'}
        </span>
        <button
          onClick={() => setVideoMode(videoMode === 'clip' ? 'full' : 'clip')}
          disabled={!hasFullVideo && videoMode === 'clip'}
          title={!hasFullVideo ? 'Full video not available' : undefined}
          className="text-xs px-3 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {videoMode === 'clip' ? 'Full Video ▾' : 'Step Clip ▴'}
        </button>
      </div>
      <div className="p-3">
        {/* Video element is ALWAYS in DOM so Video.js initialises correctly (C1 fix) */}
        <div data-vjs-player className={currentSrc ? 'block' : 'hidden'}>
          <video ref={videoElRef} className="video-js vjs-big-play-centered w-full" />
        </div>
        {/* Fallback shown only when no video source */}
        {!currentSrc && renderFallback()}
      </div>
    </div>
  )
}
```

**Verify:**
```bash
npm run typecheck
```
Expected: zero errors.

---

## Task 4 — Create TranscriptPanel component
**File:** `src/components/TranscriptPanel.tsx` (new file)
**Time estimate:** 5 min

> **C2 fix:** Content capped with `line-clamp-3` (Tailwind v3.3+ built-in) so row height is predictable. Fixed `height: 72px` on each row + `estimateSize: () => 72` keeps virtualizer accurate without dynamic measurement.

```typescript
import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useQuery } from '@tanstack/react-query'
import { fetchTranscript, sopKeys } from '../api/client'
import { useSOPStore } from '../hooks/useSOPStore'

interface Props {
  sopId: string
  onSeek: (seconds: number) => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function TranscriptPanel({ sopId, onSeek }: Props) {
  const { selectedStepId } = useSOPStore()
  const [search, setSearch] = useState('')

  const { data: lines = [] } = useQuery({
    queryKey: sopKeys.transcript(sopId),
    queryFn: () => fetchTranscript(sopId),
  })

  // Derived filtered array — never mutates the React Query cache
  const filteredLines = useMemo(() => {
    if (!search.trim()) return lines
    const q = search.toLowerCase()
    return lines.filter(
      (l) =>
        l.content.toLowerCase().includes(q) ||
        l.speaker.toLowerCase().includes(q),
    )
  }, [lines, search])

  const parentRef = useRef<HTMLDivElement>(null)

  // Fixed-height rows: content is capped by line-clamp-3, estimateSize is reliable
  const virtualizer = useVirtualizer({
    count: filteredLines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 5,
  })

  // Auto-scroll to first line linked to the selected step
  useEffect(() => {
    if (!selectedStepId) return
    const idx = filteredLines.findIndex((l) => l.linked_step_id === selectedStepId)
    if (idx >= 0) {
      virtualizer.scrollToIndex(idx, { align: 'start' })
    }
  }, [selectedStepId, filteredLines]) // eslint-disable-line react-hooks/exhaustive-deps

  if (lines.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-gray-400 border-l border-gray-100">
        No transcript available.
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col border-l border-gray-100 bg-white">
      {/* Search */}
      <div className="px-3 py-2 border-b border-gray-100 shrink-0">
        <input
          type="text"
          placeholder="Search transcript..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Virtualised list */}
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        <div style={{ height: virtualizer.getTotalSize() + 'px', position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const line = filteredLines[virtualItem.index]
            const isLinked = line.linked_step_id === selectedStepId

            return (
              <div
                key={virtualItem.key}
                style={{
                  position: 'absolute',
                  top: virtualItem.start + 'px',
                  width: '100%',
                  height: '72px',  // matches estimateSize — keeps virtualizer accurate
                }}
                onClick={() => onSeek(line.timestamp_sec)}
                className={`px-3 py-2 cursor-pointer hover:bg-gray-50 border-l-2 transition-colors ${
                  isLinked ? 'border-blue-400 bg-blue-50' : 'border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs text-gray-400 font-mono tabular-nums">
                    {formatTime(line.timestamp_sec)}
                  </span>
                  <span className="text-xs font-semibold text-gray-600 truncate">
                    {line.speaker}
                  </span>
                </div>
                {/* line-clamp-3 enforces fixed height so row height matches estimateSize */}
                <p className="text-sm text-gray-700 leading-snug line-clamp-3">{line.content}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

**Verify:**
```bash
npm run typecheck
```
Expected: zero errors.

---

## Task 5 — Create useStepSync hook
**File:** `src/hooks/useStepSync.ts` (new file)
**Time estimate:** 4 min

> **W1 fix:** `seekSource` is a `useRef` (synchronous, no re-render overhead) rather than Zustand state. This eliminates the race condition where `timeupdate` (firing every ~250ms) could reset the flag before the `useEffect` reading it had a chance to run.

```typescript
import { useCallback, useEffect, useRef } from 'react'
import type Player from 'video.js/dist/types/player'
import { useSOPStore } from './useSOPStore'
import type { SOPStep } from '../api/types'

export function useStepSync(steps: SOPStep[]) {
  const { selectedStepId, setSelectedStep, videoMode, setVideoMode } = useSOPStore()

  const playerRef = useRef<Player | null>(null)
  // Ref-based guard: synchronous update, no re-render, immune to timeupdate race
  const seekSourceRef = useRef<'user' | 'sync' | null>(null)

  // When selected step changes → seek video to step start (full video mode only)
  // Skip if the step change was triggered by the sync itself
  useEffect(() => {
    if (seekSourceRef.current === 'sync') return
    if (!playerRef.current || !selectedStepId || videoMode !== 'full') return
    const step = steps.find((s) => s.id === selectedStepId)
    if (!step) return
    playerRef.current.currentTime(step.timestamp_start)
  }, [selectedStepId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Called by VideoPlayer on every timeupdate event (~250ms interval)
  const handleTimeUpdate = useCallback(
    (time: number) => {
      seekSourceRef.current = null  // reset guard synchronously at top of every call

      if (videoMode !== 'full') return

      const currentStep = steps.find(
        (s) =>
          time >= s.timestamp_start &&
          (s.timestamp_end == null || time < s.timestamp_end),
      )

      if (currentStep && currentStep.id !== selectedStepId) {
        seekSourceRef.current = 'sync'
        setSelectedStep(currentStep.id)
        // seekSourceRef resets to null on next timeupdate call (~250ms later)
      }
    },
    [steps, selectedStepId, videoMode, setSelectedStep],
  )

  // Called by TranscriptPanel when a transcript line is clicked
  const seekTo = useCallback(
    (seconds: number) => {
      if (!playerRef.current) return
      seekSourceRef.current = 'user'

      // Transcript lines have absolute timestamps — switch to full video so seek makes sense
      if (videoMode === 'clip') {
        setVideoMode('full')
      }

      playerRef.current.currentTime(seconds)
    },
    [videoMode, setVideoMode],
  )

  return { playerRef, handleTimeUpdate, seekTo }
}
```

**Verify:**
```bash
npm run typecheck
```
Expected: zero errors.

---

## Task 6 — Update StepDetail: remove placeholder, fix layout class
**File:** `src/components/StepDetail.tsx`
**Time estimate:** 3 min

**Change 1** — Line 12: Remove `flex-1` from the empty-state div (it won't work inside a grid):
```diff
- <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
+ <div className="flex items-center justify-center text-gray-400 text-sm py-16">
```

**Change 2** — Line 21: Replace `flex-1 min-w-0` with `min-w-0 overflow-y-auto` (grid-compatible):
```diff
- <div className="flex-1 min-w-0 bg-white rounded-lg shadow-sm border border-gray-100 p-6 space-y-6">
+ <div className="min-w-0 bg-white rounded-lg shadow-sm border border-gray-100 p-6 space-y-6 overflow-y-auto">
```

**Change 3** — Lines 30-32: Delete the gray placeholder div entirely (VideoPlayer now owns this):
```diff
-     <div className="bg-gray-100 rounded-lg p-8 border border-dashed border-gray-300 text-center">
-       <p className="text-sm text-gray-400">Screenshot available after pipeline processing</p>
-     </div>
-
```

Final `StepDetail.tsx` after changes:

```typescript
import type { SOPStep } from '../api/types'
import { CalloutList } from './CalloutList'
import { DiscussionCard } from './DiscussionCard'

interface Props {
  step: SOPStep | null
}

export function StepDetail({ step }: Props) {
  if (!step) {
    return (
      <div className="flex items-center justify-center text-gray-400 text-sm py-16">
        Select a step from the sidebar to view details
      </div>
    )
  }

  const subSteps = Array.isArray(step.sub_steps) ? step.sub_steps as string[] : []

  return (
    <div className="min-w-0 bg-white rounded-lg shadow-sm border border-gray-100 p-6 space-y-6 overflow-y-auto">
      <h2 className="text-xl font-semibold text-gray-900">
        Step {step.sequence}: {step.title}
      </h2>

      {step.description && (
        <p className="text-gray-700 leading-relaxed">{step.description}</p>
      )}

      {subSteps.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Sub-steps
          </h4>
          <ul className="space-y-1 list-disc list-inside text-sm text-gray-700">
            {subSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <CalloutList callouts={step.callouts} />

      {step.discussions.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Discussion
          </h4>
          {step.discussions.map((d) => (
            <DiscussionCard key={d.id} discussion={d} />
          ))}
        </div>
      )}
    </div>
  )
}
```

**Verify:**
```bash
npm run typecheck
```
Expected: zero errors. Browser: existing procedure page still shows step title/description/callouts (gray box is gone — that's expected since VideoPlayer not wired yet).

---

## Task 7 — Update ProcedurePage: 3-column grid + wire all components
**File:** `src/routes/sop.$id.procedure.tsx`
**Time estimate:** 5 min

Replace entire file:

```typescript
import { createFileRoute, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSOPStore } from '../hooks/useSOPStore'
import { useStepSync } from '../hooks/useStepSync'
import { StepSidebar } from '../components/StepSidebar'
import { StepDetail } from '../components/StepDetail'
import { VideoPlayer } from '../components/VideoPlayer'
import { TranscriptPanel } from '../components/TranscriptPanel'
import { fetchSOP, sopKeys } from '../api/client'

export const Route = createFileRoute('/sop/$id/procedure')({
  component: ProcedurePage,
})

function ProcedurePage() {
  const { id } = useParams({ from: '/sop/$id/procedure' })
  const { data: sop } = useQuery({
    queryKey: sopKeys.detail(id),
    queryFn: () => fetchSOP(id),
  })
  const { selectedStepId, setSelectedStep } = useSOPStore()
  const { playerRef, handleTimeUpdate, seekTo } = useStepSync(sop?.steps ?? [])

  // Transcript panel open by default on wide screens
  const [transcriptOpen, setTranscriptOpen] = useState(
    () => window.innerWidth >= 1280,
  )

  const selectedStep = sop?.steps.find((s) => s.id === selectedStepId) ?? null

  // Auto-select first step
  useEffect(() => {
    if (sop && !selectedStepId && sop.steps.length > 0) {
      setSelectedStep(sop.steps[0].id)
    }
  }, [sop, selectedStepId, setSelectedStep])

  if (!sop) return null

  return (
    <div
      className={`grid gap-0 h-[calc(100vh-11rem)] ${
        transcriptOpen
          ? 'grid-cols-[272px_1fr_300px]'
          : 'grid-cols-[272px_1fr_28px]'  // 28px holds the collapse toggle button (W5 fix)
      }`}
    >
      {/* Left: Steps sidebar */}
      <div className="overflow-y-auto">
        <StepSidebar steps={sop.steps} />
      </div>

      {/* Middle: Video + Step detail */}
      <div className="flex flex-col min-h-0 overflow-hidden px-4">
        <VideoPlayer
          step={selectedStep}
          sopVideoUrl={sop.video_url ?? null}
          playerRef={playerRef}
          onTimeUpdate={handleTimeUpdate}
        />
        <div className="flex-1 overflow-y-auto">
          <StepDetail step={selectedStep} />
        </div>
      </div>

      {/* Right: Transcript panel + collapse toggle */}
      <div className="relative flex min-h-0">
        {/* Collapse toggle button */}
        <button
          onClick={() => setTranscriptOpen((v) => !v)}
          className="absolute -left-3 top-4 z-10 w-6 h-6 bg-white border border-gray-200 rounded-full shadow-sm flex items-center justify-center text-gray-400 hover:text-gray-600 hover:shadow-md transition-all"
          title={transcriptOpen ? 'Collapse transcript' : 'Open transcript'}
        >
          {transcriptOpen ? '›' : '‹'}
        </button>

        {transcriptOpen && (
          <div className="flex-1 min-h-0 h-full">
            <TranscriptPanel sopId={id} onSeek={seekTo} />
          </div>
        )}
      </div>
    </div>
  )
}
```

**Verify:**
```bash
npm run typecheck
```
Expected: zero errors.

**Browser check at `http://localhost:5173`:**
- [ ] Procedure page shows 3 columns
- [ ] Clicking a step plays its clip (or shows screenshot fallback)
- [ ] Transcript panel shows all lines; current step lines are highlighted blue
- [ ] Clicking a transcript line seeks the video
- [ ] Collapse toggle hides/shows transcript panel
- [ ] "Full Video" toggle disabled when `sop.video_url` is null
- [ ] Selecting a step in full video mode seeks to `timestamp_start`
- [ ] Playing full video past a step boundary auto-advances the sidebar highlight

---

## Task 8 — Responsive check and final polish
**Time estimate:** 3 min

Resize browser to 1024px width:
- [ ] Transcript panel collapses automatically (it was initialised collapsed at < 1280px)
- [ ] Middle panel fills the available space
- [ ] Video player resizes correctly (Video.js `fluid: true` handles this)

If the `h-[calc(100vh-11rem)]` height looks wrong (panels too short or overflowing), adjust the value:
- Check the actual header height in Layout.tsx + tab bar height in `sop.$id.tsx`
- Common values: `8rem` (header only), `10rem` (header + tabs), `11rem` (header + tabs + page padding)
- Adjust until the 3 panels fill the viewport without a page-level scrollbar

**Commit when all browser checks pass:**
```bash
git add src/
git commit -m "feat: Phase 6 — video player + transcript panel on procedure page"
```

---

## Rollback

If anything breaks, the only changed existing files are:
- `useSOPStore.ts` — revert by removing 4 fields (no API changes)
- `StepDetail.tsx` — restore the gray placeholder div + `flex-1` class
- `sop.$id.procedure.tsx` — restore the original 8-line component

All 3 new files (`VideoPlayer`, `TranscriptPanel`, `useStepSync`) can simply be deleted.
