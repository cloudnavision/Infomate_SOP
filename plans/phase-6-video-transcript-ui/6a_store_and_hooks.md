# 6a: Zustand Store Extensions + useStepSync Hook

**Status: 🔲 Pending**

---

## useSOPStore changes

**File:** `src/hooks/useSOPStore.ts`

Add two new fields to the existing store:

| Field | Type | Purpose |
|-------|------|---------|
| `isPlaying` | `boolean` | Tracks video play/pause state |
| `videoMode` | `'clip' \| 'full'` | Clip mode (default) or full recording mode |

> `seekSource` is intentionally kept as a `useRef` inside `useStepSync` — it is a frame-level guard that must update synchronously without triggering re-renders.

---

## useStepSync hook

**File:** `src/hooks/useStepSync.ts` (new)

Coordinates all three panels. Returns `{ playerRef, handleTimeUpdate, seekTo }`.

### Sync logic

```
selectedStepId changes
  → if seekSourceRef !== 'sync' AND videoMode === 'full'
  → seek player to step.timestamp_start

timeupdate fires (~250ms)
  → reset seekSourceRef = null
  → if videoMode === 'full'
  → find step whose range contains current time
  → if different from selectedStepId → set seekSourceRef = 'sync', setSelectedStep

transcript line clicked
  → if videoMode === 'clip' → switch to 'full'
  → seek player to line.timestamp_sec
```

### seekSource guard (ref-based)

| Value | Meaning |
|-------|---------|
| `null` | No active sync — user actions proceed normally |
| `'sync'` | Step change was triggered by video playback — skip the "seek video on step change" effect |
| `'user'` | User clicked a transcript line — seek in progress |

Reset: `seekSourceRef.current = null` at the top of every `handleTimeUpdate` call.
