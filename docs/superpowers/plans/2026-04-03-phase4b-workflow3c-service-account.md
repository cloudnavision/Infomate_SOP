# Phase 4b — Workflow 3c: Full Hybrid via GCP Service Account

**Date:** 2026-04-03
**Spec:** `docs/superpowers/specs/2026-04-03-phase4b-ocr-service-account-design.md`
**Output:** New folder + new workflow JSON file (Workflow 3c)

---

## File Map

| File | Action |
|------|--------|
| `sop-platform/n8n-workflows/v2-service-account/` | Create new folder |
| `sop-platform/n8n-workflows/v2-service-account/README.md` | Create — credential setup instructions |
| `sop-platform/n8n-workflows/v2-service-account/Saara - SOP_Workflow 3c - Full Hybrid (Service Account).json` | Create — updated workflow |

---

## Task 1 — Create folder + README

**File:** `sop-platform/n8n-workflows/v2-service-account/README.md`

```markdown
# n8n Workflows v2 — GCP Service Account

These workflows replace API key authentication with a GCP Service Account credential.
All Gemini classification calls use Vertex AI. Cloud Vision OCR uses the Vision API.

## Why a separate folder?
- `../` (parent) = original API-key workflows — kept as rollback reference
- `v2-service-account/` = production workflows using service account auth

## Credential Setup (one-time, in n8n UI)

1. Go to **n8n → Credentials → New**
2. Search for **"Google Service Account"** (NOT "Google API" or "Google OAuth2")
3. Paste the full contents of your GCP service account JSON key file
4. Name it exactly: **`GCP Service Account - SOP Platform`**
5. Save

The service account needs these GCP roles:
- `roles/aiplatform.user` — Vertex AI (Gemini classification)
- `roles/cloudvision.user` — Cloud Vision API (OCR)

Scope: `https://www.googleapis.com/auth/cloud-platform`

## After importing Workflow 3c

1. Open **Call Gemini Vision** node → Authentication → confirm "GCP Service Account - SOP Platform" is selected
2. Open **Call Vision OCR** node → Authentication → confirm same credential
3. Update **Setup Config** node → set `GCP_PROJECT_ID` to your GCP project ID
4. Activate the workflow (disable Workflow 3 and 3b first to avoid duplicate runs)

## Workflows in this folder

| File | Purpose |
|------|---------|
| `Saara - SOP_Workflow 3c - Full Hybrid (Service Account).json` | Production: Gemini (Vertex AI) + Vision OCR, service account auth |

## Workflows NOT in this folder (kept in parent)

