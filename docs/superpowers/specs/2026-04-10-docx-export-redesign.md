# Spec: DOCX Export Redesign — Infomate Branded Format
**Date:** 2026-04-10
**Status:** Approved

---

## Problem

The current `sop_template.docx` is a minimal placeholder with no branding, no structured sections, and no process map. The client requires exports that match the Infomate/Starboard Hotels document format (as seen in *Aged Debtor Process.pdf*).

---

## Goals

1. DOCX/PDF export matches the Infomate branded format (orange headers, structured sections)
2. Annotated screenshots (with callout dots) are used — already implemented, no change needed
3. A sequential process map (flowchart PNG) is embedded in the document
4. No new Docker dependencies

---

## Non-Goals

- Swimlane process map (deferred — requires role assignment per step)
- Logo embedding (deferred — no logo files available yet)
- Mermaid rendering via `mmdc` (not needed for sequential flowchart)

---

## Document Structure

The generated DOCX follows this section order:

| # | Section | Source |
|---|---------|--------|
| — | Cover Page | `sop_title`, `client_name`, `process_name`, `meeting_date`, `generated_date` |
| — | Table of Contents | Static heading (Word auto-updates) |
| 1 | Purpose / Scope | `sections` loop (section_key="purpose" or similar) |
| 2 | Inputs / Outputs | `sections` loop |
| 3 | Training Prerequisites | `sections` loop |
| 4 | Software Applications | `sections` loop |
| 5 | Process Map | Generated PNG from steps (Pillow) |
| 6 | Detailed Procedure | `steps` loop — title, description, sub_steps, annotated screenshot, callout legend |
| 7+ | Remaining Sections | `sections` loop (FAQ, Quality Parameters, etc.) |

> **Note:** Sections are rendered in `display_order` from the DB. The template uses a single `sections` loop — the split between "before procedure" and "after procedure" is handled by passing two filtered lists to the context: `sections_pre` (display_order < 50) and `sections_post` (display_order >= 50).

---

## Process Map Design

**Generator:** `_generate_process_map(steps, tmp_dir)` → returns `InlineImage`

**Layout (Pillow PNG, 1400×auto px):**
- Orange header bar: "Process Flow" white text
- Each step: rounded rectangle, light grey fill, dark border
  - Left: orange circle with step number
  - Right: step title text (wrapped)
- Arrow (▼) between steps, centred
- Final step box has orange border to indicate completion
- Padding: 40px sides, 20px between steps

**Color palette (matches Infomate orange theme):**
- Orange: `#E85C1A`
- Light grey box: `#F5F5F5`
- Border: `#CCCCCC`
- Text: `#1A1A1A`

---

## Template Styling (python-docx)

**Cover page:**
- Heading 1 paragraph with orange font: `{{ sop_title }}`
- Table: 2 columns (label | value) for metadata
- Page break

**Section headings:** Heading 2 style, orange colour `#E85C1A`

**Steps:**
- Heading 3: `Step {{ step.sequence }}: {{ step.title }}`
- Normal paragraph: `{{ step.description }}`
- Bullet list for sub_steps
- Inline image for screenshot (5.5 inches wide)
- Numbered list for callouts (`{{ callout.callout_number }}. {{ callout.label }}`)

---

## Files Changed

| File | Change |
|------|--------|
| `data/templates/create_placeholder_template.py` | Full rewrite — branded template with all sections |
| `extractor/app/doc_renderer.py` | Add `_generate_process_map()`, update `_build_context()` to split sections and add process map |

## Files NOT Changed

| File | Reason |
|------|--------|
| `extractor/app/main.py` | Export endpoint unchanged |
| `extractor/requirements.txt` | No new packages (Pillow already present) |
| `api/app/routes/sops.py` | Export route unchanged |

---

## Deployment Steps

1. Run `python data/templates/create_placeholder_template.py` (in WSL or locally) → updates `sop_template.docx`
2. `docker compose up -d --build sop-extractor` → picks up `doc_renderer.py` changes
3. Test: trigger DOCX export from UI → verify format, screenshot, process map

---

## Open Questions

- Logo files: once provided, add `infomate_logo.png` and `starboard_logo.png` to `data/templates/` and update cover page
- Section key mapping: if pipeline generates specific `section_key` values, consider ordering sections by key rather than `display_order`
