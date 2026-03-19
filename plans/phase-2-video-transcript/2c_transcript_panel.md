# 2c: Transcript Panel
## Status: ⬜

---

## Objective

Build a virtualised, searchable transcript panel that:
- Renders thousands of transcript lines without DOM bloat
- Auto-scrolls to the active line during video playback
- Colour-codes speakers visually
- Allows clicking any line to seek the video
- Supports search with text highlighting
- Shows step badges on lines linked to a step

---

## Dependencies

```bash
npm install @tanstack/react-virtual
```

No additional types package needed — `@tanstack/react-virtual` ships its own TypeScript declarations.

---

## Data Shape

`TranscriptLine` from `src/api/types.ts` (already exists from Phase 1):

```typescript
interface TranscriptLine {
  id: string
  sop_id: string
  line_number: number
  start_time: number | null     // seconds
  end_time: number | null       // seconds
  speaker: string | null
  text: string
  linked_step_id: string | null
}
```

Data is fetched via `sopKeys.transcript(sopId)` using `fetchAPI<TranscriptLine[]>` — same
pattern as other child routes. Add to `client.ts` if not already present:

```typescript
export const fetchTranscript = (id: string) =>
  fetchAPI<TranscriptLine[]>(`/api/sops/${id}/transcript`)
```

---

## Virtualisation Approach

`@tanstack/react-virtual` provides `useVirtualizer` — a headless virtualiser that computes
which items to render based on scroll position.

```typescript
const rowVirtualizer = useVirtualizer({
  count: filteredLines.length,
  getScrollElement: () => scrollContainerRef.current,
  estimateSize: () => 56,       // px per row; actual height varies
  overscan: 5,                  // render 5 extra rows above/below viewport
})
```

Key pattern — the outer container has a fixed height and `overflow-y: auto`. The inner
container has the total virtual height. Only the visible virtual items are rendered as
absolutely positioned children.

```tsx
<div ref={scrollContainerRef} style={{ height: '100%', overflowY: 'auto' }}>
  <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
    {rowVirtualizer.getVirtualItems().map((virtualRow) => (
      <div
        key={virtualRow.index}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${virtualRow.start}px)`,
        }}
      >
        <TranscriptRow line={filteredLines[virtualRow.index]} ... />
      </div>
    ))}
  </div>
</div>
```

---

## Speaker Colour Assignment

Hash the speaker name to an index into an 8-colour palette. This ensures the same speaker
always gets the same colour across renders without storing a mapping.

```typescript
const SPEAKER_COLOURS = [
  'bg-blue-100 text-blue-800',
  'bg-green-100 text-green-800',
  'bg-purple-100 text-purple-800',
  'bg-amber-100 text-amber-800',
  'bg-pink-100 text-pink-800',
  'bg-cyan-100 text-cyan-800',
  'bg-orange-100 text-orange-800',
  'bg-rose-100 text-rose-800',
]

