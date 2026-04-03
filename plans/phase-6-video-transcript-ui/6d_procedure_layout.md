# 6d: Procedure Page — 3-Column Layout

**Status: 🔲 Pending**

---

## Files Modified

| File | Change |
|------|--------|
| `src/routes/sop.$id.procedure.tsx` | Replace `flex` with 3-column CSS grid; add VideoPlayer + TranscriptPanel |
| `src/components/StepDetail.tsx` | Remove gray placeholder; change `flex-1 min-w-0` → `min-w-0 overflow-y-auto` |

---

## Grid Layout

```
grid-cols-[272px_1fr_300px]   ← transcript open (≥1280px default)
grid-cols-[272px_1fr_28px]    ← transcript collapsed (28px holds toggle button)
```

Height: `h-[calc(100vh-11rem)]`
- 11rem = top nav (~4rem) + SOP title/tabs area (~4rem) + page padding (~3rem)
- Adjust if panels look too short/tall after visual check

---

## Column Structure

```
Left (272px)       Middle (1fr)              Right (300px / 28px)
─────────────      ──────────────────────    ────────────────────
StepSidebar        VideoPlayer               TranscriptPanel
overflow-y-auto    (top, shrink-0)           h-full, flex flex-col
                   ──────────────────────
                   StepDetail
                   (flex-1, overflow-y-auto)
```

---

## Collapse Toggle

A small circular button sits on the left edge of the right column:
- `absolute -left-3 top-4` positioning
- `w-6 h-6` size, `rounded-full`, white background with border shadow
- Shows `›` when open, `‹` when closed
- Right column must have `relative` + `flex` to contain it

---

## StepDetail Changes

1. **Remove** the gray placeholder block (lines 30-32 in current file):
   ```tsx
   // DELETE this entire block:
   <div className="bg-gray-100 rounded-lg p-8 border border-dashed border-gray-300 text-center">
     <p className="text-sm text-gray-400">Screenshot available after pipeline processing</p>
   </div>
   ```

2. **Fix root div class** — `flex-1` has no effect in a CSS grid child:
   ```diff
   - className="flex-1 min-w-0 bg-white rounded-lg shadow-sm border border-gray-100 p-6 space-y-6"
   + className="min-w-0 bg-white rounded-lg shadow-sm border border-gray-100 p-6 space-y-6 overflow-y-auto"
   ```

3. **Fix empty-state div** for same reason:
   ```diff
   - className="flex-1 flex items-center justify-center text-gray-400 text-sm"
   + className="flex items-center justify-center text-gray-400 text-sm py-16"
   ```

---

## Transcript Default State

```typescript
const [transcriptOpen, setTranscriptOpen] = useState(
  () => window.innerWidth >= 1280
)
```

Initial value computed once at mount — not reactive to window resize. This is intentional: the collapse/expand is a manual user control, not an automatic responsive layout.
