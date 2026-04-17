# Phase 4b — OCR + Gemini via GCP Service Account (Workflow 3c)

**Date:** 2026-04-03
**Status:** Design — pending approval
**Scope:** New n8n workflow file replacing API key auth with GCP Service Account for both Gemini (Vertex AI) and Cloud Vision OCR

---

## Problem

Workflow 3 (full hybrid) uses API key authentication for two Google APIs:

| Node | Current Auth | Problem |
|------|-------------|---------|
| Upload to Gemini Files | `?key=GEMINI_API_KEY` on `generativelanguage.googleapis.com/upload/v1beta/files` | **Files API does not exist on Vertex AI** — cannot keep this node when switching to service account |
| Call Gemini Vision | `?key=GEMINI_API_KEY` on `generativelanguage.googleapis.com/v1beta/models/...` | Must change to Vertex AI endpoint for service account auth |
| Call Vision OCR | `?key=VISION_API_KEY` on `vision.googleapis.com/v1/images:annotate` | Same URL, auth method changes |

Switching to service account requires removing the Files API upload step and replacing it with **inline base64 image data** sent directly in the Gemini request body.

---

## Architecture Decision

### Why inline base64 instead of Files API?

Vertex AI Gemini (`aiplatform.googleapis.com`) supports:
- `inlineData` — base64 image in the request body ✅
- `fileData` with `gs://` GCS URIs ✅
- `fileData` with Gemini Files API URIs (`https://generativelanguage.googleapis.com/...`) ❌ — not supported on Vertex AI

Inline base64 is the simplest path. Screenshots are ~200-500KB PNG files — well within Vertex AI's 20MB inline limit.

### One service account for both APIs

Single GCP service account with roles:
- `roles/aiplatform.user` — Gemini via Vertex AI
- `roles/cloudvision.user` — Cloud Vision API

Scope: `https://www.googleapis.com/auth/cloud-platform`

n8n "Google Service Account" credential type handles OAuth2 token generation automatically. No manual Bearer token management needed.

### Workflow 1 (Ingestion) unchanged

Workflow 1 uses the Gemini **File API** for video transcription — this is incompatible with Vertex AI and must stay on API key auth. Workflow 3c does not affect Workflow 1.

---

## Node-by-Node Changes

### Setup Config (Edit)
Remove:
- `GEMINI_API_KEY`
- `VISION_API_KEY`

Add:
- `GCP_PROJECT_ID` — GCP project where Vertex AI + Vision API are enabled (e.g. `sop-platform-prod`)
- `GCP_REGION` — Vertex AI region (e.g. `us-central1`)

### Extract Run Info Code node (Edit)
Remove from output object:
```js
GEMINI_API_KEY: config.GEMINI_API_KEY,
VISION_API_KEY: config.VISION_API_KEY,
```
Add:
```js
GCP_PROJECT_ID: config.GCP_PROJECT_ID,
GCP_REGION: config.GCP_REGION,
```

### Upload to Gemini Files (Remove)
This node is deleted. The download → base64 → inline approach replaces it.

### Convert to Base64 (New node — after Download Frame Image)
**Type:** Code node (JS)
**Position:** Between "Download Frame Image" and "Build Gemini Request"

```javascript
const item = $input.first();
const prevJson = $('Build Image URL').first().json;

const buffer = await this.helpers.getBinaryDataBuffer(item, 'data');
const base64 = buffer.toString('base64');

return [{
  json: {
    step_id: prevJson.step_id,
    sequence: prevJson.sequence,
    screenshot_url: prevJson.screenshot_url,
    screenshot_width: prevJson.screenshot_width,
    screenshot_height: prevJson.screenshot_height,
    screenshot_url_with_sas: prevJson.screenshot_url_with_sas,
    imageBase64: base64,
  }
}];
```

### Build Gemini Request Code node (Edit)
Change input source from `$('Upload to Gemini Files')` to `$('Convert to Base64')`.

Replace `fileData.fileUri` pattern with `inlineData`:
```javascript
// Old (Gemini Files API):
{
  fileData: {
    mimeType: "image/png",
    fileUri: fileUri
  }
}

// New (Vertex AI inline):
{
  inlineData: {
    mimeType: "image/png",
    data: imageBase64   // from Convert to Base64 node
  }
}
```

Full `geminiBody` stays otherwise identical — same prompt, same `generationConfig`.

### Call Gemini Vision (Edit)
**Old URL:**
```
https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={{ $('Setup Config').first().json.GEMINI_API_KEY }}
```

**New URL:**
```
https://{{ $('Setup Config').first().json.GCP_REGION }}-aiplatform.googleapis.com/v1/projects/{{ $('Setup Config').first().json.GCP_PROJECT_ID }}/locations/{{ $('Setup Config').first().json.GCP_REGION }}/publishers/google/models/gemini-2.5-flash:generateContent
```

**Auth:** Change from None to → Predefined Credential Type → Google Service Account → `[your credential]`
Remove any `x-goog-api-key` header if present.

### Call Vision OCR (Edit)
**Old URL:**
```
https://vision.googleapis.com/v1/images:annotate?key={{ $('Setup Config').first().json.VISION_API_KEY }}
```

**New URL:**
```
https://vision.googleapis.com/v1/images:annotate
```

**Auth:** Predefined Credential Type → Google Service Account → `[your credential]`
Request body unchanged — `imageUri` with Azure Blob SAS URL still works (Vision API fetches from any public URL).

---

## File Strategy

| File | Action |
|------|--------|
| `Saara - SOP_Workflow 3 - Gemini Classification.json` | Keep unchanged — reference / rollback |
| `Saara - SOP_Workflow 3b - Gemini Only.json` | Keep unchanged — still useful for testing without OCR |
| `Saara - SOP_Workflow 3c - Full Hybrid (Service Account).json` | **New** — production workflow |

---

## GCP Setup Steps (Manual — done once)

1. In GCP Console → IAM → Service Accounts → Create Service Account
   - Name: `sop-platform-n8n`
   - Roles: `Vertex AI User` + `Cloud Vision API User`
2. Create JSON key → Download
3. In n8n → Credentials → New → "Google Service Account"
   - Paste JSON key contents
   - Name: `GCP Service Account - SOP Platform`
4. Note the credential ID — referenced in Workflow 3c nodes

---

## What Doesn't Change

- All Supabase nodes (HTTP auth pattern unchanged)
- All Azure Blob nodes
- Pipeline run status flow
- Matching algorithm (Run Matching Algorithm Code node)
- Workflow 1, 2, 4 — untouched
- Vision OCR request body (`imageUri` still works with SAS URL)
- Gemini response parsing (Vertex AI publishers/google returns identical response schema)
