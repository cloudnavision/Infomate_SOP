# n8n Workflows v2 — GCP Service Account

These workflows replace API key authentication with a GCP Service Account credential.
Gemini classification calls use **Vertex AI**. Vision OCR uses **Cloud Vision API**.

## Why a separate folder?

| Folder | Purpose |
|--------|---------|
| `../` (parent) | Original API-key workflows — kept as rollback reference |
| `v2-service-account/` | Production workflows using service account auth |

## Credential Setup (one-time, in n8n UI)

1. Go to **n8n → Credentials → New**
2. Search for **"Google Service Account"**
3. Paste the full contents of your GCP service account JSON key file
4. Name it exactly: **`GCP Service Account - SOP Platform`**
5. Save

The service account needs these GCP roles:
- `roles/aiplatform.user` — Vertex AI (Gemini classification)
- `roles/cloudvision.user` — Cloud Vision API (OCR)

## After importing Workflow 3c

1. Open **Call Gemini Vision** node → verify "GCP Service Account - SOP Platform" is selected
2. Open **Call Vision OCR** node → verify same credential
3. Open **Setup Config** node → set `GCP_PROJECT_ID` to your actual GCP project ID
4. Deactivate Workflow 3 and Workflow 3b to avoid duplicate runs
5. Activate Workflow 3c

## Workflows in this folder

| File | Purpose |
|------|---------|
| `Saara - SOP_Workflow 3c - Full Hybrid (Service Account).json` | Production: Gemini (Vertex AI) + Vision OCR via service account |

## Key differences from Workflow 3 (parent folder)

| Node | Old (API key) | New (Service Account) |
|------|--------------|----------------------|
| Auth | `?key=API_KEY` in URL | Google Service Account credential |
| Gemini URL | `generativelanguage.googleapis.com` | `aiplatform.googleapis.com` (Vertex AI) |
| Image input | Upload to Gemini Files API first | Inline base64 in request body |
| Vision URL | `vision.googleapis.com?key=...` | `vision.googleapis.com` (no key param) |
| Setup Config | Has `GEMINI_API_KEY`, `VISION_API_KEY` | Has `GCP_PROJECT_ID`, `GCP_REGION` |
