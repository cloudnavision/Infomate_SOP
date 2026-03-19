# 2a: Video Player
## Status: ⬜

---

## Objective

Embed a Video.js player into the procedure page that:
- Plays any MP4/HLS video by URL
- Fires throttled time updates (~4Hz) to the Zustand store
- Accepts programmatic seek requests from the store
- Restricts playback to a step's time range when clip mode is active
- Shows a placeholder card when no video URL is available

---

## Dependencies

```bash
# Run in sop-platform/frontend/
npm install video.js
npm install --save-dev @types/video.js
```

Add to `vite.config.ts` — Video.js ships a CSS file that must be imported:
```typescript
// src/routes/sop.$id.procedure.tsx (or VideoPlayer.tsx)
import 'video.js/dist/video-js.css'
```

---

## Zustand Store Additions

Update `src/hooks/useSOPStore.ts` to add video state alongside existing `selectedStepId` / `editMode`:

```typescript
interface SOPState {
  // === Phase 1 (existing) ===
  selectedStepId: string | null
  editMode: boolean
  setSelectedStep: (id: string | null) => void
  toggleEditMode: () => void

  // === Phase 2 additions ===
  currentVideoTime: number          // seconds; updated at ~4Hz by VideoPlayer
  isPlaying: boolean
  clipMode: boolean                 // when true, restrict playback to step's time range
  seekRequested: number | null      // seconds to seek to; null = no pending seek

  setCurrentTime: (t: number) => void
  setIsPlaying: (v: boolean) => void
  setClipMode: (v: boolean) => void
  requestSeek: (seconds: number) => void
  clearSeekRequest: () => void
}
```

Implementation additions inside `create<SOPState>((set) => ({ ... }))`:

```typescript
currentVideoTime: 0,
isPlaying: false,
clipMode: false,
seekRequested: null,
setCurrentTime: (t) => set({ currentVideoTime: t }),
setIsPlaying: (v) => set({ isPlaying: v }),
setClipMode: (v) => set({ clipMode: v }),
requestSeek: (seconds) => set({ seekRequested: seconds }),
clearSeekRequest: () => set({ seekRequested: null }),
```

---

## VideoPlayer Component Specification

**File:** `src/components/VideoPlayer.tsx`

### Props

```typescript
interface VideoPlayerProps {
  videoUrl: string | null
  clipRange?: [number, number]   // [start, end] in seconds — provided by parent when clipMode is on
}
```

### Behaviour

1. **Mount:** Call `videojs(videoRef.current, options)` inside `useEffect`. Store player in `playerRef.current`.
2. **Unmount:** Call `playerRef.current?.dispose()` in cleanup.
3. **Time updates:**
   - Use a `setInterval` at 250ms (4Hz) to read `player.currentTime()` and call `setCurrentTime(t)`.
   - Also update `setIsPlaying(!player.paused())`.
   - Clear interval on unmount.
4. **Programmatic seek:**
   - `useEffect` watches `seekRequested` from store.
   - When non-null: `player.currentTime(seekRequested)`, then `clearSeekRequest()`.
5. **Clip mode:**
   - Inside the time update interval: if `clipMode && clipRange` and `player.currentTime() >= clipRange[1]`:
     - `player.pause()`
     - `player.currentTime(clipRange[0])`
6. **Null state:** If `videoUrl` is null, render placeholder:

```tsx
<div className="flex items-center justify-center bg-gray-100 rounded-lg h-48 text-gray-400">
  <p>No video available for this SOP</p>
  <p className="text-sm mt-1">Video will appear here after pipeline processing</p>
</div>
```

### Video.js Options

```typescript
const options: videojs.PlayerOptions = {
  controls: true,
  autoplay: false,
  preload: 'metadata',
  fluid: true,           // responsive width
  sources: [{ src: videoUrl, type: 'video/mp4' }],
}
```

For HLS support (Phase 4): add `type: 'application/x-mpegURL'` source entry.

### DOM Structure

```tsx
<div data-vjs-player>
  <video ref={videoRef} className="video-js vjs-big-play-centered" />
</div>
```

---

## Integration with Procedure Page

In `src/routes/sop.$id.procedure.tsx`, update layout:

```tsx
// Three-panel layout:
// [StepSidebar] | [VideoPlayer + StepDetail] | [TranscriptPanel (Phase 2c)]
<div className="flex h-full">
  <StepSidebar steps={sop.steps} />
  <div className="flex-1 flex flex-col p-4 gap-4">
    <VideoPlayer videoUrl={sop.video_url ?? null} clipRange={activeClipRange} />
    <StepDetail step={selectedStep} />
  </div>
  {/* TranscriptPanel added in 2c */}
</div>
```

`activeClipRange` is derived from the selected step:
```typescript
const activeClipRange: [number, number] | undefined = clipMode && selectedStep
  ? [selectedStep.start_time ?? 0, selectedStep.end_time ?? 0]
  : undefined
```

---

## Testing Approach

**Phase 1 seed data has `video_url = null`** for the Aged Debtor SOP. Until Phase 4 delivers real video URLs:

1. **Placeholder path (default):** `VideoPlayer` renders the null-state card. No Video.js initialised. Clean.
2. **Local sample (optional, for testing seek/clip logic):**
   - Drop any `.mp4` into `sop-platform/data/sample.mp4`
   - Temporarily hardcode `videoUrl="http://localhost:8000/static/sample.mp4"` in the procedure route
   - Or update the seed SQL: `UPDATE sops SET video_url = 'http://localhost:8000/static/sample.mp4'`
   - Add a FastAPI static files mount: `app.mount("/static", StaticFiles(directory="data"), name="static")`

---

## Validation Checklist

- [ ] `npm install video.js @types/video.js` runs without errors
- [ ] `VideoPlayer` renders null-state card when `videoUrl` is null
- [ ] `VideoPlayer` renders Video.js player when `videoUrl` is a valid URL
- [ ] Time updates fire at ~4Hz (check store `currentVideoTime` in React DevTools)
- [ ] `isPlaying` reflects actual playback state
- [ ] `requestSeek(30)` causes player to jump to 00:30
- [ ] Clip mode: player pauses and resets to `start_time` when `currentTime >= end_time`
- [ ] Player disposes cleanly on route unmount (no memory leaks in console)
- [ ] TypeScript: `tsc --noEmit` 0 errors
- [ ] Vite build passes
