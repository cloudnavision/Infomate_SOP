# Plan: DOCX Export Redesign — Infomate Branded Format
**Date:** 2026-04-10
**Spec:** `docs/superpowers/specs/2026-04-10-docx-export-redesign.md`

---

## File Map

| Action | File |
|--------|------|
| MODIFY | `sop-platform/extractor/app/doc_renderer.py` |
| REWRITE | `sop-platform/data/templates/create_placeholder_template.py` |
| REGENERATED (output) | `sop-platform/data/templates/sop_template.docx` |

---

## Task 1 — Add `_generate_process_map()` to `doc_renderer.py`

**File:** `sop-platform/extractor/app/doc_renderer.py`

Insert after the `_download_inline_image()` function (after line 143). Add the import `from io import BytesIO` at the top (line 6 area).

**Add to imports (top of file, after `from docx.shared import Inches`):**
```python
from io import BytesIO
```

**New function to insert after `_download_inline_image()`:**
```python
def _generate_process_map(
    tpl: DocxTemplate,
    steps: list[dict],
    tmp_dir: Path,
) -> Optional[InlineImage]:
    """Generate a sequential process map PNG using Pillow and return as InlineImage."""
    try:
        from PIL import Image, ImageDraw, ImageFont

        # Layout constants
        IMG_W = 1400
        PADDING = 40
        BOX_H = 80
        BOX_RADIUS = 12
        ARROW_H = 30
        CIRCLE_R = 22
        HEADER_H = 70

        ORANGE = (232, 92, 26)
        LIGHT_GREY = (245, 245, 245)
        BORDER_COLOR = (204, 204, 204)
        TEXT_COLOR = (26, 26, 26)
        WHITE = (255, 255, 255)

        n = len(steps)
        if n == 0:
            return None

        total_h = HEADER_H + PADDING + n * BOX_H + (n - 1) * ARROW_H + PADDING

        img = Image.new("RGB", (IMG_W, total_h), WHITE)
        draw = ImageDraw.Draw(img)

        # Try to load a font; fall back to default
        try:
            font_title = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
            font_body = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
            font_num = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20)
        except Exception:
            font_title = ImageFont.load_default()
            font_body = font_title
            font_num = font_title

        # Header bar
        draw.rectangle([(0, 0), (IMG_W, HEADER_H)], fill=ORANGE)
        draw.text((PADDING, HEADER_H // 2 - 12), "Process Flow", font=font_title, fill=WHITE)

        y = HEADER_H + PADDING
        box_x1 = PADDING
        box_x2 = IMG_W - PADDING

        for i, step in enumerate(steps):
            is_last = (i == n - 1)

            # Box background
            draw.rounded_rectangle(
                [(box_x1, y), (box_x2, y + BOX_H)],
                radius=BOX_RADIUS,
                fill=LIGHT_GREY,
                outline=ORANGE if is_last else BORDER_COLOR,
                width=2,
            )

            # Step number circle
            cx = box_x1 + PADDING // 2 + CIRCLE_R
            cy = y + BOX_H // 2
            draw.ellipse(
                [(cx - CIRCLE_R, cy - CIRCLE_R), (cx + CIRCLE_R, cy + CIRCLE_R)],
                fill=ORANGE,
            )
            num_text = str(step.get("sequence", i + 1))
            draw.text(
                (cx - CIRCLE_R // 2 - 2, cy - CIRCLE_R // 2),
                num_text,
                font=font_num,
                fill=WHITE,
            )

            # Step title
            title = step.get("title", "")
            text_x = box_x1 + PADDING // 2 + CIRCLE_R * 2 + 12
            draw.text(
                (text_x, y + BOX_H // 2 - 12),
                title[:70] + ("…" if len(title) > 70 else ""),
                font=font_body,
                fill=TEXT_COLOR,
            )

            y += BOX_H

            # Arrow between steps
            if not is_last:
                mid_x = IMG_W // 2
                draw.line([(mid_x, y), (mid_x, y + ARROW_H - 8)], fill=BORDER_COLOR, width=2)
                # Arrowhead (triangle)
                draw.polygon(
                    [(mid_x - 8, y + ARROW_H - 8), (mid_x + 8, y + ARROW_H - 8), (mid_x, y + ARROW_H)],
                    fill=BORDER_COLOR,
                )
                y += ARROW_H

        # Save PNG
        map_path = tmp_dir / "process_map.png"
        img.save(str(map_path), "PNG")
        return InlineImage(tpl, str(map_path), width=Inches(5.5))

    except Exception as exc:
        logger.warning("Could not generate process map: %s", exc)
        return None
```

**Update `_build_context()` — add process map and split sections:**

