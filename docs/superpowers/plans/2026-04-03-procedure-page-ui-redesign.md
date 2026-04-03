# Procedure Page UI Redesign — Implementation Plan
**Date:** 2026-04-03
**Spec:** `docs/superpowers/specs/2026-04-03-procedure-page-ui-redesign.md`
**Branch:** develop

---

## File Map

| Action | File |
|--------|------|
| CREATE | `frontend/src/components/SOPPageHeader.tsx` |
| CREATE | `frontend/src/components/ScreenshotModal.tsx` |
| CREATE | `frontend/src/components/StepCard.tsx` |
| MODIFY | `frontend/src/components/StepSidebar.tsx` |
| MODIFY | `frontend/src/components/TranscriptPanel.tsx` |
| MODIFY | `frontend/src/routes/sop.$id.procedure.tsx` |
| DELETE | `frontend/src/components/StepDetail.tsx` |

No backend, API, or type changes needed — all types already exist in `api/types.ts`.

---

## Verification approach

No test runner is configured. Verification for each task:
1. TypeScript build passes: `docker compose exec sop-frontend npx tsc --noEmit`
2. Visual check in browser at `localhost:5173`

After all tasks: full Docker rebuild.

---

## Task 1 — Create `SOPPageHeader`

**File:** `frontend/src/components/SOPPageHeader.tsx` (create)

```tsx
import { useState } from 'react'
import type { SOPDetail } from '../api/types'

interface Props {
  sop: SOPDetail
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function SOPPageHeader({ sop }: Props) {
  const [toast, setToast] = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  function handleShare() {
    navigator.clipboard.writeText(window.location.href)
    showToast('Link copied!')
  }

  const dateStr = sop.meeting_date
    ? formatDate(sop.meeting_date)
    : formatDate(sop.created_at)

  const meta = [sop.client_name, 'v1.x', dateStr ? `Updated ${dateStr}` : null]
    .filter(Boolean)
    .join(' | ')

  return (
    <div className="flex items-start justify-between px-1 py-4 border-b border-gray-100 mb-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{sop.title}</h1>
        {meta && <p className="text-sm text-gray-500 mt-0.5">{meta}</p>}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          disabled
          onClick={() => showToast('Export coming soon')}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded text-gray-400 cursor-not-allowed"
        >
          Export DOCX
        </button>
        <button
          disabled
          onClick={() => showToast('Export coming soon')}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded text-gray-400 cursor-not-allowed"
        >
          Export PDF
        </button>
        <button
          onClick={handleShare}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Share link
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
```

**Verify:** `npx tsc --noEmit` inside the frontend container — zero errors.

---

## Task 2 — Create `ScreenshotModal`

**File:** `frontend/src/components/ScreenshotModal.tsx` (create)

```tsx
import { useEffect } from 'react'

interface Props {
  src: string
  alt?: string
  onClose: () => void
}

export function ScreenshotModal({ src, alt = 'Screenshot', onClose }: Props) {
  // Close on Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-8 right-0 text-white text-xl font-bold hover:text-gray-300"
        >
          ✕
        </button>
        <img
          src={src}
          alt={alt}
          className="max-w-[90vw] max-h-[90vh] object-contain rounded shadow-2xl"
        />
      </div>
    </div>
  )
}
```

**Verify:** TypeScript build passes.

---

## Task 3 — Create `StepCard`

**File:** `frontend/src/components/StepCard.tsx` (create)

This replaces `StepDetail` in the right panel with a richer card.

