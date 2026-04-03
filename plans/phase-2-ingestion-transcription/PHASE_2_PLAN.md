# Phase 2: Ingestion + Transcription

**Objective:** Build the first stage of the n8n pipeline — watch a SharePoint folder for new KT recordings, download the MP4, upload to Azure Blob Storage, transcribe with Gemini 2.5 Flash, detect screen share regions, and write the transcript + SOP record to Supabase.

**Status: ✅ Complete** — 2026-03-26

---

## Sub-Parts

| Sub-Part | Description | Status |
|----------|-------------|--------|
| 2a | n8n → SharePoint connection (Graph API, OAuth, watch folder) | ✅ Complete |
| 2b | n8n → Download MP4 → Upload to Azure Blob | ✅ Complete |
| 2c | n8n → Gemini transcription + screen share detection | ✅ Complete |
| 2d | n8n → Write transcript + SOP record to Supabase | ✅ Complete |

> **Implementation note:** All 4 sub-parts were built as a **single consolidated n8n workflow** (`n8n-workflows/2a_sharepoint_connection.json`) rather than 4 separate workflows. This was more practical — the data flows continuously from SharePoint → Azure → Gemini → Supabase in one execution chain.

---

## Architecture

**Phase 2 data flow (as built):**
```
SharePoint (M365) — Saara site, Documents/Infomate/SOP folder
  → n8n polls every 15 minutes via Graph API
  → Get Root Site → Analyze Root Site → Access Saara Site → Get Document Libraries
  → Find Documents Library → List SOP Files
  → Get Processed Files (Supabase dedup check)
  → Filter New MP4 Files (Code node — exclude already processed)
  → Any New Files? (IF node)
    → FALSE → No New Files — Stop (NoOp)
    → TRUE → Process One File At a Time (SplitInBatches, batchSize=1)
      → Download from SharePoint (Graph API /content, responseFormat=file)
      → Generate SOP ID (UUID + blob_url + mime_type computation)
      → Upload to Azure Blob (PUT with SAS token, BlockBlob)
      → Create SOP Record (Supabase sops table, status=processing)
      → Create Pipeline Run (Supabase pipeline_runs, status=transcribing)
      → Mark File Processed ← moved here to lock file BEFORE Gemini
      → Start Gemini Upload (resumable upload start, fullResponse=true for header)
      → Reattach Binary (lost after Azure Blob PUT empty response)
      → Complete Gemini Upload (PUT to signed URL, sends video binary)
      → Wait for File Processing (10s Wait node)
      → Check File Status (GET /v1beta/files/{name})
      → File Active? (IF state == ACTIVE)
        → FALSE → loop back to Wait for File Processing
        → TRUE → [parallel]:
            → Gemini Transcription (generateContent, 900s timeout)
            → Gemini Screen Detection (generateContent, 900s timeout)
      → Merge Results (combine both)
      → Parse Transcript (Code node — build transcript_lines array, screen_changes, costs)
      → Insert Transcript Lines (POST to Supabase transcript_lines)
      → Update SOP Record (PATCH — participants, screen_share_periods, video_duration_sec)
      → Update Pipeline Run (PATCH — status=extracting_frames, stage_results, api_cost)
```

**Services used:**

| Service | How n8n connects | Purpose |
|---------|-----------------|---------|
| SharePoint | Graph API via "Saara - Sharepoint" oAuth2Api credential | Watch folder, download MP4 |
| Azure Blob | REST PUT with SAS token | Store original MP4 |
| Gemini 2.5 Flash | REST API with `x-goog-api-key` header | Transcription + screen detection |
| Supabase | REST API (PostgREST) with apikey + Bearer | Write SOP, transcript, pipeline status |

---

## Key Information (as built)

| Item | Value |
|------|-------|
| n8n instance | `https://awsn8n.cloudnavision.com/` |
| SharePoint site | Saara — `cloudnavision.sharepoint.com/sites/Saara` |
| SharePoint path | Documents → Infomate → SOP |
| Azure Blob account | `cnavinfsop` |
| Azure Blob container | `infsop` (not `sop-media` as originally planned) |
| Gemini model | `gemini-2.5-flash` (model ID: `gemini-2.5-flash`) |
| Workflow file | `sop-platform/n8n-workflows/2a_sharepoint_connection.json` |
| Poll interval | Every 15 minutes |
| Gemini File API | v1beta (resumable upload protocol) |

