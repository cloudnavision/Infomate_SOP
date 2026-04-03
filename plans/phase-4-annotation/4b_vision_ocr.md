# Phase 4b: Google Cloud Vision OCR

### Objective
After Gemini identifies WHAT elements to annotate (4a), call Google Cloud Vision TEXT_DETECTION to get pixel-precise bounding boxes for all visible text in the screenshot. This is the WHERE step — it gives us the exact coordinates that Gemini's estimates can't reliably provide (~60% accuracy).

### Cost
Free under 1,000 units/month (Google Cloud Vision free tier). At 5-15 SOPs/month with ~11 frames each, this is ~55-165 API calls/month — well within the free tier.

---

### API Call

**n8n node:** "Call Vision OCR"
**Position:** After "Parse Gemini Response", before "Run Matching Algorithm"

```
POST https://vision.googleapis.com/v1/images:annotate?key={VISION_API_KEY}
Content-Type: application/json

{
  "requests": [{
    "image": {
      "source": {
        "imageUri": "{screenshot_url_with_sas}"
      }
    },
    "features": [{ "type": "TEXT_DETECTION" }]
  }]
}
```

> `imageUri` uses the Azure Blob SAS URL from "Build Image URL" node — the URL is publicly accessible for the duration of the SAS token.

---

### Response Shape

```json
{
  "responses": [{
    "textAnnotations": [
      {
        "description": "Credit Check\nNavigate to Reports\n...",
        "boundingPoly": { "vertices": [{...}] }
      },
      {
        "description": "Credit",
        "boundingPoly": {
          "vertices": [
            {"x": 120, "y": 310},
            {"x": 220, "y": 310},
            {"x": 220, "y": 330},
            {"x": 120, "y": 330}
          ]
        }
      },
      {
        "description": "Check",
        "boundingPoly": { ... }
      }
    ]
  }]
}
```

**Key rule:** `textAnnotations[0]` is the full text block (skip it). `textAnnotations[1+]` are individual words/phrases with bounding boxes.

---

### Bounding Box → Center Point

The matching algorithm (4c) needs a center point `(cx, cy)` for each OCR word:

```javascript
const vertices = ocr.boundingPoly.vertices;
const cx = Math.round((vertices[0].x + vertices[2].x) / 2);
const cy = Math.round((vertices[0].y + vertices[2].y) / 2);
```

`vertices[0]` = top-left, `vertices[2]` = bottom-right.

---

### Setup Config

Add `VISION_API_KEY` to the "Setup Config" n8n node:

| Field | Value | Notes |
|-------|-------|-------|
| `VISION_API_KEY` | Google Cloud API key | Enable "Cloud Vision API" in the same GCP project used for Gemini. Same key often works if created in GCP console (not AI Studio). |

> If using a Google AI Studio key, you may need to create a separate GCP project key with Cloud Vision API enabled.

---

### n8n Node Configuration

```
Node name:    Call Vision OCR
Node type:    HTTP Request
Method:       POST
URL:          =https://vision.googleapis.com/v1/images:annotate?key={{ $('Setup Config').first().json.VISION_API_KEY }}
Content-Type: application/json (header)
Body type:    JSON (raw expression)
Body:         ={{ JSON.stringify({"requests": [{"image": {"source": {"imageUri": $('Build Image URL').first().json.screenshot_url_with_sas}}, "features": [{"type": "TEXT_DETECTION"}]}]}) }}
Timeout:      30s
```

---

### Status: ⬜ Pending
