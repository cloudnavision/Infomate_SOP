# Phase 4: Frame Annotation — Hybrid Approach

**Objective:** For each `sop_steps` row marked `frame_classification = 'useful'`, run a 3-stage annotation pipeline:
1. **Gemini semantic** — identify WHAT UI elements to annotate + region hints
2. **Vision OCR** — get pixel-precise bounding boxes for all text in the screenshot
3. **Matching algorithm** — match Gemini labels → OCR boxes via Levenshtein → assign confidence

Write `gemini_description` to `sop_steps`. Insert `step_callouts` rows with confidence levels (`ocr_exact` / `ocr_fuzzy` / `gemini_only`). Advance pipeline to `generating_annotations`.

**Accuracy targets:** gemini_only ~60% → hybrid ~92%
**Confidence colour coding in React:** Green (ocr_exact), Amber (ocr_fuzzy), Red (gemini_only)

**Status: ⬜ Pending** — waiting for Phase 3 end-to-end pass (sop_steps in Supabase)

---

## Sub-Parts

| Sub-Part | File | Description | Status |
|----------|------|-------------|--------|
| 4a | [4a_gemini_classification.md](4a_gemini_classification.md) | Gemini Vision — identify UI elements, get region hints + fallback coordinates | ⬜ Pending |
| 4b | [4b_vision_ocr.md](4b_vision_ocr.md) | Google Cloud Vision OCR — TEXT_DETECTION for pixel-precise bounding boxes | ⬜ Pending |
| 4c | [4c_matching_algorithm.md](4c_matching_algorithm.md) | Levenshtein matching algorithm — connect Gemini labels → OCR boxes → confidence | ⬜ Pending |

> All three sub-parts run as a single extended n8n Workflow 3. No code changes to sop-extractor or sop-api.

---

## Architecture

**Phase 4 data flow (18 nodes):**
```
Supabase pipeline_runs (status = classifying_frames)
  → n8n polls every 2 minutes
  → Get all sop_steps WHERE sop_id = X AND frame_classification = 'useful'
  → SplitInBatches(1) — process one frame at a time
    → Build Image URL (append SAS token to screenshot_url)
    → Download Frame Image (GET PNG from Azure Blob)
    → Build Gemini Request (base64 encode PNG + prompt)       ← 4a
    → Call Gemini Vision (POST generateContent — gemini-2.5-flash)  ← 4a
    → Parse Gemini Response (extract description + element labels)  ← 4a
    → Call Vision OCR (Google Cloud Vision TEXT_DETECTION)          ← 4b
    → Run Matching Algorithm (Levenshtein label → bounding box)     ← 4c
    → Update SOP Step (PATCH gemini_description)
    → Insert Step Callouts (POST step_callouts with confidence)
    → [loop — next step]
  → Update Pipeline Run (PATCH status = generating_annotations)
```

---

## What Gemini Returns Per Frame

Input: PNG screenshot of screen-share moment

Output (JSON):
```json
{
  "description": "The trainer opens the Aged Debtor report by double-clicking the Credit Check folder",
  "ui_elements": [
    {
      "label": "Double-click 'Credit Check' folder",
      "element_type": "folder",
      "target_x": 450,
      "target_y": 320,
      "region_hint": "center of screen, Windows Explorer"
    },
    {
      "label": "Navigate to 'Reports' tab",
      "element_type": "tab",
      "target_x": 120,
      "target_y": 45,
      "region_hint": "top navigation bar"
    }
  ]
}
```

---

## Database Writes

**sop_steps (PATCH):**
```
gemini_description = "The trainer opens the Aged Debtor report..."
```

**step_callouts (POST — bulk):**
```
step_id           → from sop_steps.id
callout_number    → 1, 2, 3... (per step)
label             → "Double-click 'Credit Check' folder"
element_type      → "folder"
target_x / target_y → pixel coordinates from Gemini
gemini_region_hint → "center of screen, Windows Explorer"
confidence        → "gemini_only"
match_method      → "gemini_coordinates"
```

---

## Pipeline Status Flow

```
classifying_frames  →  generating_annotations
```

---

## Prerequisites

- Phase 3 complete — `sop_steps` rows exist in Supabase with `frame_classification = 'useful'` and `screenshot_url` pointing to Azure Blob PNGs
- Gemini API key (same project as Phase 2 — Google AI Studio)
- Same Supabase + Azure credentials as Workflow 2

---

## Files

| File | Purpose |
|------|---------|
| `n8n-workflows/Saara - SOP_Workflow 3 - Gemini Classification.json` | Import to n8n |
| `plans/phase-4-gemini-classification/4a_gemini_classification.md` | Detailed workflow guide |

---

## Key Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Model | gemini-2.5-flash | Same as Phase 2, fast + multimodal |
| Image delivery | base64 inlineData | Azure Blob URLs require SAS — can't use fileData URI directly |
| responseMimeType | application/json | Forces clean JSON output, no markdown wrapper |
| Batch size | 1 step per trigger | Avoids Gemini rate limits, easier to track failures |
| Callout coords | Gemini pixel estimates | Phase 5 refines with OCR bounding boxes if needed |
| confidence | gemini_only | Phase 5 may upgrade to gemini_ocr_match after OCR pass |
