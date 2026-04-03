"""
Phase 8: Re-render annotated screenshot PNG with callout circles.
Uses Pillow — already in requirements.txt (Pillow==10.4.0).
"""

import io
import logging
import tempfile
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

# Circle styling
CIRCLE_RADIUS = 18
CIRCLE_BORDER = 3
FONT_SIZE = 16

DOT_FILL = (59, 130, 246)       # blue
DOT_BORDER = (255, 255, 255)    # white


def _draw_callout_dot(draw: ImageDraw.Draw, cx: int, cy: int, number: int) -> None:
    """Draw a numbered circle at pixel position (cx, cy)."""
    r = CIRCLE_RADIUS
    b = CIRCLE_BORDER

    # Outer white border
    draw.ellipse(
        [cx - r - b, cy - r - b, cx + r + b, cy + r + b],
        fill=DOT_BORDER,
    )
    # Filled circle
    draw.ellipse(
        [cx - r, cy - r, cx + r, cy + r],
        fill=DOT_FILL,
    )
    # Number text — centred
    text = str(number)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", FONT_SIZE)
    except (IOError, OSError):
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text((cx - tw // 2, cy - th // 2), text, fill=(255, 255, 255), font=font)


def render_annotated(
    step_id: str,
    screenshot_url: str,
    callouts: list[dict],          # [{"number": 1, "target_x": 23, "target_y": 14}, ...]
    azure_blob_base_url: str,      # e.g. https://cnavinfsop.blob.core.windows.net/infsop
    azure_sas_token: str,
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

    # 2. Draw callouts
    draw = ImageDraw.Draw(img)
    for c in callouts:
        # target_x/y are raw pixel coordinates from the pipeline
        cx = min(max(0, c["target_x"]), w)
        cy = min(max(0, c["target_y"]), h)
        _draw_callout_dot(draw, cx, cy, c["number"])
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
