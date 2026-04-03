# 6c: TranscriptPanel Component

**Status: 🔲 Pending**

---

## Component

**File:** `src/components/TranscriptPanel.tsx` (new)

**Library:** `@tanstack/react-virtual` v3

---

## Props

```typescript
interface Props {
  sopId: string
  onSeek: (seconds: number) => void
}
```

Fetches its own transcript via `useQuery(sopKeys.transcript(sopId))` — transcript data is independent of the SOP detail query and can be large (100+ lines).

---

## Row Height Strategy

Rows use a **fixed height of 72px** enforced by:
1. `style={{ height: '72px' }}` on each row div
2. `line-clamp-3` Tailwind class on the content paragraph
3. `estimateSize: () => 72` in the virtualizer config

This makes virtualizer scroll calculations accurate without needing dynamic `measureElement` mode.

---

## Behaviour

| Action | Result |
|--------|--------|
| Step changes | Auto-scroll to first line where `linked_step_id === selectedStepId` |
| Click line | Call `onSeek(line.timestamp_sec)` |
| Type in search | Filter `filteredLines` via `useMemo` (never mutates React Query cache) |
| Empty transcript | Show "No transcript available." centered message |

---

## Highlighting

Lines linked to `selectedStepId`:
- `border-l-2 border-blue-400` (left blue border)
- `bg-blue-50` (light blue background)

All other lines:
- `border-l-2 border-transparent`

---

## Data

```typescript
// TranscriptLine fields used
line.timestamp_sec    // for formatTime display + onSeek
line.speaker          // displayed as label
line.content          // displayed text (line-clamp-3)
line.linked_step_id   // for highlight matching
```
