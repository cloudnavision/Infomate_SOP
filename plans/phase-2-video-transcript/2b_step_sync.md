# 2b: Step Sync Hook
## Status: ⬜

---

## Objective

Implement `useStepSync` — a single hook that coordinates three-way synchronisation between:
- Video playback position
- Selected step in the sidebar
- Active line in the transcript panel

Without this hook, naive implementations produce **circular update loops**: video updates step →
step update triggers seek → seek triggers video update → loop.

---

## The Circular Update Problem

```
Video timeupdate
    → setSelectedStep(step)       ← "video changed step"
        → requestSeek(step.start) ← "step changed → seek video"  ← LOOP
            → video timeupdate
                → setSelectedStep...
```

The solution is a **`seekSource` ref** that records who initiated the most recent seek.
Only allow downstream reactions when `seekSource === 'none'`.

---

## seekSource Tracking

```typescript
type SeekSource = 'sidebar' | 'video' | 'transcript' | 'none'

const seekSource = useRef<SeekSource>('none')
```

Rules:
- `seekSource === 'none'` → video time may auto-select a step
- `seekSource === 'sidebar'` → video timeupdate should NOT update step selection (sidebar already did it)
- `seekSource === 'transcript'` → same; transcript click drove the seek
- After 500ms debounce, reset to `'none'`

The debounce is needed because Video.js fires `timeupdate` immediately after a programmatic seek,
before the player has caught up to the new position.

---

## Hook Interface

```typescript
interface UseStepSyncReturn {
  handleStepClick: (step: SOPStep) => void
  handleTranscriptClick: (line: TranscriptLine) => void
  activeTranscriptIndex: number   // index into transcript array; -1 if none
}

function useStepSync(steps: SOPStep[], transcript: TranscriptLine[]): UseStepSyncReturn
```

---

## findStepAtTime Algorithm

```typescript
function findStepAtTime(steps: SOPStep[], currentTime: number): SOPStep | null {
  // steps are ordered by step_number ascending
  // a step is "active" when start_time <= currentTime < end_time
  // if no step covers the current time, return null (between steps or no timestamps)
  return steps.find(
    (step) =>
      step.start_time !== null &&
      step.end_time !== null &&
      step.start_time <= currentTime &&
      currentTime < step.end_time
  ) ?? null
}
```

**Edge cases:**
- Step has `start_time = null` or `end_time = null` → skip (Phase 1 seed has no timestamps)
- Current time is between two steps → no step selected (sidebar shows previous selection)
- Video at exactly `end_time` → next step picks it up

---

## Full Hook Implementation Sketch

```typescript
export function useStepSync(
  steps: SOPStep[],
  transcript: TranscriptLine[]
): UseStepSyncReturn {
  const seekSource = useRef<SeekSource>('none')
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentVideoTime = useSOPStore((s) => s.currentVideoTime)
  const setSelectedStep = useSOPStore((s) => s.setSelectedStep)
  const requestSeek = useSOPStore((s) => s.requestSeek)

  const resetSeekSource = () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      seekSource.current = 'none'
    }, 500)
  }

  // Video time → step selection
  useEffect(() => {
    if (seekSource.current !== 'none') return   // sidebar or transcript drove this
    const step = findStepAtTime(steps, currentVideoTime)
    if (step) setSelectedStep(step.id)
  }, [currentVideoTime, steps])

  // Step click → video seek
  const handleStepClick = (step: SOPStep) => {
    seekSource.current = 'sidebar'
    setSelectedStep(step.id)
    if (step.start_time !== null) requestSeek(step.start_time)
    resetSeekSource()
  }

  // Transcript click → video seek + step selection
  const handleTranscriptClick = (line: TranscriptLine) => {
    seekSource.current = 'transcript'
    if (line.start_time !== null) requestSeek(line.start_time)
    const step = findStepAtTime(steps, line.start_time ?? 0)
    if (step) setSelectedStep(step.id)
    resetSeekSource()
  }

  // Active transcript line index
  const activeTranscriptIndex = transcript.findIndex(
    (line) =>
      line.start_time !== null &&
      line.end_time !== null &&
      line.start_time <= currentVideoTime &&
      currentVideoTime < line.end_time
  )

  return { handleStepClick, handleTranscriptClick, activeTranscriptIndex }
}
```

---

## Integration with StepSidebar

Pass `handleStepClick` as prop:

```tsx
// sop.$id.procedure.tsx
const { handleStepClick, handleTranscriptClick, activeTranscriptIndex } = useStepSync(sop.steps, transcript)

<StepSidebar steps={sop.steps} onStepClick={handleStepClick} />
```

Update `StepSidebar.tsx` to accept `onStepClick?: (step: SOPStep) => void` prop alongside
the existing Zustand `setSelectedStep`. When `onStepClick` is provided, call it instead of
`setSelectedStep` directly — `useStepSync` handles both.

---

## Integration with TranscriptPanel

Pass `handleTranscriptClick` and `activeTranscriptIndex` as props:

```tsx
<TranscriptPanel
  sopId={id}
  onLineClick={handleTranscriptClick}
  activeIndex={activeTranscriptIndex}
/>
```

---

## Validation Checklist

- [ ] `useStepSync` hook created at `src/hooks/useStepSync.ts`
- [ ] Click step in sidebar → video seeks to step's `start_time`
- [ ] Video plays past step boundary → next step highlights in sidebar (when timestamps exist)
- [ ] Click transcript line → video seeks to line's `start_time`
- [ ] Click transcript line → correct step highlights in sidebar
- [ ] No circular updates: click sidebar does NOT re-trigger step selection loop (check React DevTools renders)
- [ ] Steps with `start_time = null` handled gracefully (no seek, no crash)
- [ ] `activeTranscriptIndex` returns -1 when no line matches current time
- [ ] `activeTranscriptIndex` updates smoothly during playback
