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
                {
                    "callout_number": c.get("callout_number"),
                    "label": c.get("label", ""),
                }
                for c in (step.get("callouts") or [])
            ],
        })

    # Split sections: display_order < 50 appear before the procedure, >= 50 after
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

    process_map = _generate_process_map(tpl, steps_raw, tmp_dir)
    today = date.today().strftime("%d %b %Y")

    # Build TOC entries: pre-sections → Process Map → Detailed Procedure → steps → post-sections
    toc_entries = []
    for s in sections_pre:
        toc_entries.append({"title": s["section_title"], "indent": False})
    toc_entries.append({"title": "Process Map", "indent": False})
    toc_entries.append({"title": "Detailed Procedure", "indent": False})
    for step in steps_ctx:
        toc_entries.append({"title": f"Step {step['sequence']}: {step['title']}", "indent": True})
    for s in sections_post:
        toc_entries.append({"title": s["section_title"], "indent": False})

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