Replace the existing `_build_context` function (lines 80–125) with:
```python
def _build_context(tpl: DocxTemplate, sop_data: dict, tmp_dir: Path) -> dict:
    """Build the Jinja2 context dict for docxtpl."""
    steps_raw = sop_data.get("steps", [])
    steps_ctx = []

    for step in steps_raw:
        screenshot = None
        ann_url = step.get("annotated_screenshot_url") or step.get("screenshot_url")
        if ann_url:
            screenshot = _download_inline_image(tpl, ann_url, tmp_dir, step.get("id", "unknown"))

        steps_ctx.append({
            "sequence": step.get("sequence", ""),
            "title": step.get("title", ""),
            "description": step.get("description") or "",
            "sub_steps": step.get("sub_steps") or [],
            "screenshot": screenshot,
            "callouts": [
                {
                    "callout_number": c.get("callout_number"),
                    "label": c.get("label", ""),
                }
                for c in (step.get("callouts") or [])
            ],
        })

    # Split sections into before/after the procedure (display_order < 50 = pre, >= 50 = post)
    all_sections = sop_data.get("sections") or []
    sections_pre = [
        {"section_title": s.get("section_title", ""), "content_text": s.get("content_text") or ""}
        for s in all_sections
        if (s.get("display_order") or 0) < 50
    ]
    sections_post = [
        {"section_title": s.get("section_title", ""), "content_text": s.get("content_text") or ""}
        for s in all_sections
        if (s.get("display_order") or 0) >= 50
    ]

    # Generate process map
    process_map = _generate_process_map(tpl, steps_raw, tmp_dir)

    today = date.today().strftime("%d %b %Y")

    return {
        "sop_title": sop_data.get("sop_title", ""),
        "client_name": sop_data.get("client_name") or "",
        "process_name": sop_data.get("process_name") or "",
        "meeting_date": sop_data.get("meeting_date") or "",
        "generated_date": today,
        "step_count": sop_data.get("step_count", len(steps_raw)),
        "steps": steps_ctx,
        "sections_pre": sections_pre,
        "sections_post": sections_post,
        "process_map": process_map,
    }
```

**Verify (manual):** No syntax errors → `python -c "import ast; ast.parse(open('extractor/app/doc_renderer.py').read()); print('OK')`

---

## Task 2 — Rewrite `create_placeholder_template.py`

**File:** `sop-platform/data/templates/create_placeholder_template.py`

