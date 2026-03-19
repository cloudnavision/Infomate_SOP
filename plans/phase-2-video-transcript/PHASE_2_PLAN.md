# Phase 2: Video + Transcript
## Status: ⬜ Next

---

## Goal

Add video playback and transcript viewing to the existing procedure page. The result is a
three-panel layout: Step Sidebar | Video Player + Step Detail | Transcript Panel.

Video-to-step synchronisation is the core engineering challenge — a single hook (`useStepSync`)
coordinates all three panels without circular updates.

---

## Sub-Parts

| Sub-Part | Description | Status |
|----------|-------------|--------|
| 2a | Video Player — Video.js embed, programmatic seek, clip mode | ⬜ |
| 2b | Step Sync Hook — Circular-safe coordination of video ↔ step ↔ transcript | ⬜ |
| 2c | Transcript Panel — Virtualised list, auto-scroll, speaker colours, search | ⬜ |
| 2d | Navigation Features — Clip mode toggle, keyboard shortcuts, step timestamps | ⬜ |

---

## Updated Procedure Page Layout

```
┌───────────┬──────────────────────────────┬────────────────┐
│           │  ┌──────────────────────┐    │                │
│  Step     │  │   Video Player       │    │  Transcript    │
│  Sidebar  │  │   [▶ 02:34 / 32:15] │    │  Panel         │
│           │  └──────────────────────┘    │                │
│  1. Log   │                              │ [00:00] Kanu:  │
│  2. Share │  Step Detail                 │  Morning...    │
│  3. Verify│  ─────────────               │ [00:07] Lasya: │
│  4. Dup   │  Title, description,         │  Hi Kanu...    │
│  5. Clear │  screenshot, callouts,       │ [00:32] Kanu:  │
│  6. Update│  discussions                 │  ← active      │
│  7. PM    │                              │ [00:52] Such:  │
│  8. Final │                              │  Yeah, sorry...│
└───────────┴──────────────────────────────┴────────────────┘
```

---

## Dependencies to Install

```bash
# In sop-platform/frontend/
npm install video.js @types/video.js
npm install @tanstack/react-virtual
```

---

## Zustand Store Additions (from Phase 1)

Phase 1 store: `useSOPStore.ts` has `selectedStepId`, `editMode`.

Phase 2 additions:

```typescript
// Video state
currentVideoTime: number          // seconds, updated at ~4Hz
isPlaying: boolean
clipMode: boolean                 // restrict playback to step range
seekRequested: number | null      // seconds to seek to; null = no seek pending
clearSeekRequest: () => void      // reset after VideoPlayer handles it

// Actions
setCurrentTime: (t: number) => void
setIsPlaying: (v: boolean) => void
setClipMode: (v: boolean) => void
requestSeek: (seconds: number) => void
```

---

## Sub-Part 2a: Video Player

**Goal:** Embed Video.js player with programmatic seek, throttled time updates, and clip mode.

See [`2a_video_player.md`](2a_video_player.md) for full execution plan.

### Summary
- `VideoPlayer.tsx` component wraps Video.js in a `useRef` + `useEffect`
- Props: `videoUrl: string | null`, `onTimeUpdate: (t: number) => void`, `clipRange?: [number, number]`
- Dispatches time updates at ~250ms intervals (4Hz) via `setInterval` inside Video.js `timeupdate` event
- Clip mode: listen for `timeupdate`, if `currentTime > clipRange[1]` → pause + seek back to `clipRange[0]`
- Programmatic seek via `seekRequested` from Zustand — `useEffect` watches store, calls `player.currentTime(t)`, then `clearSeekRequest()`
- Null state: show placeholder card "No video available for this SOP"
- **Note:** Phase 1 seed data has `video_url = null`. Use a public sample MP4 for local testing or keep placeholder until Phase 4 pipeline delivers real URLs.

---

## Sub-Part 2b: Step Sync Hook

**Goal:** Coordinate video time, step selection, and transcript scroll without circular updates.

See [`2b_step_sync.md`](2b_step_sync.md) for full execution plan.

### Summary
- `useStepSync(steps: SOPStep[])` hook — single source of coordination
- `seekSource` ref: `'sidebar' | 'video' | 'transcript' | 'none'`
- Video time → step: find first step where `step.start_time <= t < step.end_time`; only fires when `seekSource === 'none'`
- Step click → seek: set `seekSource = 'sidebar'`, call `requestSeek(step.start_time)`, debounce reset to `'none'` after 500ms
- Transcript click → seek + step: set `seekSource = 'transcript'`, seek + update selectedStepId
- Returns: `{ handleStepClick, handleTranscriptClick, activeTranscriptIndex }`

---

## Sub-Part 2c: Transcript Panel

**Goal:** Virtualised, searchable transcript with auto-scroll, speaker colours, click-to-seek.

See [`2c_transcript_panel.md`](2c_transcript_panel.md) for full execution plan.

### Summary
- `TranscriptPanel.tsx` fetches via `sopKeys.transcript(id)` (TanStack Query)
- `@tanstack/react-virtual` for virtualised list — only renders visible rows
- Speaker colours: hash speaker name → index into `SPEAKER_COLOURS` palette (8 colours)
- Active line: determined by `activeTranscriptIndex` from `useStepSync`
- Auto-scroll: `virtualizer.scrollToIndex(activeTranscriptIndex)` when active line changes; disabled if `scrollLock` is true
- Search: controlled `<input>`, filters lines, highlights matching text with `<mark>` tags
- Click: calls `handleTranscriptClick(line)` from `useStepSync`
- Step badge: lines with `linked_step_id !== null` show a coloured `S` badge

---

## Sub-Part 2d: Navigation Features

**Goal:** Clip mode toggle, "Watch this step" button, keyboard shortcuts, step timestamps.

See [`2d_navigation.md`](2d_navigation.md) for full execution plan.

### Summary
- Clip mode toggle button above `VideoPlayer` — toggles Zustand `clipMode`
- `"Watch this step"` button in `StepDetail` → seeks to step's `start_time`
- `useKeyboardShortcuts` hook: `↑`/`↓` (prev/next step), `Space` (play/pause), `C` (clip mode), `←`/`→` (seek ±5s)
- `StepSidebar` shows `[MM:SS]` timestamp next to each step title (from `step.start_time`)

---

## Checklist

### 2a: Video Player
- [ ] Install video.js + @types/video.js
- [ ] VideoPlayer component
- [ ] Time update events (4Hz throttled)
- [ ] Programmatic seek via store
- [ ] Clip mode (restrict to step range)
- [ ] Null state (no video URL)
- [ ] Zustand store updated (video state)

### 2b: Step Sync Hook
- [ ] useStepSync hook
- [ ] seekSource tracking
- [ ] Video time → step selection
- [ ] Step click → video seek
- [ ] Transcript click → video seek + step
- [ ] No circular update loops

### 2c: Transcript Panel
- [ ] Install @tanstack/react-virtual
- [ ] TranscriptPanel component
- [ ] Virtualised list
- [ ] Auto-scroll to active line
- [ ] Speaker colour coding
- [ ] Search with highlighting
- [ ] Click line → seek video
- [ ] Scroll lock toggle
- [ ] Step badges

### 2d: Navigation Features
- [ ] Clip mode toggle button
- [ ] "Watch this step" button
- [ ] Keyboard shortcuts (↑↓ Space C ←→)
- [ ] Step timestamps in sidebar
