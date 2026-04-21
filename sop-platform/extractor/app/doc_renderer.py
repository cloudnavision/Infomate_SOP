"""
SOP Document Renderer
Phase 7a: docxtpl template injection + LibreOffice PDF conversion + Azure Blob upload
"""
import logging
import subprocess
import tempfile
from datetime import date
from pathlib import Path
from typing import Optional

import requests
from docxtpl import DocxTemplate, InlineImage
from docx.shared import Inches

logger = logging.getLogger(__name__)

TEMPLATE_PATH = Path("/data/templates/sop_template.docx")
EXPORTS_DIR = Path("/data/exports")


def render_sop(
    sop_id: str,
    fmt: str,                   # 'docx' or 'pdf'
    sop_data: dict,
    azure_blob_base_url: str,   # e.g. https://cnavinfsop.blob.core.windows.net/infsop
    azure_sas_token: str,
) -> dict:
    """
    Render a SOP document from the Word template.

    Returns:
        {"docx_url": str, "pdf_url": str | None}
        URLs are base Azure Blob URLs without SAS (safe for DB storage).
    """
    # Rebuild template on first run or if missing
    try:
        from app.build_template import build as build_template
        build_template(force=False)
    except Exception as exc:
        logger.warning("Template builder failed: %s", exc)

    if not TEMPLATE_PATH.exists():
        raise FileNotFoundError(f"Template not found: {TEMPLATE_PATH}")

    export_dir = EXPORTS_DIR / sop_id
    export_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix=f"sop_render_{sop_id}_") as tmp_str:
        tmp_dir = Path(tmp_str)

        tpl = DocxTemplate(str(TEMPLATE_PATH))
        context = _build_context(tpl, sop_data, tmp_dir)
        tpl.render(context)

        # Save rendered docx
        docx_filename = f"sop_{sop_id}.docx"
        docx_path = export_dir / docx_filename
        tpl.save(str(docx_path))
        logger.info("Rendered DOCX: %s (%.1f KB)", docx_path, docx_path.stat().st_size / 1024)

        # Upload DOCX
        docx_blob_path = f"exports/{sop_id}/{docx_filename}"
        docx_base_url = f"{azure_blob_base_url}/{docx_blob_path}"
        _upload_blob(
            docx_path,
            f"{docx_base_url}?{azure_sas_token}",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        logger.info("Uploaded DOCX → %s", docx_blob_path)

        pdf_base_url: Optional[str] = None

        if fmt == "pdf":
            pdf_path = _convert_to_pdf(docx_path, export_dir)
            logger.info("PDF created: %s (%.1f KB)", pdf_path, pdf_path.stat().st_size / 1024)

            pdf_filename = pdf_path.name
            pdf_blob_path = f"exports/{sop_id}/{pdf_filename}"
            pdf_base_url = f"{azure_blob_base_url}/{pdf_blob_path}"
            _upload_blob(pdf_path, f"{pdf_base_url}?{azure_sas_token}", "application/pdf")
            logger.info("Uploaded PDF → %s", pdf_blob_path)

    return {"docx_url": docx_base_url, "pdf_url": pdf_base_url}


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
                {"callout_number": c.get("callout_number"), "label": c.get("label", "")}
                for c in (step.get("callouts") or [])
            ],
        })

    # Split sections: display_order < 50 before procedure, >= 50 after
    all_sections = sop_data.get("sections") or []
    raw_pre  = [s for s in all_sections if (s.get("display_order") or 0) < 50]
    raw_post = [s for s in all_sections if (s.get("display_order") or 0) >= 50]

    # Assign section numbers sequentially (matching Aged Debtor TOC style)
    sec_num = 1
    sections_pre = []
    for s in raw_pre:
        sections_pre.append({
            "num": str(sec_num),
            "section_title": s.get("section_title", ""),
            "content_text": s.get("content_text") or "",
        })
        sec_num += 1

    pm_section_num = str(sec_num); sec_num += 1
    dp_section_num = str(sec_num); sec_num += 1

    sections_post = []
    for s in raw_post:
        sections_post.append({
            "num": str(sec_num),
            "section_title": s.get("section_title", ""),
            "content_text": s.get("content_text") or "",
        })
        sec_num += 1

    pm_config = sop_data.get("process_map_config")
    process_map = (
        _generate_swimlane_map(tpl, pm_config, steps_raw, tmp_dir)
        if pm_config and pm_config.get("lanes") and pm_config.get("assignments")
        else _generate_process_map(tpl, steps_raw, tmp_dir)
    )
    today = date.today().strftime("%d %b %Y")

    # ── Build numbered TOC entries ──────────────────────────────────────────
    # Matches Aged Debtor structure:
    #   1   Procedure Description
    #         Purpose/Scope          (level-1 indent, no number)
    #   2   Training Prerequisites
    #   N   Process Map
    #   N+1 Detailed Procedure
    #         Step 1: ...            (level-1 indent, no number)
    #   N+2 Communication Matrix
    # left_twips: 0 for top-level, 360 for sub-items (~0.63 cm)
    toc_entries = []
    for s in sections_pre:
        toc_entries.append({"num": s["num"], "title": s["section_title"], "left_twips": "0"})

    toc_entries.append({"num": pm_section_num, "title": "Process Map", "left_twips": "0"})
    toc_entries.append({"num": dp_section_num, "title": "Detailed Procedure", "left_twips": "0"})
    for step in steps_ctx:
        toc_entries.append({
            "num": "",
            "title": f"Step {step['sequence']}: {step['title']}",
            "left_twips": "360",
        })

    for s in sections_post:
        toc_entries.append({"num": s["num"], "title": s["section_title"], "left_twips": "0"})

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
        "pm_section_num": pm_section_num,
        "dp_section_num": dp_section_num,
        "process_map": process_map,
        "toc_entries": toc_entries,
    }