Full replacement:
```python
"""
Generates sop_template.docx — Infomate-branded SOP template.
Run once to regenerate the template file:
    pip install python-docx
    python data/templates/create_placeholder_template.py

Context variables consumed:
    sop_title, client_name, process_name, meeting_date,
    generated_date, step_count,
    sections_pre (list), sections_post (list),
    process_map (InlineImage | None),
    steps (list of {sequence, title, description, sub_steps, screenshot, callouts})
"""
from pathlib import Path
from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


ORANGE = RGBColor(0xE8, 0x5C, 0x1A)
DARK = RGBColor(0x1A, 0x1A, 0x1A)


def _set_heading_orange(paragraph):
    for run in paragraph.runs:
        run.font.color.rgb = ORANGE
        run.font.bold = True


def _add_orange_heading(doc, text, level=2):
    p = doc.add_heading(text, level=level)
    for run in p.runs:
        run.font.color.rgb = ORANGE
    return p


def _add_meta_table(doc, rows):
    """Add a compact 2-column label/value table for metadata."""
    table = doc.add_table(rows=len(rows), cols=2)
    table.style = "Table Grid"
    for i, (label, val) in enumerate(rows):
        cells = table.rows[i].cells
        cells[0].text = label
        cells[0].paragraphs[0].runs[0].bold = True
        cells[1].text = val
    doc.add_paragraph()  # spacer


def create():
    doc = Document()

    # ── COVER PAGE ──────────────────────────────────────────────────────────────
    cover_title = doc.add_paragraph()
    cover_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = cover_title.add_run("{{ sop_title }}")
    run.font.size = Pt(28)
    run.font.bold = True
    run.font.color.rgb = ORANGE

    doc.add_paragraph()  # spacer

    _add_meta_table(doc, [
        ("Client", "{{ client_name }}"),
        ("Process", "{{ process_name }}"),
        ("Meeting Date", "{{ meeting_date }}"),
        ("Generated", "{{ generated_date }}"),
        ("Total Steps", "{{ step_count }}"),
    ])

    doc.add_page_break()

    # ── TABLE OF CONTENTS ────────────────────────────────────────────────────────
    _add_orange_heading(doc, "Table of Contents", level=1)
    p = doc.add_paragraph("(Update field after opening in Word: right-click → Update Field)")
    p.runs[0].font.italic = True
    p.runs[0].font.color.rgb = RGBColor(0x88, 0x88, 0x88)
    doc.add_page_break()

    # ── PRE-PROCEDURE SECTIONS (display_order < 50) ──────────────────────────────
    doc.add_paragraph("{%- for section in sections_pre %}")
    _add_orange_heading(doc, "{{ section.section_title }}", level=2)
    doc.add_paragraph("{{ section.content_text | default('') }}")
    doc.add_paragraph("{%- endfor %}")

    doc.add_page_break()

    # ── PROCESS MAP ──────────────────────────────────────────────────────────────
    _add_orange_heading(doc, "Process Map", level=2)
    doc.add_paragraph("{%- if process_map %}{{ process_map }}{%- else %}(Process map not available){%- endif %}")

    doc.add_page_break()

    # ── DETAILED PROCEDURE ───────────────────────────────────────────────────────
    _add_orange_heading(doc, "Detailed Procedure", level=1)

    doc.add_paragraph("{%- for step in steps %}")

    step_heading = doc.add_heading("Step {{ step.sequence }}: {{ step.title }}", level=3)
    for run in step_heading.runs:
        run.font.color.rgb = DARK

    doc.add_paragraph("{{ step.description | default('') }}")

    # Sub-steps bullet list
    doc.add_paragraph("{%- for sub in step.sub_steps %}")
    sub_p = doc.add_paragraph(style="List Bullet")
    sub_p.add_run("{{ sub }}")
    doc.add_paragraph("{%- endfor %}")

    # Screenshot
    doc.add_paragraph("{%- if step.screenshot %}{{ step.screenshot }}{%- endif %}")

    # Callout legend
    doc.add_paragraph("{%- if step.callouts %}")
    callout_heading = doc.add_paragraph()
    r = callout_heading.add_run("Callout References")
    r.bold = True
    r.font.size = Pt(10)
    doc.add_paragraph("{%- for callout in step.callouts %}")
    doc.add_paragraph("{{ callout.callout_number }}. {{ callout.label }}")
    doc.add_paragraph("{%- endfor %}")
    doc.add_paragraph("{%- endif %}")

    doc.add_paragraph("{%- endfor %}")

    doc.add_page_break()

    # ── POST-PROCEDURE SECTIONS (display_order >= 50) ────────────────────────────
    doc.add_paragraph("{%- for section in sections_post %}")
    _add_orange_heading(doc, "{{ section.section_title }}", level=2)
    doc.add_paragraph("{{ section.content_text | default('') }}")
    doc.add_paragraph("{%- endfor %}")

    out = Path(__file__).parent / "sop_template.docx"
    doc.save(out)
    print(f"Template created: {out}")


if __name__ == "__main__":
    create()
```

---

## Task 3 — Run Template Script

In WSL terminal:
```bash
cd "/mnt/d/CloudNavision/1. Projects/SOP/SOP Automation System/sop-platform"
pip install python-docx --quiet
python data/templates/create_placeholder_template.py
```

**Expected output:**
```
Template created: /mnt/d/CloudNavision/1. Projects/SOP/SOP Automation System/sop-platform/data/templates/sop_template.docx
```

Verify the file updated (check modified time):
```bash
ls -la "data/templates/sop_template.docx"
```

---

## Task 4 — Rebuild Extractor Container

```bash
cd "/mnt/d/CloudNavision/1. Projects/SOP/SOP Automation System/sop-platform"
docker compose up -d --build sop-extractor
```

**Expected output:**
```
[+] Building ...
[+] Running 1/1
 ✔ Container sop-extractor  Started
```

Verify container is healthy:
```bash
docker ps --filter name=sop-extractor
```

---

## Task 5 — End-to-End Test

Trigger a DOCX export from the UI (or via curl):
```bash
curl -X POST "http://localhost:8000/api/sops/<SOP_ID>/export?format=docx" \
  -H "Authorization: Bearer <token>" \
  -o test_export.docx
```

Open `test_export.docx` in Word. Verify:
- [ ] Cover page: orange title, metadata table
- [ ] Sections before procedure (if any in DB)
- [ ] Process map image (flowchart with step boxes)
- [ ] Detailed Procedure with step title, description, annotated screenshot, callouts
- [ ] Sections after procedure (if any)

---

## Rollback

If export breaks, the original template is not backed up separately — but it can be regenerated from the old `create_placeholder_template.py` via git history:
```bash
git show HEAD:sop-platform/data/templates/create_placeholder_template.py > old_create.py
python old_create.py
```
