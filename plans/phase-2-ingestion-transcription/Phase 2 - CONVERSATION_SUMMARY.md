# Chat Summary — SOP Automation Platform Build
## Phase 2: Ingestion + Transcription (Complete)
## Date: 2026-03-26

---

## Starting Point

Phase 1.5 (Authentication) was complete. Phase 2 objective: build the n8n pipeline to watch a SharePoint folder for new KT recording MP4s, upload to Azure Blob, transcribe with Gemini 2.5 Flash, and write results to Supabase.

Original plan was 4 separate workflows (2a, 2b, 2c, 2d). Decision was made to build everything as **one consolidated workflow** since the data flows continuously.

---

## Phase Interruption — Cloudflare Tunnel Setup

Phase 2 was paused mid-build to set up Cloudflare Tunnel for the `sop-extractor` container. This was required to prepare for Phase 3 (frame extraction) which needs `soptest.cloudnavision.com` → `http://localhost:8001`.

**Key decision:** Used `network_mode: "host"` on the cloudflared container instead of `sop-network`. This allows `127.0.0.1:8001` inside cloudflared to reach the host's port 8001 (mapped from sop-extractor). The tunnel was verified working: `curl https://soptest.cloudnavision.com/health` → `{"status":"ok","ffmpeg":true,"mermaid_cli":true}`.

---

## What Was Built

### Single consolidated workflow: `sop-platform/n8n-workflows/2a_sharepoint_connection.json`

**Complete node chain (35 nodes):**

```
Every 15 Minutes (Schedule trigger)
→ Setup Config (Set — all config in one place: SITE_NAME, LIBRARY_NAME, FOLDER_PATH,
                SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
                AZURE_BLOB_SAS_TOKEN, AZURE_BLOB_ACCOUNT, AZURE_BLOB_CONTAINER,
                GEMINI_API_KEY)
→ Get Root Site (Graph API)
→ Analyze Root Site (Code — extract tenant domain)
→ Access Saara Site (Graph API)
→ Get Document Libraries (Graph API)
→ Find Documents Library (Code — find "Documents" library)
→ List SOP Files (Graph API — /root:/Infomate/SOP:/children)
→ Get Processed Files (Supabase REST — processed_sharepoint_files table)
→ Filter New MP4 Files (Code — dedup + mp4 filter)
→ Any New Files? (IF)
   → FALSE → No New Files — Stop (NoOp)
   → TRUE → Process One File At a Time (SplitInBatches, size=1)
→ Download from SharePoint (HTTP — /items/{id}/content, responseFormat=file)
→ Generate SOP ID (Code — UUID, blob_url, mime_type, title)
→ Upload to Azure Blob (HTTP PUT — SAS token, BlockBlob, 300s timeout)
→ Create SOP Record (Supabase POST — sops table)
→ Create Pipeline Run (Supabase POST — pipeline_runs table)
→ Mark File Processed (Supabase POST — upsert with merge-duplicates)
→ Start Gemini Upload (HTTP POST — resumable start, fullResponse=true)
→ Reattach Binary (Code — re-attach video binary lost after Azure PUT)
→ Complete Gemini Upload (HTTP PUT — send video binary, 600s timeout)
→ Wait for File Processing (Wait — 10 seconds)
→ Check File Status (HTTP GET — /v1beta/files/{name})
→ File Active? (IF — state == ACTIVE, else loop back to Wait)
→ [parallel]:
   → Gemini Transcription (HTTP POST — generateContent, 900s timeout)
   → Gemini Screen Detection (HTTP POST — generateContent, 900s timeout)
→ Merge Results (Merge — combine both parallel outputs)
→ Parse Transcript (Code — build transcript_lines array + cost calc)
→ Insert Transcript Lines (Supabase POST — bulk insert)
→ Update SOP Record (Supabase PATCH — participants, screen_share_periods, duration)
→ Update Pipeline Run (Supabase PATCH — status=extracting_frames, costs)
```

---

## Key Issues Faced & How They Were Resolved