```tsx
import { useState } from 'react'
import type { SOPStep, TranscriptLine } from '../api/types'
import { CalloutList } from './CalloutList'
import { DiscussionCard } from './DiscussionCard'
import { ScreenshotModal } from './ScreenshotModal'

interface Props {
  step: SOPStep | null
  transcriptLines: TranscriptLine[]
  onSeek: (seconds: number) => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function getKTLines(step: SOPStep, lines: TranscriptLine[]): TranscriptLine[] {
  const end = step.timestamp_end ?? Infinity
  const inRange = lines.filter(
    (l) => l.timestamp_sec >= step.timestamp_start && l.timestamp_sec <= end,
  )
  if (inRange.length > 0) return inRange.slice(0, 3)
  // Fallback: nearest line to timestamp_start
  const nearest = [...lines].sort(
    (a, b) =>
      Math.abs(a.timestamp_sec - step.timestamp_start) -
      Math.abs(b.timestamp_sec - step.timestamp_start),
  )[0]
  return nearest ? [nearest] : []
}

export function StepCard({ step, transcriptLines, onSeek }: Props) {
  const [modalOpen, setModalOpen] = useState(false)

  if (!step) {
    return (
      <div className="flex items-center justify-center text-gray-400 text-sm py-16">
        Select a step to view details
      </div>
    )
  }

  const screenshotUrl = step.annotated_screenshot_url ?? step.screenshot_url
  const subSteps = Array.isArray(step.sub_steps) ? step.sub_steps as string[] : []
  const ktLines = getKTLines(step, transcriptLines)

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5 space-y-5 overflow-y-auto h-full">
      {/* Step badge + title */}
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">
          {step.sequence}
        </span>
        <h2 className="text-lg font-semibold text-gray-900 leading-snug">{step.title}</h2>
      </div>

      {/* Description */}
      {step.description && (
        <p className="text-sm text-gray-700 leading-relaxed">{step.description}</p>
      )}

      {/* Sub-steps */}
      {subSteps.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Sub-steps
          </h4>
          <ul className="space-y-1 list-disc list-inside text-sm text-gray-700">
            {subSteps.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {/* Screenshot thumbnail */}
      {screenshotUrl && (
        <div>
          <img
            src={screenshotUrl}
            alt="Annotated screenshot"
            className="w-full rounded border border-gray-100 object-cover cursor-pointer hover:opacity-90 transition-opacity"
            style={{ maxHeight: '160px', objectPosition: 'top' }}
            onClick={() => setModalOpen(true)}
          />
          <button
            onClick={() => setModalOpen(true)}
            className="mt-1 text-xs text-blue-600 hover:underline"
          >
            Click to expand full screenshot
          </button>
          {modalOpen && (
            <ScreenshotModal
              src={screenshotUrl}
              alt={`Step ${step.sequence} screenshot`}
              onClose={() => setModalOpen(false)}
            />
          )}
        </div>
      )}

      {/* KT session quote */}
      {ktLines.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            From the KT session
          </p>
          <div className="space-y-2">
            {ktLines.map((l) => (
              <div key={l.id}>
                <p className="text-sm text-gray-700 italic leading-snug">"{l.content}"</p>
                <p className="text-xs text-gray-400 mt-0.5">{l.speaker}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Play from timestamp */}
      <button
        onClick={() => onSeek(step.timestamp_start)}
        className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
      >
        <span>▶</span>
        <span>Play from {formatTime(step.timestamp_start)}</span>
      </button>

      {/* Callouts */}
      <CalloutList callouts={step.callouts} />

      {/* Discussions */}
      {step.discussions.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
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

**Verify:** TypeScript build passes.

---

## Task 4 — Modify `StepSidebar` (add Sections block)

**File:** `frontend/src/components/StepSidebar.tsx`

Add `sections` prop. After the steps `<ul>`, render a SECTIONS block.

Change the `Props` interface at line 4:
```ts
// BEFORE
interface Props {
  steps: SOPStep[]
}

// AFTER
import type { SOPStep, SOPSection } from '../api/types'