def _download_inline_image(
    tpl: DocxTemplate,
    url: str,
    tmp_dir: Path,
    step_id: str,
) -> Optional[InlineImage]:
    """Download a screenshot and return an InlineImage object for docxtpl."""
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        img_path = tmp_dir / f"screenshot_{step_id}.png"
        img_path.write_bytes(resp.content)
        return InlineImage(tpl, str(img_path), width=Inches(5.5))
    except Exception as exc:
        logger.warning("Could not download screenshot for step %s: %s", step_id, exc)
        return None


def _generate_process_map(
    tpl: DocxTemplate,
    steps: list[dict],
    tmp_dir: Path,
) -> Optional[InlineImage]:
    """
    Generate a sequential process map PNG using Pillow and return as InlineImage.
    Draws orange-accented step boxes with downward arrows between them.
    """
    if not steps:
        return None
    try:
        from PIL import Image, ImageDraw, ImageFont

        # Layout
        IMG_W     = 1400
        PADDING   = 50
        BOX_H     = 82
        BOX_R     = 12       # corner radius
        ARROW_H   = 34
        CIRCLE_R  = 24
        HEADER_H  = 72

        # Palette
        ORANGE      = (232, 92, 26)
        LIGHT_GREY  = (245, 245, 245)
        BORDER      = (204, 204, 204)
        TEXT_DARK   = (26, 26, 26)
        WHITE       = (255, 255, 255)

        n = len(steps)
        total_h = HEADER_H + PADDING + n * BOX_H + (n - 1) * ARROW_H + PADDING

        img  = Image.new("RGB", (IMG_W, total_h), WHITE)
        draw = ImageDraw.Draw(img)

        # Fonts (fall back to default pixel font if DejaVu not present)
        try:
            fnt_head = ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 24
            )
            fnt_body = ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 19
            )
            fnt_num  = ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 21
            )
        except Exception:
            fnt_head = fnt_body = fnt_num = ImageFont.load_default()

        # Header bar
        draw.rectangle([(0, 0), (IMG_W, HEADER_H)], fill=ORANGE)
        draw.text((PADDING, HEADER_H // 2 - 14), "Process Flow", font=fnt_head, fill=WHITE)

        y      = HEADER_H + PADDING
        box_x1 = PADDING
        box_x2 = IMG_W - PADDING
        mid_x  = IMG_W // 2

        for i, step in enumerate(steps):
            is_last = i == n - 1

            # Step box
            draw.rounded_rectangle(
                [(box_x1, y), (box_x2, y + BOX_H)],
                radius=BOX_R,
                fill=LIGHT_GREY,
                outline=ORANGE if is_last else BORDER,
                width=2,
            )

            # Numbered circle on the left
            cx = box_x1 + PADDING // 2 + CIRCLE_R
            cy = y + BOX_H // 2
            draw.ellipse(
                [(cx - CIRCLE_R, cy - CIRCLE_R), (cx + CIRCLE_R, cy + CIRCLE_R)],
                fill=ORANGE,
            )
            num_str = str(step.get("sequence", i + 1))
            draw.text((cx - CIRCLE_R // 2 - 1, cy - CIRCLE_R // 2 + 1), num_str, font=fnt_num, fill=WHITE)

            # Step title
            title    = step.get("title", "")
            title    = title[:72] + ("…" if len(title) > 72 else "")
            text_x   = cx + CIRCLE_R + 16
            text_y   = y + BOX_H // 2 - 12
            draw.text((text_x, text_y), title, font=fnt_body, fill=TEXT_DARK)

            y += BOX_H

            # Arrow between steps
            if not is_last:
                arrow_tip = y + ARROW_H
                draw.line([(mid_x, y), (mid_x, arrow_tip - 10)], fill=BORDER, width=2)
                draw.polygon(
                    [(mid_x - 9, arrow_tip - 10), (mid_x + 9, arrow_tip - 10), (mid_x, arrow_tip)],
                    fill=BORDER,
                )
                y += ARROW_H

        map_path = tmp_dir / "process_map.png"
        img.save(str(map_path), "PNG")
        return InlineImage(tpl, str(map_path), width=Inches(5.5))

    except Exception as exc:
        logger.warning("Could not generate process map: %s", exc)
        return None


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def _generate_swimlane_map(
    tpl: DocxTemplate,
    config: dict,
    steps: list[dict],
    tmp_dir: Path,
) -> Optional[InlineImage]:
    """
    Generate a swim-lane process map PNG from process_map_config.
    Lanes are vertical columns; steps flow top-to-bottom with cross-lane arrows.
    """
    if not steps or not config:
        return None
    try:
        from PIL import Image, ImageDraw, ImageFont

        lanes = config.get("lanes", [])
        assignments = config.get("assignments", [])
        if not lanes or not assignments:
            return None

        step_by_id = {s.get("id"): s for s in steps}
        lane_idx = {l["id"]: i for i, l in enumerate(lanes)}

        LANE_W   = 300
        ROW_H    = 110
        BOX_W    = 260
        BOX_H    = 64
        HEADER_H = 58
        MARGIN   = 20
        CIRCLE_R = 18

        n_lanes = len(lanes)
        n_rows  = len(assignments)

        IMG_W = MARGIN + n_lanes * LANE_W + MARGIN
        IMG_H = MARGIN + HEADER_H + n_rows * ROW_H + MARGIN

        WHITE  = (255, 255, 255)
        LIGHT  = (248, 250, 252)
        ALT    = (241, 245, 249)
        BORDER = (203, 213, 225)
        DARK   = (15, 23, 42)
        ARROW  = (148, 163, 184)
        AMBER  = (217, 119, 6)
        CREAM  = (255, 251, 235)

        img  = Image.new("RGB", (IMG_W, IMG_H), WHITE)
        draw = ImageDraw.Draw(img)

        try:
            fnt_head = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 18)
            fnt_body = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 15)
            fnt_num  = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 14)
            fnt_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13)
        except Exception:
            fnt_head = fnt_body = fnt_num = fnt_small = ImageFont.load_default()

        def text_size(text: str, font) -> tuple[int, int]:
            """Return (width, height) of rendered text using textbbox."""
            try:
                bb = draw.textbbox((0, 0), text, font=font)
                return bb[2] - bb[0], bb[3] - bb[1]
            except Exception:
                return len(text) * 8, 16

        def draw_centered(text: str, cx: int, cy: int, font, fill):
            """Draw text centered at (cx, cy)."""
            w, h = text_size(text, font)
            draw.text((cx - w // 2, cy - h // 2), text, font=font, fill=fill)

        def wrap_title(title: str, max_w: int, font) -> list[str]:
            """Wrap title to fit within max_w pixels, max 2 lines."""
            words = title.split()
            lines: list[str] = []
            current = ""
            for word in words:
                test = (current + " " + word).strip()
                w, _ = text_size(test, font)
                if w > max_w and current:
                    lines.append(current)
                    current = word
                    if len(lines) >= 2:
                        break
                else:
                    current = test
            if current and len(lines) < 2:
                lines.append(current)
            # Truncate last line if still too wide
            if lines and text_size(lines[-1], font)[0] > max_w:
                while lines[-1] and text_size(lines[-1] + "…", font)[0] > max_w:
                    lines[-1] = lines[-1][:-1]
                lines[-1] += "…"
            return lines or [""]

        # ── Lane backgrounds + headers ────────────────────────────────────────
        for i, lane in enumerate(lanes):
            lx = MARGIN + i * LANE_W
            ly = MARGIN
            bg = LIGHT if i % 2 == 0 else ALT
            draw.rectangle([(lx, ly), (lx + LANE_W, ly + HEADER_H + n_rows * ROW_H)], fill=bg)
            color_rgb = _hex_to_rgb(lane.get("color", "#3B82F6"))
            draw.rectangle([(lx, ly), (lx + LANE_W, ly + HEADER_H)], fill=color_rgb)
            name = lane.get("name", f"Lane {i + 1}")
            draw_centered(name, lx + LANE_W // 2, ly + HEADER_H // 2, fnt_head, WHITE)
            if i > 0:
                draw.line([(lx, MARGIN), (lx, IMG_H - MARGIN)], fill=BORDER, width=1)

        draw.rectangle([(MARGIN, MARGIN), (IMG_W - MARGIN, IMG_H - MARGIN)], outline=BORDER, width=2)

        def box_center(row: int, lane_id: str) -> tuple[int, int]:
            li = lane_idx.get(lane_id, 0)
            cx = MARGIN + li * LANE_W + LANE_W // 2
            cy = MARGIN + HEADER_H + row * ROW_H + ROW_H // 2
            return cx, cy

        # ── Arrows (drawn behind boxes) ───────────────────────────────────────
        for i, asgn in enumerate(assignments[:-1]):
            next_asgn = assignments[i + 1]
            x1, y1 = box_center(i, asgn["lane_id"])
            x2, y2 = box_center(i + 1, next_asgn["lane_id"])
            is_decision_from = asgn.get("is_decision", False)
            is_decision_to   = next_asgn.get("is_decision", False)
            half_from = (BOX_H // 2 + 8) if is_decision_from else BOX_H // 2
            half_to   = (BOX_H // 2 + 8) if is_decision_to   else BOX_H // 2

            ay_from = y1 + half_from
            ay_to   = y2 - half_to - 4
            mid_y   = y1 + ROW_H // 2

            if x1 == x2:
                draw.line([(x1, ay_from), (x2, ay_to)], fill=ARROW, width=2)
            else:
                draw.line([(x1, ay_from), (x1, mid_y)], fill=ARROW, width=2)
                draw.line([(x1, mid_y), (x2, mid_y)], fill=ARROW, width=2)
                draw.line([(x2, mid_y), (x2, ay_to)], fill=ARROW, width=2)

            draw.polygon([(x2 - 7, ay_to), (x2 + 7, ay_to), (x2, ay_to + 12)], fill=ARROW)

        # ── Step boxes / diamonds ─────────────────────────────────────────────
        for i, asgn in enumerate(assignments):
            step = step_by_id.get(asgn.get("step_id"), {})
            cx, cy = box_center(i, asgn["lane_id"])
            lane   = lanes[lane_idx.get(asgn["lane_id"], 0)]
            color_rgb = _hex_to_rgb(lane.get("color", "#3B82F6"))
            seq_num   = step.get("sequence", i + 1)
            raw_title = step.get("title") or ""

            if asgn.get("is_decision"):
                # Diamond — larger to fit text
                hw, hh = BOX_W // 2, BOX_H // 2 + 10
                draw.polygon([(cx, cy - hh), (cx + hw, cy), (cx, cy + hh), (cx - hw, cy)], fill=CREAM, outline=AMBER, width=2)
                # Sequence label top-left of diamond
                seq_label = f"{seq_num}."
                draw_centered(seq_label, cx - hw // 2, cy - hh // 2 + 4, fnt_num, AMBER)
                # Title wrapped inside diamond (max ~BOX_W - 60px safe inner area)
                title_lines = wrap_title(raw_title, BOX_W - 60, fnt_small)
                line_h = 16
                total_h = len(title_lines) * line_h
                start_y = cy - total_h // 2
                for li, line in enumerate(title_lines):
                    draw_centered(line, cx, start_y + li * line_h, fnt_small, DARK)
            else:
                # Rounded rectangle
                bx = cx - BOX_W // 2
                by = cy - BOX_H // 2
                draw.rounded_rectangle([(bx, by), (bx + BOX_W, by + BOX_H)], radius=8, fill=WHITE, outline=color_rgb, width=2)
                # Number circle
                ccx = bx + 12 + CIRCLE_R
                draw.ellipse([(ccx - CIRCLE_R, cy - CIRCLE_R), (ccx + CIRCLE_R, cy + CIRCLE_R)], fill=color_rgb)
                draw_centered(str(seq_num), ccx, cy, fnt_num, WHITE)
                # Title — wrap to fit in box width minus circle area
                title_area_w = BOX_W - (12 + CIRCLE_R * 2 + 12)
                title_lines = wrap_title(raw_title, title_area_w, fnt_body)
                line_h = 18
                total_h = len(title_lines) * line_h
                tx = ccx + CIRCLE_R + 10
                start_y = cy - total_h // 2
                for li, line in enumerate(title_lines):
                    draw.text((tx, start_y + li * line_h), line, font=fnt_body, fill=DARK)

        map_path = tmp_dir / "process_map_swimlane.png"
        img.save(str(map_path), "PNG")
        return InlineImage(tpl, str(map_path), width=Inches(6.5))

    except Exception as exc:
        logger.warning("Could not generate swimlane map: %s", exc)
        return _generate_process_map(tpl, steps, tmp_dir)


def _convert_to_pdf(docx_path: Path, output_dir: Path) -> Path:
    """Convert a .docx to .pdf using LibreOffice headless."""
    cmd = [
        "libreoffice",
        "--headless",
        "--convert-to", "pdf",
        "--outdir", str(output_dir),
        str(docx_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f"LibreOffice conversion failed: {result.stderr[-500:]}")

    pdf_path = output_dir / docx_path.with_suffix(".pdf").name
    if not pdf_path.exists():
        raise RuntimeError(f"LibreOffice ran but PDF not found at {pdf_path}")
    return pdf_path


def _upload_blob(local_path: Path, sas_url: str, content_type: str) -> None:
    """PUT a file to Azure Blob Storage using a SAS URL."""
    data = local_path.read_bytes()
    resp = requests.put(
        sas_url,
        data=data,
        headers={
            "x-ms-blob-type": "BlockBlob",
            "Content-Type": content_type,
        },
        timeout=120,
    )
    resp.raise_for_status()