---

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Single vs 4 workflows | Single workflow | Data flows continuously — no benefit to splitting |
| SharePoint auth | oAuth2Api credential ("Saara - Sharepoint") | TL had existing credential set up |
| Azure Blob naming | SAS token PUT | Simpler than managed identity for n8n |
| Dedup mechanism | `processed_sharepoint_files` table | Prevents re-upload on every poll cycle |
| Mark File Processed timing | BEFORE Gemini (after Create Pipeline Run) | Prevents duplicate Azure uploads if Gemini fails |
| Gemini API auth | API key (`x-goog-api-key` header) | See note below ↓ |
| Gemini File polling | Wait (10s) → Check Status → IF ACTIVE loop | Gemini files go PROCESSING → ACTIVE before use |
| Binary reattach | Code node after Start Gemini Upload | Azure Blob PUT returns empty 201 — binary is lost |
| Pipeline status after Phase 2 | `extracting_frames` | Next valid enum value — signals Phase 3 is ready |

---

## Why Google AI Studio API Key Instead of Vertex AI / Service Account

> **TL's original request:** Use Google Service Account credentials for Gemini (Vertex AI approach).

**Why it didn't work:**

1. **Vertex AI scopes don't cover the Gemini File API.** The Gemini File API (`generativelanguage.googleapis.com/upload/v1beta/files`) is part of the Generative Language API, not Vertex AI. Service account tokens scoped for Vertex AI (`https://www.googleapis.com/auth/cloud-platform`) return 403 Forbidden on File API calls.

2. **GCP project 542708778979 had Generative Language API disabled.** The original project didn't have the API enabled, causing a 403 error even with the right key.

3. **n8n doesn't have a native Google Service Account node** for non-Google-Cloud APIs. Implementing JWT-based token exchange for service accounts requires a custom Code node (complex).

**Resolution:** Created a new GCP project, enabled Generative Language API, and generated an API key from Google AI Studio. The API key is stored in `Setup Config` node as `GEMINI_API_KEY`.

**Future plan:** Migrate to Vertex AI (`aiplatform.googleapis.com`) for production — it supports service accounts, has enterprise SLAs, and allows quota management. The migration requires changing the endpoint URL and auth method but the prompts stay the same.

---

## Issues Encountered & Fixes

| # | Issue | Root Cause | Fix |
|---|-------|-----------|-----|
| 1 | Duplicate Azure Blob uploads | `Mark File Processed` ran after Gemini — if Gemini failed, file wasn't locked, causing re-upload on next run | Moved `Mark File Processed` to BEFORE Gemini (after `Create Pipeline Run`). Added `Prefer: resolution=merge-duplicates` for upsert |
| 2 | Azure Blob upload shows empty output | Azure returns 201 with empty body — correct behaviour | Added `alwaysOutputData: true`, confirmed 201 = success |
| 3 | Binary lost after Azure Blob PUT | Azure PUT response is empty — n8n drops the binary | Added `Reattach Binary` Code node that re-attaches `$('Download from SharePoint1').first().binary` |
| 4 | `Start Gemini Upload` missing upload URL | `fullResponse: false` by default — upload URL is in response HEADER, not body | Added `fullResponse: true` option to capture response headers |
| 5 | Gemini Forbidden (403) — first GCP project | Generative Language API disabled in project 542708778979 | Created new GCP project, enabled API, got new key from AI Studio |
| 6 | Gemini Forbidden (403) — service account | Vertex AI scopes don't work with Gemini File API | Switched to API key auth (`x-goog-api-key` header) on all 4 Gemini nodes |
| 7 | `File not in ACTIVE state` error | Gemini processes uploaded files asynchronously — takes 10-60s | Added polling loop: `Wait for File Processing` (10s) → `Check File Status` → `File Active?` (IF) → loop back if PROCESSING |
| 8 | `Check File Status` URL 404 | `$json.file.name` was undefined — data from `Wait for File Processing` has `name` at root, not under `.file` | Changed to `$json.name` |
| 9 | `file_uri` expression broken after import | Node name mismatch — `$('Complete Gemini Upload')` vs `$('Complete Gemini Upload1')` when importing over existing workflow | Changed `file_uri` reference from `$('Complete Gemini Upload').first().json.file.uri` to `$json.uri` (from Check File Status response) |
| 10 | n8n node "1" suffix on re-import | n8n appends "1" to node names when importing over existing workflow | Delete old workflow, re-import JSON fresh |
| 11 | `Get Processed Files` showing stale data | n8n displays last execution output — doesn't re-fetch when table is empty | Verified table actually empty with `SELECT COUNT(*) FROM processed_sharepoint_files`, then ran full workflow fresh |
| 12 | Gemini Transcription timeout (300s) | 27-minute video takes >5 min to transcribe | Increased timeout to 900000ms (15 min) on both Gemini nodes |
| 13 | `pipeline_status` enum error — `transcription_complete` | Not a valid enum value in database | Ran `SELECT unnest(enum_range(NULL::pipeline_status))`, chose `extracting_frames` as correct next status |
| 14 | Cloudflare Tunnel `127.0.0.1:8001` not reachable | cloudflared container's `127.0.0.1` is its own localhost, not the host | Changed cloudflared to `network_mode: "host"` — now `127.0.0.1:8001` reaches sop-extractor via host network |
| 15 | `Insert Transcript Lines` / `Update SOP Record` appear empty | `Prefer: return=minimal` — Supabase returns empty 201 on success | This is correct. Confirmed data in Supabase with direct SQL queries |