interface Props {
  steps: SOPStep[]
  sections: SOPSection[]
}
```

Add `sections` to the function signature and render after the steps list:

```tsx
export function StepSidebar({ steps, sections }: Props) {
  // ...existing code...

  return (
    <aside className="w-full shrink-0 bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
      {/* existing steps header + ul — unchanged */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Procedure Steps
        </span>
        <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
          {steps.length}
        </span>
      </div>
      <ul className="overflow-y-auto">
        {/* existing step buttons — unchanged */}
      </ul>

      {/* NEW: Sections block */}
      {sections.length > 0 && (
        <div className="border-t border-gray-100 mt-2">
          <div className="px-4 py-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Sections
            </span>
          </div>
          <ul>
            {sections.map((sec) => (
              <li key={sec.id}>
                <a
                  href={`#section-${sec.section_key}`}
                  className="block px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                >
                  {sec.section_title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}
```

> Note: Section links use `#section-{section_key}` anchors. The Overview tab anchor scrolling is a Phase 7 polish item — for now the link is present but navigation goes to the `#` fragment only.

**Verify:** TypeScript build passes. Sidebar shows "SECTIONS" block with section names.

---

## Task 5 — Modify `TranscriptPanel` (lift data, speaker filter)

**File:** `frontend/src/components/TranscriptPanel.tsx`

**Change 1:** Replace `sopId` prop with `lines` prop (data lifted to ProcedurePage).

```ts
// BEFORE (lines 7-9)
interface Props {
  sopId: string
  onSeek: (seconds: number) => void
}

// AFTER
interface Props {
  lines: TranscriptLine[]
  onSeek: (seconds: number) => void
}
```

Remove the `useQuery` call (lines 22–25) and the `import { fetchTranscript, sopKeys }` usage. The `lines` variable is now `props.lines` directly.

**Change 2:** Add speaker filter state and pill button.

Add below the `search` state:
```ts
const [speakerFilter, setSpeakerFilter] = useState<string | null>(null)

const speakers = useMemo(
  () => Array.from(new Set(lines.map((l) => l.speaker))).sort(),
  [lines],
)
```

Update `filteredLines`:
```ts
const filteredLines = useMemo(() => {
  let result = lines
  if (speakerFilter) result = result.filter((l) => l.speaker === speakerFilter)
  if (search.trim()) {
    const q = search.toLowerCase()
    result = result.filter(
      (l) => l.content.toLowerCase().includes(q) || l.speaker.toLowerCase().includes(q),
    )
  }
  return result
}, [lines, search, speakerFilter])
```

**Change 3:** Update the header UI — add "Synced transcript" label and speaker filter button.

Replace the current search `<div>` (lines 68–76) with:
```tsx
<div className="px-3 py-2 border-b border-gray-100 shrink-0 space-y-2">
  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
    Synced transcript
  </span>
  <div className="flex gap-2">
    <input
      type="text"
      placeholder="Search transcript..."
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
    <select
      value={speakerFilter ?? ''}
      onChange={(e) => setSpeakerFilter(e.target.value || null)}
      className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-600 focus:outline-none"
    >
      <option value="">All speakers</option>
      {speakers.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  </div>
</div>
```

**Verify:** TypeScript build passes. Transcript shows "Synced transcript" label and speaker dropdown.

---

## Task 6 — Update `ProcedurePage` (new grid, lifted query, wire all components)

**File:** `frontend/src/routes/sop.$id.procedure.tsx`

Full replacement:

```tsx
import { createFileRoute, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useSOPStore } from '../hooks/useSOPStore'
import { useStepSync } from '../hooks/useStepSync'
import { StepSidebar } from '../components/StepSidebar'
import { StepCard } from '../components/StepCard'
import { VideoPlayer } from '../components/VideoPlayer'
import { TranscriptPanel } from '../components/TranscriptPanel'
import { SOPPageHeader } from '../components/SOPPageHeader'
import { fetchSOP, fetchTranscript, sopKeys } from '../api/client'

export const Route = createFileRoute('/sop/$id/procedure')({
  component: ProcedurePage,
})

function ProcedurePage() {
  const { id } = useParams({ from: '/sop/$id/procedure' })

  const { data: sop } = useQuery({
    queryKey: sopKeys.detail(id),
    queryFn: () => fetchSOP(id),
  })

  // Lifted transcript query — shared between TranscriptPanel and StepCard
  const { data: transcriptLines = [] } = useQuery({
    queryKey: sopKeys.transcript(id),
    queryFn: () => fetchTranscript(id),
    enabled: !!sop,
  })

  const { selectedStepId, setSelectedStep } = useSOPStore()
  const { playerRef, handleTimeUpdate, seekTo } = useStepSync(sop?.steps ?? [])

  const selectedStep = sop?.steps.find((s) => s.id === selectedStepId) ?? null

  // Auto-select first step on load
  useEffect(() => {
    if (sop && !selectedStepId && sop.steps.length > 0) {
      setSelectedStep(sop.steps[0].id)
    }
  }, [sop, selectedStepId, setSelectedStep])

  if (!sop) return null

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] px-6 py-4">
      <SOPPageHeader sop={sop} />

      <div className="grid grid-cols-[220px_1fr_320px] gap-4 flex-1 min-h-0">
        {/* Left: Steps + Sections sidebar */}
        <div className="overflow-y-auto">
          <StepSidebar steps={sop.steps} sections={sop.sections} />
        </div>

        {/* Center: Video + Transcript */}
        <div className="flex flex-col min-h-0 gap-3 overflow-hidden">
          <VideoPlayer
            step={selectedStep}
            sopVideoUrl={sop.video_url ?? null}
            playerRef={playerRef}
            onTimeUpdate={handleTimeUpdate}
          />
          <div className="flex-1 min-h-0 rounded-lg shadow-sm border border-gray-100 overflow-hidden">
            <TranscriptPanel lines={transcriptLines} onSeek={seekTo} />
          </div>
        </div>

        {/* Right: Step detail card */}
        <div className="min-h-0 overflow-hidden">
          <StepCard
            step={selectedStep}
            transcriptLines={transcriptLines}
            onSeek={seekTo}
          />
        </div>
      </div>
    </div>
  )
}
```

**Verify:** TypeScript build passes. Page renders 3-column layout with header.

---

## Task 7 — Delete `StepDetail.tsx`

```bash
rm frontend/src/components/StepDetail.tsx
```

**Verify:** TypeScript build still passes (no remaining imports).

---

## Task 8 — Docker rebuild and visual verification

```bash
docker compose build sop-frontend && docker compose up -d sop-frontend
```

**Visual checklist:**
- [ ] Header shows SOP title + client name + "v1.x" + date
- [ ] Export DOCX / Export PDF buttons are greyed out (disabled)
- [ ] Share link button copies URL, toast "Link copied!" appears and disappears after 2s
- [ ] Left sidebar shows "PROCEDURE STEPS" and "SECTIONS" blocks
- [ ] Center: video player on top, transcript below with "Synced transcript" label + speaker filter
- [ ] Right: step card with blue badge, description, screenshot thumbnail, KT quote, Play link
- [ ] Clicking screenshot thumbnail opens fullscreen modal; Escape or × closes it
- [ ] "Play from XX:XX" link seeks video and switches to full video mode
- [ ] Clicking different steps updates step card and scrolls transcript

---

## Commit plan

| After task | Commit message |
|---|---|
| Task 1 | `feat: add SOPPageHeader with export placeholders and share link` |
| Tasks 2–3 | `feat: add StepCard and ScreenshotModal for right panel` |
| Tasks 4–5 | `feat: update StepSidebar with sections + TranscriptPanel speaker filter` |
| Tasks 6–7 | `feat: redesign ProcedurePage layout — 3-col grid, lifted transcript query` |
| Task 8 | `chore: rebuild frontend for procedure page redesign` |
