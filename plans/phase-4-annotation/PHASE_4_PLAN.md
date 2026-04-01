# Phase 4: Frame Annotation — Hybrid Approach

**Objective:** For each `sop_steps` row marked `frame_classification = 'useful'`, run a 3-stage annotation pipeline:
1. **Gemini semantic** — identify WHAT UI elements to annotate + region hints
2. **Vision OCR** — get pixel-precise bounding boxes for all text in the screenshot
3. **Matching algorithm** — match Gemini labels → OCR boxes via Levenshtein → assign confidence

Write `gemini_description` to `sop_steps`. Insert `step_callouts` rows with confidence levels (`ocr_exact` / `ocr_fuzzy` / `gemini_only`). Advance pipeline to `generating_annotations`.

**Accuracy targets:** gemini_only ~60% → hybrid ~92%
**Confidence colour coding in React:** Green (ocr_exact), Amber (ocr_fuzzy), Red (gemini_only)

**Status: 🟡 Ready to Test** — Workflow 3 JSON complete, all API keys filled in, Phase 3 confirmed done

---

## Sub-Parts

| Sub-Part | File | Description | Status |
|----------|------|-------------|--------|
| 4a | [4a_gemini_classification.md](4a_gemini_classification.md) | Gemini Vision — identify UI elements, get region hints + fallback coordinates | 🟡 Ready |
| 4b | [4b_vision_ocr.md](4b_vision_ocr.md) | Google Cloud Vision OCR — TEXT_DETECTION for pixel-precise bounding boxes | 🟡 Ready |
| 4c | [4c_matching_algorithm.md](4c_matching_algorithm.md) | Levenshtein matching algorithm — connect Gemini labels → OCR boxes → confidence | 🟡 Ready |

> All three sub-parts run as a single n8n Workflow 3. No code changes to sop-extractor or sop-api.

---

## Current State (2026-04-01)

### Phase 3 Confirmed Complete ✅
- `sop_steps` table: 4 rows for sop_id `82c234ae-67d5-479a-a4cc-f31abc8fe855`
- Frames: frame_001 → frame_005 in Azure Blob (`cnavinfsop/infsop/{sop_id}/frames/`)
- `pipeline_runs.status` = `classifying_frames` ✅ (ready for Phase 4 to pick up)

### Workflow 3 Ready ✅
File: `sop-platform/n8n-workflows/Saara - SOP_Workflow 3 - Gemini Classification.json`

All placeholder values replaced with real credentials:

| Config Key | Status |
|------------|--------|
| `SUPABASE_ANON_KEY` | ✅ Updated (current key matching Workflow 2) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Updated (current key matching Workflow 2) |
| `AZURE_BLOB_SAS_TOKEN` | ✅ Set (expires 2026-05-29) |
| `GEMINI_API_KEY` | ✅ Set (`AIzaSyAjXWH-8y75rCVIxcuRyAsUGEZtDPh1kwk` — AI Studio key from Phase 2) |
| `VISION_API_KEY` | ✅ Set (`AIzaSyC425vceP7XsdbYQzzZiEeCSK6GHFR0PoM` — Google Cloud Vision OCR) |

### Prerequisite: Enable Cloud Vision API in GCP
Before importing Workflow 3, ensure the Cloud Vision API is enabled:
1. Go to Google Cloud Console → APIs & Services → Library
2. Search "Cloud Vision API" → Enable
3. The `VISION_API_KEY` will then work for `vision.googleapis.com`

---

## Import & Run Steps

1. In n8n: delete old Workflow 3 (if any), import fresh JSON from:
   `sop-platform/n8n-workflows/Saara - SOP_Workflow 3 - Gemini Classification.json`
2. Activate the workflow (toggle ON)
3. Wait up to 2 minutes for the scheduler, or click "Execute Workflow" manually
4. Verify in Supabase after run (see Verify SQL section below)

---

## Architecture