---

## Checklist (completed)

```
2a: SharePoint Connection
- [x] "Saara - Sharepoint" oAuth2Api credential used (pre-existing)
- [x] n8n workflow: Get Root Site → Analyze Root Site → Access Saara Site
- [x] n8n workflow: Get Document Libraries → Find Documents Library
- [x] n8n workflow: List SOP Files (ordered by lastModifiedDateTime desc)
- [x] n8n workflow: Get Processed Files (Supabase dedup query)
- [x] n8n workflow: Filter New MP4 Files (Code node — mp4 detection + dedup)
- [x] n8n workflow: Any New Files? (IF node → true/false branch)
- [x] n8n workflow: Process One File At a Time (SplitInBatches, size=1)
- [x] Test: n8n lists and detects new MP4 in Saara SharePoint folder

2b: Azure Blob Upload
- [x] Azure Blob container `infsop` used (pre-existing)
- [x] SAS token confirmed working
- [x] n8n workflow: Download from SharePoint (Graph API /items/{id}/content)
- [x] n8n workflow: Generate SOP ID (UUID, blob_url, mime_type)
- [x] n8n workflow: Upload to Azure Blob (PUT with SAS token, BlockBlob)
- [x] n8n workflow: Create SOP Record in Supabase (status=processing)
- [x] n8n workflow: Create Pipeline Run (status=transcribing)
- [x] n8n workflow: Mark File Processed (upsert with merge-duplicates)
- [x] Test: MP4 in Azure Blob, SOP record in Supabase

2c: Gemini Transcription
- [x] n8n workflow: Start Gemini Upload (resumable, fullResponse=true)
- [x] n8n workflow: Reattach Binary (after Azure PUT empty response)
- [x] n8n workflow: Complete Gemini Upload (PUT to signed URL)
- [x] n8n workflow: Wait for File Processing (10s Wait node)
- [x] n8n workflow: Check File Status (GET file state)
- [x] n8n workflow: File Active? (IF — poll loop until ACTIVE)
- [x] n8n workflow: Gemini Transcription (generateContent, 900s timeout)
- [x] n8n workflow: Gemini Screen Detection (generateContent, 900s timeout, parallel)
- [x] Test: transcript JSON has speakers, timestamps, text, screen_changes

2d: Supabase Write
- [x] n8n workflow: Merge Results (combine Transcription + Screen Detection)
- [x] n8n workflow: Parse Transcript (Code node — build lines array, cost calc)
- [x] n8n workflow: Insert Transcript Lines (bulk POST to Supabase)
- [x] n8n workflow: Update SOP Record (PATCH — participants, screen_share_periods, duration)
- [x] n8n workflow: Update Pipeline Run (PATCH — status=extracting_frames, api_cost)
- [x] Test: transcript_lines in Supabase, SOP record updated, pipeline_runs status correct
```

---

## Cloudflare Tunnel Setup (done during Phase 2 pause)

Phase 2 was paused mid-way to set up Cloudflare Tunnel for the `sop-extractor` service (needed for Phase 3). This was completed and verified before resuming Phase 2.

| Item | Value |
|------|-------|
| Tunnel URL | `soptest.cloudnavision.com` → `http://localhost:8001` |
| Service | `sop-extractor` container |
| Container config | `network_mode: "host"` (not `sop-network`) |
| Token location | `.env` → `CLOUDFLARE_TUNNEL_TOKEN` |
| Health check | `curl https://soptest.cloudnavision.com/health` → `{"status":"ok","ffmpeg":true,"mermaid_cli":true}` |

---

## Test Checkpoint — Verified ✅

All verified in Supabase after completing a 5-minute test video run:

1. `sops` table — new record with `status=processing`, `video_url` pointing to Azure Blob, `meeting_participants`, `screen_share_periods`, `video_duration_sec` populated ✅
2. `transcript_lines` table — real transcript with speaker names, timestamps, content ✅
3. `pipeline_runs` table — `status=extracting_frames`, `current_stage=transcription_complete`, `total_api_cost`, `stage_results` ✅
4. `processed_sharepoint_files` table — file_id locked (upsert) ✅
5. Azure Blob — MP4 at `infsop/{sop_id}/original.mp4` ✅

---

## Status: ✅ Complete — 2026-03-26
