# Phase 4: Gemini Frame Classification

**Objective:** For each `sop_steps` row marked `frame_classification = 'useful'`, send the screenshot to Gemini Vision. Get back a natural-language description of what's on screen plus a list of annotated UI elements with pixel coordinates. Write the description to `sop_steps.gemini_description` and insert `step_callouts` rows. Advance the pipeline to `generating_annotations`.

**Status: ⬜ Pending** — waiting for Phase 3 end-to-end pass (sop_steps in Supabase)

---

## Sub-Parts

| Sub-Part | Description | Status |
|----------|-------------|--------|
| 4a | n8n Workflow 3 — Gemini Vision per-frame classification | ⬜ Pending |

> Phase 4 is a single n8n workflow. No code changes required to sop-extractor or sop-api.

---

## Architecture

**Phase 4 data flow:**
```
Supabase pipeline_runs (status = classifying_frames)
  → n8n polls every 2 minutes
  → Get all sop_steps WHERE sop_id = X AND frame_classification = 'useful'
  → SplitInBatches(1) — process one frame at a time
    → Build Image URL (append SAS token to screenshot_url)
    → Download Frame Image (GET PNG from Azure Blob)
    → Build Gemini Request (base64 encode PNG + prompt)
    → Call Gemini Vision (POST generateContent — gemini-2.5-flash)
    → Parse Gemini Response (extract description + UI elements)
    → Update SOP Step (PATCH gemini_description)
    → Insert Step Callouts (POST step_callouts — one row per UI element)
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
