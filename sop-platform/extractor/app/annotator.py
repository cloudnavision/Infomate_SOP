"""
Phase 8: Re-render annotated screenshot PNG with callout annotations.
Style: red border rectangle around target + orange numbered badge + arrow line.
Uses Pillow — already in requirements.txt (Pillow==10.4.0).
"""

import io
import logging
import tempfile
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

# Styling
HIGHLIGHT_COLOR = (220, 38, 38)     # red border around target element
BADGE_COLOR     = (232, 92, 26)     # orange badge background
BADGE_TEXT      = (255, 255, 255)   # white number
ARROW_COLOR     = (232, 92, 26)     # orange arrow line
BADGE_W         = 34
BADGE_H         = 26
BADGE_R         = 5                 # corner radius
HIGHLIGHT_PAD   = 22                # px around target centre for the red box
FONT_SIZE       = 15

BOX_COLOR_MAP = {
    'yellow': (234, 179, 8),
    'red':    (220, 38, 38),
    'green':  (22, 163, 74),
    'blue':   (37, 99, 235),
}


def _draw_highlight_boxes(img: Image.Image, boxes: list[dict]) -> Image.Image:
    """Draw semi-transparent highlight boxes using an RGBA overlay."""
    if not boxes:
        return img
    img_rgba = img.convert('RGBA')
    overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    iw, ih = img.size
    for box in boxes:
        rgb = BOX_COLOR_MAP.get(box.get('color', 'yellow'), (234, 179, 8))
        x, y, w, h = int(box.get('x', 0)), int(box.get('y', 0)), int(box.get('w', 0)), int(box.get('h', 0))
        x2, y2 = min(x + w, iw), min(y + h, ih)
        if x2 <= x or y2 <= y:
            continue
        draw.rectangle([x, y, x2, y2], fill=(*rgb, 50), outline=(*rgb, 210), width=3)
    result = Image.alpha_composite(img_rgba, overlay)
    return result.convert('RGB')


def _draw_callout(
    img: Image.Image,
    draw: ImageDraw.Draw,
    cx: int,
    cy: int,
    number: int,
) -> None:
    """
    Draw a rectangular callout:
      1. Red border box around the target point
      2. Orange rounded-rectangle badge with the callout number
      3. Arrow line from badge to the target box
    """
    w, h = img.size
    pad = HIGHLIGHT_PAD

    # 1. Red highlight box around target
    rx1, ry1 = cx - pad, cy - pad
    rx2, ry2 = cx + pad, cy + pad
    draw.rectangle([rx1, ry1, rx2, ry2], outline=HIGHLIGHT_COLOR, width=3)

    # 2. Badge position — prefer above-left; clamp to image edges
    bx = cx - pad - BADGE_W - 4
    by = cy - pad - BADGE_H - 4
    bx = max(4, min(bx, w - BADGE_W - 4))
    by = max(4, min(by, h - BADGE_H - 4))

    # Badge centre
    bcx = bx + BADGE_W // 2
    bcy = by + BADGE_H // 2

    # 3. Arrow from badge centre-bottom to nearest corner of highlight box
    ax = rx1 if bcx < cx else rx2
    ay = ry1 if bcy < cy else ry2
    draw.line([(bcx, bcy), (ax, ay)], fill=ARROW_COLOR, width=2)

    # 4. Pentagon/arrow badge pointing right (drawn on top of arrow start)
    arrow_tip_x = bx + BADGE_W
    arrow_tip_y = by + BADGE_H // 2
    arrow_notch = BADGE_H // 2  # how far the arrow point extends
    draw.polygon(
        [
            (bx,                           by),
            (bx + BADGE_W - arrow_notch,   by),
            (arrow_tip_x,                  arrow_tip_y),
            (bx + BADGE_W - arrow_notch,   by + BADGE_H),
            (bx,                           by + BADGE_H),
        ],
        fill=BADGE_COLOR,
    )

    # 5. Number centred in badge
    text = str(number)
    try:
        font = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", FONT_SIZE
        )
    except (IOError, OSError):
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text((bcx - tw // 2, bcy - th // 2), text, fill=BADGE_TEXT, font=font)


def render_annotated(
    step_id: str,
    screenshot_url: str,
    callouts: list[dict],          # [{"number": 1, "target_x": 23, "target_y": 14}, ...]
    azure_blob_base_url: str,      # e.g. https://cnavinfsop.blob.core.windows.net/infsop
    azure_sas_token: str,
    highlight_boxes: list[dict] | None = None,
) -> str:
    """
    Download screenshot → draw callout circles → upload PNG to Azure.
    Returns the Azure base URL (no SAS) of the uploaded annotated PNG.
    """
    # 1. Download screenshot
    logger.info("Downloading screenshot for step_id=%s", step_id)
    resp = requests.get(screenshot_url, timeout=30)
    resp.raise_for_status()
    img = Image.open(io.BytesIO(resp.content)).convert("RGB")
    w, h = img.size

    # Draw highlight boxes before callouts (so callouts render on top)
    if highlight_boxes:
        img = _draw_highlight_boxes(img, highlight_boxes)

    # 2. Draw callouts
    draw = ImageDraw.Draw(img)
    for c in callouts:
        # target_x/y are raw pixel coordinates from the pipeline
        cx = min(max(0, c["target_x"]), w)
        cy = min(max(0, c["target_y"]), h)
        _draw_callout(img, draw, cx, cy, c["number"])
        logger.debug("Drew callout #%d at (%d, %d)", c["number"], cx, cy)

    # 3. Save to temp file
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    img.save(tmp_path, format="PNG")
    logger.info("Annotated PNG saved: %s (%.1f KB)", tmp_path, tmp_path.stat().st_size / 1024)

    # 4. Upload to Azure Blob: {step_id}/annotated.png
    blob_path = f"{step_id}/annotated.png"
    azure_base_url = f"{azure_blob_base_url.rstrip('/')}/{blob_path}"
    upload_url = f"{azure_base_url}?{azure_sas_token}"

    with open(tmp_path, "rb") as f:
        data = f.read()
    put_resp = requests.put(
        upload_url,
        data=data,
        headers={
            "x-ms-blob-type": "BlockBlob",
            "Content-Type": "image/png",
        },
        timeout=30,
    )
    put_resp.raise_for_status()
    tmp_path.unlink(missing_ok=True)

    logger.info("Uploaded annotated PNG → %s", azure_base_url)
    return azure_base_url  # No SAS — safe for Supabase storage