### Issue 1: Duplicate Azure Blob Uploads
**Problem:** File kept getting re-uploaded on each poll cycle after Gemini failures.
**Root cause:** `Mark File Processed` was placed after Gemini. If Gemini failed, the file wasn't locked in `processed_sharepoint_files`, causing re-upload on next run.
**Fix:** Moved `Mark File Processed` to BEFORE Gemini (after `Create Pipeline Run`). Added `Prefer: return=minimal,resolution=merge-duplicates` for safe upsert.

### Issue 2: Binary Lost After Azure Blob Upload
**Problem:** `Complete Gemini Upload` had no binary to send — it was nil.
**Root cause:** Azure Blob PUT returns an empty 201 response. n8n drops the binary data when the node output is empty.
**Fix:** Added `Reattach Binary` Code node after `Start Gemini Upload` that re-attaches the binary from `$('Download from SharePoint1').first().binary`.

### Issue 3: `Start Gemini Upload` Missing Upload URL
**Problem:** Complete Gemini Upload had no URL to PUT to.
**Root cause:** The Gemini resumable upload returns the upload URL in a **response header** (`X-Goog-Upload-URL`), not the body. n8n by default only captures the body.
**Fix:** Added `fullResponse: true` option to `Start Gemini Upload`. Then access via `$json.headers['x-goog-upload-url']`.

### Issue 4: Gemini API Authentication Failures
**Problem:** All Gemini nodes returned 403 Forbidden.
**Root cause (layered):**
1. TL requested Google Service Account credentials (Vertex AI style)
2. Vertex AI OAuth scopes don't cover the Gemini File API (`generativelanguage.googleapis.com`)
3. GCP project 542708778979 had Generative Language API disabled

**Why we went with API key instead of Vertex AI / Service Account:**
- The Gemini File API is not part of Vertex AI — it's the standalone Generative Language API
- Service account JWT tokens scoped for `cloud-platform` are rejected by `generativelanguage.googleapis.com`
- n8n has no native Service Account node for this API
- Creating a new GCP project + enabling the API + getting an AI Studio key took 5 minutes

**Fix:** Created new GCP project, enabled Generative Language API, got API key from AI Studio. Added `x-goog-api-key` header to all 4 Gemini nodes (Start Upload, Complete Upload, Transcription, Screen Detection). Stored key in `Setup Config` as `GEMINI_API_KEY`.

**Future:** Migrate to Vertex AI for production (enterprise SLAs, service accounts, quota management). Endpoint and auth change but prompts remain identical.

### Issue 5: Gemini File in PROCESSING State
**Problem:** `Gemini Transcription` returned "The File is not in an ACTIVE state."
**Root cause:** Gemini processes uploaded files asynchronously. After `Complete Gemini Upload`, the file is in `PROCESSING` state for 10-60 seconds before becoming `ACTIVE`.
**Fix:** Added a polling loop: `Wait for File Processing` (10s Wait node) → `Check File Status` (GET `/v1beta/files/{name}`) → `File Active?` (IF node checking `state == ACTIVE`) → true branch → Gemini nodes; false branch → back to Wait.

### Issue 6: `Check File Status` 404 Error
**Problem:** URL resolved to `https://generativelanguage.googleapis.com/v1beta/` with nothing after.
**Root cause:** Expression was `$json.file.name` but the data flowing through from `Wait for File Processing` has the file name at the ROOT level (`$json.name`), not nested under `.file`.
**Fix:** Changed URL expression to `$json.name`.

### Issue 7: `file_uri` Expression Broken After Import
**Problem:** Gemini Transcription and Screen Detection couldn't find the file URI — "no connection back to node."
**Root cause:** When importing a workflow over an existing one in n8n, nodes get "1" appended to their names (e.g., `Complete Gemini Upload` → `Complete Gemini Upload1`). Expression `$('Complete Gemini Upload').first().json.file.uri` didn't match the renamed node.
**Fix:** Changed all `file_uri` references from `$('Complete Gemini Upload').first().json.file.uri` to `$json.uri`. The `Check File Status` response includes `uri` at the root level. This also makes it immune to node renaming.
**Rule for future:** Delete old workflow and re-import JSON fresh — never import over existing. Or use `$json` references where possible to avoid node-name coupling.

