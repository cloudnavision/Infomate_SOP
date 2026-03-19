# 2d: Navigation Features
## Status: ⬜

---

## Objective

Add user-facing navigation controls that tie the video, step sidebar, and transcript together:
- Clip mode toggle — constrain playback to the selected step's time range
- "Watch this step" button — jump video to the step's start time
- Keyboard shortcuts — power-user navigation without mouse
- Step timestamps in sidebar — show when each step starts

---

## Clip Mode Toggle

**What it does:** When clip mode is on, the video player only plays within the selected step's
`[start_time, end_time]` range. At `end_time`, playback pauses and resets to `start_time`.

**Implementation:**
- State lives in Zustand: `clipMode: boolean`, `setClipMode(v)`, toggled by `toggleClipMode`
- Toggle button sits above the `VideoPlayer` component in the procedure page
- `VideoPlayer` receives `clipRange` prop (derived from selected step when `clipMode = true`)
- The clipping logic is inside `VideoPlayer` (see `2a_video_player.md`)

**Toggle button:**

```tsx
const clipMode = useSOPStore((s) => s.clipMode)
const setClipMode = useSOPStore((s) => s.setClipMode)

<button
  onClick={() => setClipMode(!clipMode)}
  className={clsx(
    'text-xs px-3 py-1.5 rounded border font-medium',
    clipMode
      ? 'bg-blue-600 text-white border-blue-600'
      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
  )}
>
  {clipMode ? '✂ Clip Mode ON' : '✂ Clip Mode'}
</button>
```

**Placement:** In `sop.$id.procedure.tsx`, above the `VideoPlayer`:

```tsx
<div className="flex items-center justify-end mb-2">
  <ClipModeToggle />
</div>
<VideoPlayer videoUrl={sop.video_url ?? null} clipRange={activeClipRange} />
```

---

## "Watch this step" Button

**What it does:** Seeks the video to the selected step's `start_time`. Useful when the user
has scrolled the transcript or navigated away from the step's time position.

**Implementation:**

In `StepDetail.tsx`, add a button that:
1. Is only shown when `selectedStep.start_time !== null`
2. Calls `requestSeek(selectedStep.start_time)` from Zustand store

```tsx
const requestSeek = useSOPStore((s) => s.requestSeek)

{step.start_time !== null && (
  <button
    onClick={() => requestSeek(step.start_time!)}
    className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800"
  >
    <PlayCircle size={16} />
    Watch this step ({formatTime(step.start_time)})
  </button>
)}
```

`formatTime` is the same `[MM:SS]` formatter defined in `2c_transcript_panel.md` —
extract it to `src/utils/formatTime.ts` for shared use.

---

## Keyboard Shortcuts Hook

**File:** `src/hooks/useKeyboardShortcuts.ts`

**Shortcut table:**

| Key | Action |
|-----|--------|
| `↑` (ArrowUp) | Select previous step |
| `↓` (ArrowDown) | Select next step |
| `Space` | Toggle play/pause |
| `C` | Toggle clip mode |
| `←` (ArrowLeft) | Seek –5 seconds |
| `→` (ArrowRight) | Seek +5 seconds |

**Implementation:**

```typescript
interface UseKeyboardShortcutsOptions {
  steps: SOPStep[]
  onStepChange: (step: SOPStep) => void   // calls handleStepClick from useStepSync
}

export function useKeyboardShortcuts({ steps, onStepChange }: UseKeyboardShortcutsOptions) {
  const selectedStepId = useSOPStore((s) => s.selectedStepId)
  const currentVideoTime = useSOPStore((s) => s.currentVideoTime)
  const isPlaying = useSOPStore((s) => s.isPlaying)
  const clipMode = useSOPStore((s) => s.clipMode)
  const requestSeek = useSOPStore((s) => s.requestSeek)
  const setClipMode = useSOPStore((s) => s.setClipMode)
  // playerRef is not directly accessible here; use a store action for play/pause
  // Add togglePlayPause action to store that VideoPlayer reads via useEffect

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore shortcuts when user is typing in an input
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      const currentIndex = steps.findIndex((s) => s.id === selectedStepId)

      switch (e.key) {
        case 'ArrowUp': {
          e.preventDefault()
          if (currentIndex > 0) onStepChange(steps[currentIndex - 1])
          break
        }
        case 'ArrowDown': {
          e.preventDefault()
          if (currentIndex < steps.length - 1) onStepChange(steps[currentIndex + 1])
          break
        }
        case ' ': {
          e.preventDefault()
          // Signal VideoPlayer to toggle play/pause via store flag
          useSOPStore.getState().togglePlayPause()
          break
        }
        case 'c':
        case 'C': {
          setClipMode(!clipMode)
          break
        }
        case 'ArrowLeft': {
          e.preventDefault()
          requestSeek(Math.max(0, currentVideoTime - 5))
          break
        }
        case 'ArrowRight': {
          e.preventDefault()
          requestSeek(currentVideoTime + 5)
          break
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [steps, selectedStepId, currentVideoTime, clipMode])
}
```

**Additional Zustand action needed:**

```typescript
// Add to store:
playPauseRequested: boolean
togglePlayPause: () => void
clearPlayPauseRequest: () => void
```

`VideoPlayer` watches `playPauseRequested` and calls `player.play()` or `player.pause()` accordingly.

---

## Step Timestamps in Sidebar

Update `StepSidebar.tsx` to show `[MM:SS]` timestamp alongside each step title.

```tsx
// In the step list item:
<div className="flex items-center justify-between w-full">
  <span className="text-sm truncate">{step.title}</span>
  {step.start_time !== null && (
    <span className="text-xs text-gray-400 ml-2 flex-shrink-0">
      {formatTime(step.start_time)}
    </span>
  )}
</div>
```

This gives the user a quick reference for when each step appears in the video without needing
to click into it.

---

## Shared Utility

Extract timestamp formatter to a shared utility to avoid duplication across `StepSidebar`,
`StepDetail`, and `TranscriptPanel`:

**File:** `src/utils/formatTime.ts`

```typescript
export function formatTime(seconds: number | null): string {
  if (seconds === null) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
```

---

## Validation Checklist

- [ ] Clip mode toggle button visible above `VideoPlayer`
- [ ] Toggling clip mode changes button appearance (blue = on)
- [ ] With clip mode on, video pauses at step's `end_time`
- [ ] With clip mode on, video resets to step's `start_time` after pause
- [ ] "Watch this step" button visible in `StepDetail` (only when `start_time` is set)
- [ ] "Watch this step" seeks video to correct position
- [ ] `↑` / `↓` navigate steps (does not fire in search input)
- [ ] `Space` toggles play/pause
- [ ] `C` toggles clip mode
- [ ] `←` / `→` seek ±5 seconds
- [ ] Step timestamps `[MM:SS]` visible in sidebar (only when `start_time` is set)
- [ ] Keyboard shortcuts inactive when typing in transcript search input
- [ ] `formatTime` utility shared correctly (no duplicate implementations)
- [ ] TypeScript: `tsc --noEmit` 0 errors