function getSpeakerColour(speaker: string): string {
  let hash = 0
  for (let i = 0; i < speaker.length; i++) {
    hash = speaker.charCodeAt(i) + ((hash << 5) - hash)
  }
  return SPEAKER_COLOURS[Math.abs(hash) % SPEAKER_COLOURS.length]
}
```

---

## TranscriptPanel Component Specification

**File:** `src/components/TranscriptPanel.tsx`

### Props

```typescript
interface TranscriptPanelProps {
  sopId: string
  onLineClick: (line: TranscriptLine) => void
  activeIndex: number            // from useStepSync; -1 = none
}
```

### Internal State

```typescript
const [search, setSearch] = useState('')
const [scrollLock, setScrollLock] = useState(false)
const scrollContainerRef = useRef<HTMLDivElement>(null)
```

### Data Fetching

```typescript
const { data: transcript = [], isLoading } = useQuery({
  queryKey: sopKeys.transcript(sopId),
  queryFn: () => fetchTranscript(sopId),
})
```

### Filtered Lines

```typescript
const filteredLines = useMemo(() => {
  if (!search.trim()) return transcript
  const lower = search.toLowerCase()
  return transcript.filter(
    (line) =>
      line.text.toLowerCase().includes(lower) ||
      (line.speaker?.toLowerCase().includes(lower) ?? false)
  )
}, [transcript, search])
```

### Auto-Scroll

```typescript
useEffect(() => {
  if (scrollLock) return
  if (activeIndex < 0) return
  // find virtualised index of active line in filtered list
  const virtualIndex = filteredLines.findIndex((l) => transcript[activeIndex]?.id === l.id)
  if (virtualIndex >= 0) {
    rowVirtualizer.scrollToIndex(virtualIndex, { align: 'center' })
  }
}, [activeIndex, scrollLock, filteredLines])
```

### Search Highlighting

```typescript
function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const parts = text.split(new RegExp(`(${query})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-yellow-200 rounded">{part}</mark>
      : part
  )
}
```

### Timestamp Formatting

```typescript
function formatTime(seconds: number | null): string {
  if (seconds === null) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
```

### Individual Row Layout

```tsx
<div
  className={clsx(
    'flex gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 rounded',
    isActive && 'bg-blue-50 border-l-4 border-blue-500'
  )}
  onClick={() => onLineClick(line)}
>
  <span className="text-xs text-gray-400 w-12 flex-shrink-0 pt-0.5">
    {formatTime(line.start_time)}
  </span>
  <div className="flex-1 min-w-0">
    {line.speaker && (
      <span className={clsx('text-xs font-medium px-1.5 py-0.5 rounded mr-1', getSpeakerColour(line.speaker))}>
        {line.speaker}
      </span>
    )}
    {line.linked_step_id && (
      <span className="text-xs bg-indigo-100 text-indigo-700 px-1 py-0.5 rounded mr-1">S</span>
    )}
    <span className="text-sm text-gray-700">{highlight(line.text, search)}</span>
  </div>
</div>
```

### Panel Header

```tsx
<div className="flex flex-col gap-2 p-3 border-b border-gray-200">
  <div className="flex items-center justify-between">
    <h3 className="font-medium text-sm">Transcript</h3>
    <button
      onClick={() => setScrollLock((v) => !v)}
      className={clsx('text-xs px-2 py-1 rounded', scrollLock ? 'bg-amber-100 text-amber-700' : 'text-gray-500')}
    >
      {scrollLock ? 'Locked' : 'Auto-scroll'}
    </button>
  </div>
  <input
    type="text"
    placeholder="Search transcript..."
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    className="text-sm border rounded px-2 py-1 w-full"
  />
</div>
```

---

## Scroll Lock Toggle

When `scrollLock = true`:
- Auto-scroll `useEffect` is skipped
- Panel header shows an amber "Locked" badge to indicate the user has taken manual control
- Clicking any line still works (seeking video doesn't re-lock/unlock)
- User manually toggling the button resets to auto-scroll

---

## Validation Checklist

- [ ] `npm install @tanstack/react-virtual` runs without errors
- [ ] `TranscriptPanel` renders all lines from API
- [ ] Virtualisation: scrolling through 500+ lines is smooth (check Chrome DevTools Performance)
- [ ] Active line highlights as video plays (when transcript has timestamps)
- [ ] Auto-scroll follows active line during playback
- [ ] Scroll lock toggle disables auto-scroll; amber badge visible
- [ ] Click any line → video seeks to `start_time`
- [ ] Click any line → correct step highlights in sidebar
- [ ] Speaker badges show correct colours (same speaker = same colour across lines)
- [ ] Search filters lines in real time
- [ ] Search highlights matched text in yellow
- [ ] Lines with `linked_step_id` show "S" badge
- [ ] Empty transcript (seed data may have no transcript lines): panel shows graceful empty state
- [ ] TypeScript: `tsc --noEmit` 0 errors