### Issue 8: `Filter New MP4 Files` Always Returns False
**Problem:** Even after deleting from `processed_sharepoint_files`, the IF node kept going to the false branch.
**Root cause:** n8n displays the LAST execution's cached output — `Get Processed Files` showed stale data with the file_id still present.
**Fix:** Verified table was actually empty with `SELECT COUNT(*) FROM processed_sharepoint_files`. Then ran full workflow fresh (not individual node) — fresh execution re-fetches from Supabase.

### Issue 9: Gemini Transcription Timeout
**Problem:** `timeout of 300000ms exceeded` on a 27-minute video.
**Root cause:** 5 minutes (300s) is not enough for Gemini to transcribe a 27-minute video.
**Fix:** Increased timeout to 900000ms (15 minutes) on both `Gemini Transcription` and `Gemini Screen Detection` nodes.

### Issue 10: `pipeline_status` Enum Validation Error
**Problem:** `Update Pipeline Run` failed with "invalid input value for enum pipeline_status: transcription_complete".
**Root cause:** `transcription_complete` is not a valid enum value in the database.
**Fix:** Ran `SELECT unnest(enum_range(NULL::pipeline_status))` to see valid values: `queued, transcribing, detecting_screenshare, extracting_frames, deduplicating, classifying_frames, generating_annotations, extracting_clips, generating_sections, completed, failed`. Changed to `extracting_frames` (correct next stage after Phase 2).

---

## Decisions Made

| Decision | Choice | Reason |
|----------|--------|--------|
| Single vs 4 workflows | Single workflow | Continuous data flow — no benefit to splitting |
| SharePoint auth | Existing "Saara - Sharepoint" oAuth2Api credential | TL had it set up, works with delegated permissions |
| Gemini auth | API key (not Vertex AI service account) | File API incompatible with Vertex AI scopes; API key simpler for now |
| Dedup lock timing | Lock file BEFORE Gemini | Prevents duplicate Azure uploads if Gemini fails mid-run |
| Azure Blob container | `infsop` (not `sop-media`) | Pre-existing container |
| Polling vs webhook | Polling loop (Wait → Check → IF) | Gemini has no webhook for file ready events |
| `file_uri` expression | `$json.uri` (not node name reference) | Immune to n8n's "1" suffix renaming on re-import |
| Post-Phase-2 pipeline status | `extracting_frames` | Signals Phase 3 is next; valid enum value |

---

## Test Result

Tested with a 5-minute MP4 uploaded to SharePoint `Infomate/SOP`:
- Full pipeline ran in ~4 minutes
- Transcript lines inserted with speaker names, timestamps, content
- Screen share periods detected with crop coordinates
- All Supabase tables updated correctly
- `pipeline_runs.status` = `extracting_frames` ✅

---

## Files Changed

| File | Change |
|------|--------|
| `sop-platform/n8n-workflows/2a_sharepoint_connection.json` | Main workflow — created and iteratively fixed throughout session |
| `sop-platform/docker-compose.yml` | cloudflared service: `network_mode: "host"` (Cloudflare Tunnel fix) |
| `sop-platform/.env` | Added `CLOUDFLARE_TUNNEL_TOKEN` |

---

## What's Next — Phase 3

**sop-extractor** frame extraction service. The `soptest.cloudnavision.com` endpoint is live and healthy.

Phase 3 n8n workflow will:
1. Poll `pipeline_runs` where `status = extracting_frames`
2. Call `soptest.cloudnavision.com` endpoints with `sop_id` + Azure blob video URL
3. Run FFmpeg frame extraction + PySceneDetect scene detection
4. Write frame metadata to Supabase
5. Update pipeline status to `deduplicating`
