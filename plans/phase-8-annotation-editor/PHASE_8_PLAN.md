# Phase 8: Annotation Editor

**Objective:** Allow Editor/Admin users to drag-and-drop callout circles to correct Gemini coordinate estimates, then re-render the annotated screenshot PNG.

**Status: ✅ Complete**

**Detailed implementation plan:** [`docs/superpowers/plans/2026-04-03-phase8-annotation-editor.md`](../../docs/superpowers/plans/2026-04-03-phase8-annotation-editor.md)
**Design spec:** [`docs/superpowers/specs/2026-04-03-phase8-annotation-editor-design.md`](../../docs/superpowers/specs/2026-04-03-phase8-annotation-editor-design.md)

---

## Architecture

### Entry Point
- "✎ Edit Callouts" button in `StepCard.tsx` — visible to Editor/Admin role only, below the screenshot thumbnail
- Clicking opens `AnnotationEditorModal` as a full-screen overlay

### Editor Modal (Konva.js)
- Left: screenshot image + Konva Stage overlaid at exact rendered dimensions
- Right panel: callout list with confidence badges, pixel coordinates, Remove button
- Header: step badge, gemini_only warning, Cancel + Save Changes
- Footer: step number + callout count + warning for all-gemini steps

### Coordinate System
- DB stores raw pixel coordinates (`target_x`, `target_y`)
- Modal reads `img.naturalWidth/Height` on image load to convert: `stageX = (target_x / naturalW) * stageWidth`
- On drag end, converts back: `target_x = Math.round((stageX / stageWidth) * naturalW)`

### Colour Coding
| Colour | Meaning |
|--------|---------|
| Green (#10b981) | ocr_exact or ocr_fuzzy |
| Amber (#f59e0b) | gemini_only (unverified) |
| Blue (#3b82f6) | repositioned (manually corrected) |

### Save Flow
1. "Save Changes" → `PATCH /api/steps/{id}/callouts` (bulk update)
2. Backend preserves `original_x/y` on first reposition
3. React Query cache invalidated → UI refreshes

### Re-render Flow
1. "↻ Re-render Annotated PNG" → `POST /api/steps/{id}/render-annotated`
2. sop-api proxies to `http://sop-extractor:8001/api/render-annotated`
3. Extractor: downloads screenshot via SAS URL, draws Pillow circles at raw pixel coords, uploads PNG to Azure Blob
4. `annotated_screenshot_url` persisted to DB

---

## Key Decisions

| Decision | Reason |
|----------|--------|
| Raw pixel coords (not 0-100%) | DB stores pixels from Gemini/OCR pipeline; 0-100% was wrong assumption |
| Full-screen modal (not inline) | Right panel (320px) too narrow for canvas editing |
| Bulk PATCH (not per-callout) | Fewer round trips; all positions saved atomically |
| Phase 8 scope: reposition + delete only | Add new callout deferred to Phase 9 (avoids INSERT path complexity) |
| Pillow for re-render (not Konva export) | Server-side render ensures consistent output for DOCX/PDF exports |

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/package.json` | + konva, react-konva |
| `frontend/src/api/types.ts` | + CalloutPatchItem interface |
| `frontend/src/api/client.ts` | + patchCallouts(), renderAnnotated() |
| `frontend/src/components/AnnotationEditorModal.tsx` | New — Konva modal editor |
| `frontend/src/components/StepCard.tsx` | + Edit Callouts button + modal |
| `api/app/schemas.py` | + CalloutPatchItem, RenderAnnotatedResponse |
| `api/app/routes/steps.py` | + PATCH callouts + POST render-annotated |
| `extractor/app/annotator.py` | New — Pillow circle renderer |
| `extractor/app/main.py` | + RenderAnnotatedRequest/Response models + endpoint |