**Phase 4 data flow (18 nodes, Workflow 3):**
```
Supabase pipeline_runs (status = classifying_frames)
  → n8n polls every 2 minutes
  → Get all sop_steps WHERE sop_id = X
      AND frame_classification = 'useful'
      AND gemini_description IS NULL          ← safe to retry
  → SplitInBatches(1) — one frame at a time
    → Build Image URL  (append SAS token)
    → Download Frame Image  (GET PNG from Azure Blob)
    → Build Gemini Request  (base64 encode + prompt)           ← 4a
    → Call Gemini Vision  (gemini-2.5-flash:generateContent)  ← 4a
    → Parse Gemini Response  (description + ui_elements)      ← 4a
    → Call Vision OCR  (TEXT_DETECTION via vision.googleapis) ← 4b
    → Run Matching Algorithm  (Levenshtein match)             ← 4c
    → Update SOP Step  (PATCH gemini_description)
    → Insert Step Callouts  (POST step_callouts array)
    → [loop back — next step]
  → Update Pipeline Run  (PATCH status = generating_annotations)
```

---

## What Gemini Returns Per Frame

Input: PNG screenshot (1580×890px, screen-share crop from Phase 3)

Output (JSON):
```json
{
  "description": "The trainer opens the Aged Debtor report by double-clicking the Credit Check folder",
  "ui_elements": [
    {
      "label": "Credit Check",
      "element_type": "folder",
      "target_x": 450,
      "target_y": 320,
      "region_hint": "center of screen, Windows Explorer"
    }
  ]
}
```

---

## Database Writes

**sop_steps (PATCH per step):**
```
gemini_description = "The trainer navigates to..."
```

**step_callouts (POST per step — array):**
```
step_id            → sop_steps.id
callout_number     → 1, 2, 3...
label              → "Credit Check"
element_type       → "folder"
target_x / target_y → OCR pixel coords (or Gemini fallback)
gemini_region_hint → "center of screen, Windows Explorer"
confidence         → "ocr_exact" | "ocr_fuzzy" | "gemini_only"
match_method       → "ocr_exact_text" | "ocr_fuzzy_text" | "gemini_coordinates"
ocr_matched_text   → actual OCR text matched (or null)
```

---

## Pipeline Status Flow

```
classifying_frames  →  generating_annotations
```

---

## Key Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Model | gemini-2.5-flash | Same as Phase 2, fast + multimodal |
| Image delivery | base64 inlineData | Azure Blob URLs require SAS — can't pass fileData URI directly |
| responseMimeType | application/json | Forces clean JSON, no markdown wrapper |
| Batch size | 1 step per tick | Avoids Gemini rate limits, easier failure isolation |
| OCR | Google Cloud Vision TEXT_DETECTION | Pixel-precise bounding boxes for callout refinement |
| Confidence levels | ocr_exact / ocr_fuzzy / gemini_only | Enables UI confidence colour coding in React (Phase 6) |
| Retry safety | `gemini_description IS NULL` filter | Re-running skips already-annotated steps safely |

---

## Verify SQL

```sql
-- Check annotations filled in
SELECT id, sequence, title, gemini_description
FROM sop_steps
WHERE sop_id = '82c234ae-67d5-479a-a4cc-f31abc8fe855'
ORDER BY sequence;

-- Check callouts created
SELECT sc.step_id, sc.callout_number, sc.label, sc.element_type,
       sc.target_x, sc.target_y, sc.confidence, sc.match_method
FROM step_callouts sc
JOIN sop_steps ss ON ss.id = sc.step_id
WHERE ss.sop_id = '82c234ae-67d5-479a-a4cc-f31abc8fe855'
ORDER BY ss.sequence, sc.callout_number;

-- Check pipeline advanced
SELECT status, current_stage
FROM pipeline_runs
WHERE sop_id = '82c234ae-67d5-479a-a4cc-f31abc8fe855';
```
