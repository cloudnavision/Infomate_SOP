# 6b: VideoPlayer Component

**Status: 🔲 Pending**

---

## Component

**File:** `src/components/VideoPlayer.tsx` (new)

**Library:** Video.js (`video.js` + `@videojs/http-streaming` + `@types/video.js`)

---

## Props

```typescript
interface Props {
  step: SOPStep | null
  sopVideoUrl: string | null
  playerRef: React.MutableRefObject<Player | null>
  onTimeUpdate: (time: number) => void
}
```

---

## Key Implementation Notes

### Always render `<video>` in DOM
Video.js is initialised once via `useEffect([], [])`. The `<video>` element must always be in the DOM at mount time. The player div is hidden with CSS (`hidden` class) when there is no source — the fallback content is shown on top. **Never conditionally render `<video>`.**

```tsx
{/* Always in DOM */}
<div data-vjs-player className={currentSrc ? 'block' : 'hidden'}>
  <video ref={videoElRef} className="video-js vjs-big-play-centered" />
</div>
{/* Fallback shown when no source */}
{!currentSrc && renderFallback()}
```

### Source swap guard
Before calling `player.src()`, compare against `player.currentSrc()` — prevents unnecessary restarts when the user toggles modes back and forth to the same source.

### Clip autoplay
In clip mode, after source swap → call `player.play()?.catch(() => {})`. The `.catch` silences the browser's autoplay-blocked promise rejection (common in Chrome).

---

## Fallback Chain

```
clips[0].clip_url            → Video.js player
annotated_screenshot_url     → <img> + amber "Clip processing..." badge
screenshot_url               → <img> + amber "Clip processing..." badge
(none)                       → existing gray placeholder
```

---

## Full Video Toggle

- Button label: "Full Video ▾" / "Step Clip ▴"
- Disabled + tooltip "Full video not available" when `sopVideoUrl` is null
- Calls `setVideoMode('full')` / `setVideoMode('clip')` in Zustand store