| File | Purpose |
|------|---------|
| `Saara - SOP_Workflow 3 - Gemini Classification.json` | Archive: original API key version |
| `Saara - SOP_Workflow 3b - Gemini Only.json` | Useful for testing without OCR |
```

**Verify:** File exists at the correct path.
**Commit:** `docs: add v2-service-account workflow folder + README`

---

## Task 2 — Generate Workflow 3c JSON

**File:** `sop-platform/n8n-workflows/v2-service-account/Saara - SOP_Workflow 3c - Full Hybrid (Service Account).json`

This is a full JSON file. Write it completely — do not reference the old file.

Changes from Workflow 3:
1. **Setup Config**: Remove `GEMINI_API_KEY`, `VISION_API_KEY`. Add `GCP_PROJECT_ID`, `GCP_REGION`
2. **Extract Run Info**: Code updated to pass GCP vars instead of API keys
3. **Upload to Gemini Files**: REMOVED
4. **Convert to Base64**: NEW node after Download Frame Image
5. **Build Gemini Request**: Uses `inlineData` (base64) instead of `fileData.fileUri`, reads from Convert to Base64
6. **Call Gemini Vision**: Vertex AI URL, service account auth
7. **Call Vision OCR**: No `?key=` param, service account auth
8. Connections updated accordingly

Full JSON content:

```json
{
  "name": "Saara - SOP_Workflow 3c - Full Hybrid (Service Account)",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [{ "field": "minutes", "minutesInterval": 2 }]
        }
      },
      "id": "cf3c0001-0001-4000-8000-000000000001",
      "name": "Every 2 Minutes",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [240, 300]
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            { "id": "cfg-001", "name": "SUPABASE_URL", "value": "https://hzluuqhbkiblmojxgbab.supabase.co", "type": "string" },
            { "id": "cfg-002", "name": "SUPABASE_ANON_KEY", "value": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6bHV1cWhia2libG1vanhnYmFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MDAyNDYsImV4cCI6MjA4OTM3NjI0Nn0.zJErIoi_PlbalqrwW30MtiF05Zxa1yH1MywVJAJMhGY", "type": "string" },
            { "id": "cfg-003", "name": "SUPABASE_SERVICE_ROLE_KEY", "value": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6bHV1cWhia2libG1vanhnYmFiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzgwMDI0NiwiZXhwIjoyMDg5Mzc2MjQ2fQ.YSNsIxY-pwMKOATmYvA1QkOccO2k_uxY7hb7QNL5x5o", "type": "string" },
            { "id": "cfg-004", "name": "AZURE_BLOB_SAS_TOKEN", "value": "sv=2024-11-04&ss=bfqt&srt=co&sp=rwdlacuptfx&se=2026-05-29T19:34:00Z&st=2026-03-19T11:19:00Z&spr=https&sig=bZSDd5DD751V7rlhHyRNjVyWkJRxUrr7vyxgho6YdYk%3D", "type": "string" },
            { "id": "cfg-005", "name": "GCP_PROJECT_ID", "value": "REPLACE_WITH_YOUR_GCP_PROJECT_ID", "type": "string" },
            { "id": "cfg-006", "name": "GCP_REGION", "value": "us-central1", "type": "string" }
          ]
        },
        "options": {}
      },
      "id": "cf3c0001-0002-4000-8000-000000000002",
      "name": "Setup Config",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [460, 300]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "={{ $json.SUPABASE_URL }}/rest/v1/pipeline_runs",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "apikey", "value": "={{ $json.SUPABASE_ANON_KEY }}" },
            { "name": "Authorization", "value": "=Bearer {{ $json.SUPABASE_SERVICE_ROLE_KEY }}" }
          ]
        },
        "sendQuery": true,
        "queryParameters": {
          "parameters": [
            { "name": "status", "value": "eq.classifying_frames" },
            { "name": "select", "value": "id,sop_id" },
            { "name": "limit", "value": "1" }
          ]
        },
        "options": {}
      },
      "id": "cf3c0001-0003-4000-8000-000000000003",
      "name": "Poll Pending Classifications",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [680, 300]
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "strict" },
          "conditions": [
            {
              "id": "cond-001",
              "leftValue": "={{ $json.id }}",
              "rightValue": "",
              "operator": { "type": "string", "operation": "notEmpty", "singleValue": true }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "id": "cf3c0001-0004-4000-8000-000000000004",
      "name": "Any Pending?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [900, 300]
    },
    {
      "parameters": {},
      "id": "cf3c0001-0005-4000-8000-000000000005",
      "name": "No Work — Stop",
      "type": "n8n-nodes-base.noOp",
      "typeVersion": 1,
      "position": [1120, 460]
    },
    {
      "parameters": {
        "jsCode": "const run = $input.first().json;\nconst config = $('Setup Config').first().json;\n\nreturn [{\n  json: {\n    pipeline_run_id: run.id,\n    sop_id: run.sop_id,\n    SUPABASE_URL: config.SUPABASE_URL,\n    SUPABASE_ANON_KEY: config.SUPABASE_ANON_KEY,\n    SUPABASE_SERVICE_ROLE_KEY: config.SUPABASE_SERVICE_ROLE_KEY,\n    AZURE_BLOB_SAS_TOKEN: config.AZURE_BLOB_SAS_TOKEN,\n    GCP_PROJECT_ID: config.GCP_PROJECT_ID,\n    GCP_REGION: config.GCP_REGION,\n  }\n}];"
      },
      "id": "cf3c0001-0006-4000-8000-000000000006",
      "name": "Extract Run Info",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1120, 300]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "={{ $json.SUPABASE_URL }}/rest/v1/sop_steps",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "apikey", "value": "={{ $json.SUPABASE_ANON_KEY }}" },
            { "name": "Authorization", "value": "=Bearer {{ $json.SUPABASE_SERVICE_ROLE_KEY }}" }
          ]
        },
        "sendQuery": true,
        "queryParameters": {
          "parameters": [
            { "name": "sop_id", "value": "=eq.{{ $json.sop_id }}" },
            { "name": "frame_classification", "value": "eq.useful" },
            { "name": "gemini_description", "value": "is.null" },
            { "name": "select", "value": "id,sequence,screenshot_url,timestamp_start,screenshot_width,screenshot_height" },
            { "name": "order", "value": "sequence.asc" }
          ]
        },
        "options": {}
      },
      "id": "cf3c0001-0007-4000-8000-000000000007",
      "name": "Get SOP Steps",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1340, 300]
    },
    {
      "parameters": { "batchSize": 1, "options": {} },
      "id": "cf3c0001-0008-4000-8000-000000000008",
      "name": "Split Steps",
      "type": "n8n-nodes-base.splitInBatches",
      "typeVersion": 3,
      "position": [1560, 300]
    },
    {
      "parameters": {
        "jsCode": "const step = $input.first().json;\nconst config = $('Setup Config').first().json;\n\nreturn [{\n  json: {\n    step_id: step.id,\n    sequence: step.sequence,\n    timestamp_start: step.timestamp_start,\n    screenshot_url: step.screenshot_url,\n    screenshot_width: step.screenshot_width || 1920,\n    screenshot_height: step.screenshot_height || 1080,\n    screenshot_url_with_sas: step.screenshot_url + '?' + config.AZURE_BLOB_SAS_TOKEN,\n  }\n}];"
      },
      "id": "cf3c0001-0009-4000-8000-000000000009",
      "name": "Build Image URL",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1780, 180]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "={{ $json.screenshot_url_with_sas }}",
        "sendHeaders": true,
        "headerParameters": { "parameters": [] },
        "options": {
          "response": { "response": { "responseFormat": "file" } },
          "timeout": 30000
        }
      },
      "id": "cf3c0001-0010-4000-8000-000000000010",
      "name": "Download Frame Image",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [2000, 180]
    },
    {
      "parameters": {
        "jsCode": "// Convert downloaded PNG binary → base64 for Vertex AI inlineData\nconst item = $input.first();\nconst prevJson = $('Build Image URL').first().json;\n\nconst buffer = await this.helpers.getBinaryDataBuffer(item, 'data');\nconst base64 = buffer.toString('base64');\n\nif (!base64) throw new Error('Base64 conversion failed — empty buffer from Download Frame Image');\n\nreturn [{\n  json: {\n    step_id: prevJson.step_id,\n    sequence: prevJson.sequence,\n    screenshot_url: prevJson.screenshot_url,\n    screenshot_width: prevJson.screenshot_width,\n    screenshot_height: prevJson.screenshot_height,\n    screenshot_url_with_sas: prevJson.screenshot_url_with_sas,\n    imageBase64: base64,\n  }\n}];"
      },
      "id": "cf3c0001-0020-4000-8000-000000000020",
      "name": "Convert to Base64",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [2220, 180]
    },
    {
      "parameters": {
        "jsCode": "const prevData = $('Convert to Base64').first().json;\nconst imageBase64 = prevData.imageBase64;\n\nif (!imageBase64) throw new Error('No imageBase64 — Convert to Base64 node failed');\n\nconst prompt = `You are analyzing a screenshot from a software training video where a trainer is demonstrating a business process step by step.\n\n1. Write one clear action-oriented sentence describing what is happening on screen (e.g., \"The trainer opens the Aged Debtor report by navigating to the shared Credit Check folder\").\n\n2. Identify all interactive UI elements that should be annotated with numbered callouts. For each element provide:\n   - label: the exact visible text of the element as it appears on screen (used to match against OCR)\n   - element_type: one of: button, folder, cell, menu_item, icon, text_field, dropdown, link, tab, checkbox\n   - target_x: estimated X pixel coordinate from left edge of image (used as fallback if OCR match fails)\n   - target_y: estimated Y pixel coordinate from top edge of image (used as fallback if OCR match fails)\n   - region_hint: brief location description (e.g., \"top-right toolbar\", \"left sidebar third item\")\n\nReturn ONLY valid JSON with no markdown code blocks:\n{\n  \"description\": \"...\",\n  \"ui_elements\": [\n    {\n      \"label\": \"...\",\n      \"element_type\": \"...\",\n      \"target_x\": 0,\n      \"target_y\": 0,\n      \"region_hint\": \"...\"\n    }\n  ]\n}`;\n\nreturn [{\n  json: {\n    step_id: prevData.step_id,\n    sequence: prevData.sequence,\n    screenshot_url: prevData.screenshot_url,\n    screenshot_width: prevData.screenshot_width,\n    screenshot_height: prevData.screenshot_height,\n    screenshot_url_with_sas: prevData.screenshot_url_with_sas,\n    geminiBody: {\n      contents: [{\n        parts: [\n          {\n            inlineData: {\n              mimeType: \"image/png\",\n              data: imageBase64\n            }\n          },\n          { text: prompt }\n        ]\n      }],\n      generationConfig: {\n        temperature: 0.1,\n        responseMimeType: \"application/json\"\n      }\n    }\n  }\n}];"
      },
      "id": "cf3c0001-0011-4000-8000-000000000011",
      "name": "Build Gemini Request",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [2440, 180]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "=https://{{ $('Setup Config').first().json.GCP_REGION }}-aiplatform.googleapis.com/v1/projects/{{ $('Setup Config').first().json.GCP_PROJECT_ID }}/locations/{{ $('Setup Config').first().json.GCP_REGION }}/publishers/google/models/gemini-2.5-flash:generateContent",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "googleApi",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify($json.geminiBody) }}",
        "options": { "timeout": 60000 }
      },
      "credentials": {
        "googleApi": {
          "id": "REPLACE_WITH_CREDENTIAL_ID",
          "name": "GCP Service Account - SOP Platform"
        }
      },
      "id": "cf3c0001-0012-4000-8000-000000000012",
      "name": "Call Gemini Vision",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [2660, 180]
    },
    {
      "parameters": {
        "jsCode": "const data = $input.first().json;\nconst prev = $('Build Gemini Request').first().json;\n\nconst raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';\nlet parsed;\ntry {\n  parsed = JSON.parse(raw);\n} catch (e) {\n  const match = raw.match(/\\{[\\s\\S]*\\}/);\n  try {\n    parsed = match ? JSON.parse(match[0]) : { description: raw, ui_elements: [] };\n  } catch (e2) {\n    parsed = { description: raw, ui_elements: [] };\n  }\n}\n\nconst description = parsed.description || '';\nconst elements = Array.isArray(parsed.ui_elements) ? parsed.ui_elements : [];\n\nconst callouts = elements.map((el, idx) => ({\n  step_id: prev.step_id,\n  callout_number: idx + 1,\n  label: el.label || `Element ${idx + 1}`,\n  element_type: el.element_type || 'button',\n  target_x: Math.round(Number(el.target_x) || 0),\n  target_y: Math.round(Number(el.target_y) || 0),\n  gemini_region_hint: el.region_hint || '',\n  confidence: 'gemini_only',\n  match_method: 'gemini_coordinates',\n}));\n\nreturn [{\n  json: {\n    step_id: prev.step_id,\n    sequence: prev.sequence,\n    screenshot_url: prev.screenshot_url,\n    screenshot_width: prev.screenshot_width,\n    screenshot_height: prev.screenshot_height,\n    screenshot_url_with_sas: prev.screenshot_url_with_sas,\n    gemini_description: description,\n    callouts: callouts,\n    visionOCRBody: {\n      requests: [{\n        image: { source: { imageUri: prev.screenshot_url_with_sas } },\n        features: [{ type: 'TEXT_DETECTION' }]\n      }]\n    },\n  }\n}];"
      },
      "id": "cf3c0001-0013-4000-8000-000000000013",
      "name": "Parse Gemini Response",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [2880, 180]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://vision.googleapis.com/v1/images:annotate",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "googleApi",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify($json.visionOCRBody) }}",
        "options": { "timeout": 30000 }
      },
      "credentials": {
        "googleApi": {
          "id": "REPLACE_WITH_CREDENTIAL_ID",
          "name": "GCP Service Account - SOP Platform"
        }
      },
      "id": "cf3c0001-0017-4000-8000-000000000017",
      "name": "Call Vision OCR",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [3100, 180]
    },
    {
      "parameters": {
        "jsCode": "const geminiData = $('Parse Gemini Response').first().json;\nconst visionData = $input.first().json;\n\nconst textAnnotations = visionData.responses?.[0]?.textAnnotations || [];\nconst ocrWords = textAnnotations.slice(1);\n\nconst imgWidth = geminiData.screenshot_width || 1920;\nconst imgHeight = geminiData.screenshot_height || 1080;\n\nfunction levenshtein(a, b) {\n  const m = a.length, n = b.length;\n  const dp = Array.from({length: m + 1}, () => Array(n + 1).fill(0));\n  for (let i = 0; i <= m; i++) dp[i][0] = i;\n  for (let j = 0; j <= n; j++) dp[0][j] = j;\n  for (let i = 1; i <= m; i++) {\n    for (let j = 1; j <= n; j++) {\n      dp[i][j] = Math.min(\n        dp[i-1][j] + 1,\n        dp[i][j-1] + 1,\n        dp[i-1][j-1] + (a[i-1] !== b[j-1] ? 1 : 0)\n      );\n    }\n  }\n  return dp[m][n];\n}\n\nfunction regionToApproxCoords(hint, w, h) {\n  let x = w * 0.5, y = h * 0.5;\n  const lower = (hint || '').toLowerCase();\n  if (lower.includes('left'))   x = w * 0.15;\n  if (lower.includes('right'))  x = w * 0.85;\n  if (lower.includes('top'))    y = h * 0.15;\n  if (lower.includes('bottom')) y = h * 0.85;\n  if (lower.includes('center') || lower.includes('middle')) { x = w * 0.5; y = h * 0.5; }\n  return { x: Math.round(x), y: Math.round(y) };\n}\n\nconst elements = geminiData.callouts || [];\n\nconst matchedCallouts = elements.map(el => {\n  const label = (el.label || '').toLowerCase().trim();\n  let bestMatch = null;\n  let bestScore = Infinity;\n  let confidence = 'gemini_only';\n  let matchMethod = 'gemini_coordinates';\n\n  for (const ocr of ocrWords) {\n    const ocrText = (ocr.description || '').toLowerCase().trim();\n    if (!ocrText) continue;\n    const vertices = ocr.boundingPoly?.vertices || [];\n    if (vertices.length < 3) continue;\n    const cx = Math.round(((vertices[0].x || 0) + (vertices[2].x || 0)) / 2);\n    const cy = Math.round(((vertices[0].y || 0) + (vertices[2].y || 0)) / 2);\n\n    if (ocrText === label || label.includes(ocrText) || ocrText.includes(label)) {\n      if (!bestMatch || ocrText.length > (bestMatch.text || '').length) {\n        bestMatch = { x: cx, y: cy, text: ocrText };\n        confidence = 'ocr_exact';\n        matchMethod = 'ocr_exact_text';\n        bestScore = 0;\n      }\n      continue;\n    }\n\n    if (bestScore === 0) continue;\n    const dist = levenshtein(ocrText, label);\n    const threshold = Math.max(2, Math.floor(label.length * 0.3));\n    if (dist <= threshold && dist < bestScore) {\n      bestMatch = { x: cx, y: cy, text: ocrText };\n      confidence = 'ocr_fuzzy';\n      matchMethod = 'ocr_fuzzy_text';\n      bestScore = dist;\n    }\n  }\n\n  let coords;\n  if (bestMatch) {\n    coords = { x: bestMatch.x, y: bestMatch.y };\n  } else if (el.target_x > 0 || el.target_y > 0) {\n    coords = { x: el.target_x, y: el.target_y };\n    matchMethod = 'gemini_coordinates';\n  } else {\n    coords = regionToApproxCoords(el.gemini_region_hint, imgWidth, imgHeight);\n    matchMethod = 'gemini_region_estimate';\n  }\n\n  return {\n    step_id: el.step_id,\n    callout_number: el.callout_number,\n    label: el.label,\n    element_type: el.element_type,\n    target_x: coords.x,\n    target_y: coords.y,\n    gemini_region_hint: el.gemini_region_hint,\n    confidence: confidence,\n    match_method: matchMethod,\n    ocr_matched_text: bestMatch ? bestMatch.text : null,\n  };\n});\n\nreturn [{\n  json: {\n    step_id: geminiData.step_id,\n    sequence: geminiData.sequence,\n    gemini_description: geminiData.gemini_description,\n    callouts: matchedCallouts,\n    callout_count: matchedCallouts.length,\n    ocr_word_count: ocrWords.length,\n  }\n}];"
      },
      "id": "cf3c0001-0018-4000-8000-000000000018",
      "name": "Run Matching Algorithm",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [3320, 180]
    },
    {
      "parameters": {
        "method": "PATCH",
        "url": "={{ $('Setup Config').first().json.SUPABASE_URL }}/rest/v1/sop_steps?id=eq.{{ $json.step_id }}",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "apikey", "value": "={{ $('Setup Config').first().json.SUPABASE_ANON_KEY }}" },
            { "name": "Authorization", "value": "=Bearer {{ $('Setup Config').first().json.SUPABASE_SERVICE_ROLE_KEY }}" },
            { "name": "Content-Type", "value": "application/json" },
            { "name": "Prefer", "value": "return=minimal" }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ gemini_description: $json.gemini_description }) }}",
        "options": {}
      },
      "id": "cf3c0001-0014-4000-8000-000000000014",
      "name": "Update SOP Step",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [3540, 180]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "={{ $('Setup Config').first().json.SUPABASE_URL }}/rest/v1/step_callouts",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "apikey", "value": "={{ $('Setup Config').first().json.SUPABASE_ANON_KEY }}" },
            { "name": "Authorization", "value": "=Bearer {{ $('Setup Config').first().json.SUPABASE_SERVICE_ROLE_KEY }}" },
            { "name": "Content-Type", "value": "application/json" },
            { "name": "Prefer", "value": "return=minimal" }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify($('Run Matching Algorithm').first().json.callouts) }}",
        "options": {}
      },
      "id": "cf3c0001-0015-4000-8000-000000000015",
      "name": "Insert Step Callouts",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [3760, 180]
    },
    {
      "parameters": {
        "method": "PATCH",
        "url": "={{ $('Setup Config').first().json.SUPABASE_URL }}/rest/v1/pipeline_runs?id=eq.{{ $('Extract Run Info').first().json.pipeline_run_id }}",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "apikey", "value": "={{ $('Setup Config').first().json.SUPABASE_ANON_KEY }}" },
            { "name": "Authorization", "value": "=Bearer {{ $('Setup Config').first().json.SUPABASE_SERVICE_ROLE_KEY }}" },
            { "name": "Content-Type", "value": "application/json" },
            { "name": "Prefer", "value": "return=minimal" }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={\"status\": \"generating_annotations\", \"current_stage\": \"annotation_complete\"}",
        "options": {}
      },
      "id": "cf3c0001-0016-4000-8000-000000000016",
      "name": "Update Pipeline Run",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1780, 420]
    }
  ],
  "connections": {
    "Every 2 Minutes": { "main": [[{ "node": "Setup Config", "type": "main", "index": 0 }]] },
    "Setup Config": { "main": [[{ "node": "Poll Pending Classifications", "type": "main", "index": 0 }]] },
    "Poll Pending Classifications": { "main": [[{ "node": "Any Pending?", "type": "main", "index": 0 }]] },
    "Any Pending?": {
      "main": [
        [{ "node": "Extract Run Info", "type": "main", "index": 0 }],
        [{ "node": "No Work — Stop", "type": "main", "index": 0 }]
      ]
    },
    "Extract Run Info": { "main": [[{ "node": "Get SOP Steps", "type": "main", "index": 0 }]] },
    "Get SOP Steps": { "main": [[{ "node": "Split Steps", "type": "main", "index": 0 }]] },
    "Split Steps": {
      "main": [
        [{ "node": "Update Pipeline Run", "type": "main", "index": 0 }],
        [{ "node": "Build Image URL", "type": "main", "index": 0 }]
      ]
    },
    "Build Image URL": { "main": [[{ "node": "Download Frame Image", "type": "main", "index": 0 }]] },
    "Download Frame Image": { "main": [[{ "node": "Convert to Base64", "type": "main", "index": 0 }]] },
    "Convert to Base64": { "main": [[{ "node": "Build Gemini Request", "type": "main", "index": 0 }]] },
    "Build Gemini Request": { "main": [[{ "node": "Call Gemini Vision", "type": "main", "index": 0 }]] },
    "Call Gemini Vision": { "main": [[{ "node": "Parse Gemini Response", "type": "main", "index": 0 }]] },
    "Parse Gemini Response": { "main": [[{ "node": "Call Vision OCR", "type": "main", "index": 0 }]] },
    "Call Vision OCR": { "main": [[{ "node": "Run Matching Algorithm", "type": "main", "index": 0 }]] },
    "Run Matching Algorithm": { "main": [[{ "node": "Update SOP Step", "type": "main", "index": 0 }]] },
    "Update SOP Step": { "main": [[{ "node": "Insert Step Callouts", "type": "main", "index": 0 }]] },
    "Insert Step Callouts": { "main": [[{ "node": "Split Steps", "type": "main", "index": 0 }]] }
  },
  "active": false,
  "settings": { "executionOrder": "v1" },
  "versionId": "cf3c0001-ffff-4000-8000-000000000001",
  "meta": { "instanceId": "sop-platform-workflow-3c" },
  "id": "workflow-3c-full-hybrid-service-account",
  "tags": []
}
```

**Verify:** Valid JSON (no parse errors), file exists in `v2-service-account/` folder.

**Commit:** `feat(n8n): add Workflow 3c — full hybrid via GCP service account`

---

## Task 3 — Post-import checklist (manual steps in n8n UI)

After importing the JSON into n8n:

1. **Create credential in n8n UI:**
   - Credentials → New → "Google Service Account"
   - Paste full service account JSON key content
   - Name: `GCP Service Account - SOP Platform`
   - Save → note the credential ID shown

2. **Wire credential to nodes:**
   - Open **Call Gemini Vision** → Authentication tab → should show "GCP Service Account - SOP Platform" — confirm
   - Open **Call Vision OCR** → Authentication tab → confirm same credential
   - (n8n auto-matches by name on import; verify both are wired)

3. **Set GCP Project ID:**
   - Open **Setup Config** node
   - Change `GCP_PROJECT_ID` value from `REPLACE_WITH_YOUR_GCP_PROJECT_ID` to your actual project ID (e.g. `sop-platform-prod`)

4. **Disable old workflows:**
   - Deactivate Workflow 3 and Workflow 3b to prevent duplicate runs

5. **Test with one SOP:**
   - Reset one SOP's pipeline_run to `classifying_frames`
   - Manually trigger Workflow 3c
   - Verify: Step callouts inserted with `confidence = 'ocr_exact'` or `'ocr_fuzzy'` (not gemini_only)

---

## Node Change Summary

| Node | Change |
|------|--------|
| Setup Config | `GEMINI_API_KEY` + `VISION_API_KEY` removed → `GCP_PROJECT_ID` + `GCP_REGION` added |
| Extract Run Info | Code: passes GCP vars, not API keys |
| Upload to Gemini Files | **Removed entirely** |
| Convert to Base64 | **New** — binary PNG → base64 string via `getBinaryDataBuffer` |
| Build Gemini Request | Reads `imageBase64` from Convert to Base64, uses `inlineData` not `fileData.fileUri` |
| Call Gemini Vision | Vertex AI URL, `predefinedCredentialType` → `googleApi` credential |
| Call Vision OCR | No `?key=` param, `predefinedCredentialType` → `googleApi` credential |
| All other nodes | Unchanged |
