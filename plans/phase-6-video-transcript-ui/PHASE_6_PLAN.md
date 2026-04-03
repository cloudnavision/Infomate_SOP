# Phase 6: Video + Transcript UI

**Objective:** Surface the step clips (Phase 5) and transcript (Phase 2) on the Procedure page with 3-way synchronisation — clicking a step plays its clip, the transcript auto-scrolls to linked lines, and playing the full video auto-advances the step highlight.

**Status: 🔲 Pending**

**Detailed implementation plan:** [`docs/superpowers/plans/2026-04-02-phase6-video-transcript-ui.md`](../../docs/superpowers/plans/2026-04-02-phase6-video-transcript-ui.md)
**Design spec:** [`docs/superpowers/specs/2026-04-02-phase6-video-transcript-ui-design.md`](../../docs/superpowers/specs/2026-04-02-phase6-video-transcript-ui-design.md)

---

## Sub-Parts

| Sub-Part | File | Description | Status |
|----------|------|-------------|--------|
| 6a | [6a_store_and_hooks.md](6a_store_and_hooks.md) | Zustand store extensions + `useStepSync` hook | 🔲 Pending |
| 6b | [6b_video_player.md](6b_video_player.md) | `VideoPlayer` component — Video.js, clip/full toggle, fallback chain | 🔲 Pending |
| 6c | [6c_transcript_panel.md](6c_transcript_panel.md) | `TranscriptPanel` component — virtualised, searchable, click-to-seek | 🔲 Pending |
| 6d | [6d_procedure_layout.md](6d_procedure_layout.md) | 3-column grid layout + wire all components in procedure page | 🔲 Pending |

---

## Architecture

```
ProcedurePage (sop.$id.procedure.tsx)
├── StepSidebar [20%]           ← unchanged
├── Middle column [1fr]
│   ├── VideoPlayer             ← NEW: Video.js, clip mode default
│   └── StepDetail              ← modified: placeholder removed
└── TranscriptPanel [300px]     ← NEW: virtualised, auto-scroll, search

useStepSync (hook)
├── playerRef                   → passed to VideoPlayer
├── handleTimeUpdate            → called by VideoPlayer on timeupdate
└── seekTo                      → called by TranscriptPanel on line click

Sync rules:
  click step     → seek video  → scroll transcript
  video crosses step boundary  → advance sidebar (full video mode only)
  click transcript line        → seek video (switches to full video mode)
```

---

## New Dependencies

```bash
npm install video.js @videojs/http-streaming @tanstack/react-virtual
npm install -D @types/video.js
```

---

## New Files

| File | Purpose |
|------|---------|
| `src/components/VideoPlayer.tsx` | Video.js wrapper with clip/full toggle and screenshot fallback |
| `src/components/TranscriptPanel.tsx` | Virtualised transcript list with search and click-to-seek |
| `src/hooks/useStepSync.ts` | 3-way sync hook with ref-based circular-update guard |

## Modified Files

| File | Change |
|------|--------|
| `src/hooks/useSOPStore.ts` | Add `isPlaying`, `videoMode` state fields |
| `src/components/StepDetail.tsx` | Remove gray placeholder; fix `flex-1` for grid layout |
| `src/routes/sop.$id.procedure.tsx` | 3-column CSS grid; add VideoPlayer + TranscriptPanel |

---

## Video Placeholder Fallback Chain

```
clips[0].clip_url            → Video.js player (autoplay in clip mode)
annotated_screenshot_url     → <img> + "Clip processing..." badge
screenshot_url               → <img> + "Clip processing..." badge
(none)                       → gray placeholder (existing behaviour)
```

---

## Acceptance Criteria

- [ ] Clicking a step autoplays its clip in the video player
- [ ] "Full Video" toggle seeks to step's `timestamp_start` in the full recording
- [ ] "Full Video" toggle is disabled when `sop.video_url` is null
- [ ] Transcript panel highlights lines linked to the current step (blue border)
- [ ] Transcript panel auto-scrolls to first linked line on step change
- [ ] Clicking a transcript line seeks the video (switches to full video mode)
- [ ] In full video mode, video crossing step boundary auto-advances the sidebar
- [ ] In clip mode, clip end does NOT auto-advance
- [ ] Transcript search filters lines in real-time
- [ ] Transcript panel collapses/expands via toggle button
- [ ] No circular update loops between video, step, and transcript
- [ ] `npm run typecheck` passes with zero errors
