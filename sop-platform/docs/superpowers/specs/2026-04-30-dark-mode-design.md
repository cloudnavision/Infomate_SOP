# Design: Dark Mode + Gray Mode Theming

**Date:** 2026-04-30  
**Status:** Pending approval  
**Approach:** CSS custom properties + semantic Tailwind utility classes

---

## What We're Building

Three themes switchable via a toggle in the app header, persisted to `localStorage`:

| Theme | Description |
|-------|-------------|
| **Light** | Current default — white/gray-50 surfaces, violet accents |
| **Dark** | Standard dark — near-black backgrounds, light text |
| **Gray** | Charcoal/slate — softer dark, no pure black, slate-700/800 tones |

---

## Color Token Design

CSS custom properties defined in `index.css`. Three blocks keyed by `data-theme` on `<html>`.

| Token | Light | Dark | Gray (slate) |
|-------|-------|------|--------------|
| `--color-bg` | `#f9fafb` (gray-50) | `#030712` (gray-950) | `#1e293b` (slate-800) |
| `--color-surface` | `#ffffff` (white) | `#111827` (gray-900) | `#334155` (slate-700) |
| `--color-raised` | `#f3f4f6` (gray-100) | `#1f2937` (gray-800) | `#475569` (slate-600) |
| `--color-border` | `#e5e7eb` (gray-200) | `#374151` (gray-700) | `#475569` (slate-600) |
| `--color-border-subtle` | `#f3f4f6` (gray-100) | `#1f2937` (gray-800) | `#334155` (slate-700) |
| `--color-input` | `#ffffff` (white) | `#1f2937` (gray-800) | `#334155` (slate-700) |
| `--color-text-default` | `#111827` (gray-900) | `#f9fafb` (gray-50) | `#f1f5f9` (slate-100) |
| `--color-text-secondary` | `#374151` (gray-700) | `#d1d5db` (gray-300) | `#cbd5e1` (slate-300) |
| `--color-text-muted` | `#6b7280` (gray-500) | `#9ca3af` (gray-400) | `#94a3b8` (slate-400) |
| `--color-scrollbar` | `#d1d5db` (gray-300) | `#4b5563` (gray-600) | `#475569` (slate-600) |

Accent colors (violet/indigo gradient) remain **unchanged** across all themes — they work on all three.

Scrollbar thumb color becomes a CSS variable too.

---

## Semantic Tailwind Utilities

Added via `@layer utilities` in `index.css`. These consume the CSS vars above:

| Utility class | Replaces |
|--------------|----------|
| `bg-page` | `bg-gray-50` (page/app background) |
| `bg-card` | `bg-white` (card, panel, modal) |
| `bg-raised` | `bg-gray-100` (hover states, badges) |
| `bg-input` | `bg-white` / `bg-gray-50` on input fields |
| `border-default` | `border-gray-200` (standard dividers) |
| `border-subtle` | `border-gray-100` (faint dividers) |
| `text-default` | `text-gray-900` (headings, strong text) |
| `text-secondary` | `text-gray-700` / `text-gray-800` (body text) |
| `text-muted` | `text-gray-500` / `text-gray-600` (labels, meta) |

> **Note:** These utilities live in `@layer utilities` and do NOT respond to Tailwind variant prefixes (`hover:`, `dark:`, `lg:`). When migrating components, move variant logic to inline `style` or keep hardcoded Tailwind classes for hover states — only replace static color classes.

---

## Files to Create / Modify

### New files
- `src/contexts/ThemeContext.tsx` — context + hook + provider; reads/writes `localStorage` key `sop-theme`; applies `data-theme` attribute to `document.documentElement` on mount and on change

### Modified files
| File | Change |
|------|--------|
| `tailwind.config.ts` | No change needed — utilities are in CSS, not config |
| `src/index.css` | Add CSS variable blocks + `@layer utilities` semantic classes |
| `src/routes/__root.tsx` | Wrap with `<ThemeProvider>` |
| `src/components/Layout.tsx` | Add 3-way toggle button (Sun / Moon / Slate icons); wire to `useTheme()` |
| ~19 component files | Replace hardcoded color classes with semantic equivalents (see mapping table above) |

### Components to update (full list)
`AccessDenied`, `DiscussionCard`, `SOPCard`, `SOPPageHeader`, `StepCard`, `StepSidebar`, `TranscriptPanel`, `UserManagementTable`, `VideoPlayer`, `ProtectedRoute`  
Routes: `login`, `dashboard`, `settings`, `auth.callback`, `sop.$id.overview`, `sop.$id.history`, `sop.$id.processmap`, `sop.$id.matrices`, `merge.index`, `merge.$sessionId.index`, `merge.$sessionId.preview`

---

## Theme Toggle UI

3-way icon button group in the Layout header, right of the user info section:

```
[ ☀ ] [ ● ] [ ◐ ]   ← active button gets a subtle ring/bg
  light  dark  gray
```

Icons: Sun (light), Moon (dark), CloudFog or CircleHalf (gray).  
No labels — icons only, with `title` tooltip.

---

## ThemeContext API

```ts
type Theme = 'light' | 'dark' | 'gray'

interface ThemeContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
}
```

On mount: reads `localStorage('sop-theme')`, falls back to `'light'`.  
On change: writes to `localStorage`, sets `document.documentElement.dataset.theme`.

**Flash-of-wrong-theme prevention:** A small inline `<script>` tag in `index.html` (before React loads) reads `localStorage('sop-theme')` and sets `document.documentElement.dataset.theme` synchronously, so the correct theme is applied before the first paint.

---

## Exclusions (not themed)

- Violet/indigo accent gradients — look fine on all themes
- Role badge colors (blue, violet, gray pills) — kept as-is
- Status badge colors (green/amber/red pipeline statuses) — kept as-is
- Video player controls — browser native
