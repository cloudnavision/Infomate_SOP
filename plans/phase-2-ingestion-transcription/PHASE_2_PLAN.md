# Phase 2: Ingestion + Transcription

**Objective:** Build the first stage of the n8n pipeline — watch a SharePoint folder for new KT recordings, download the MP4, upload to Azure Blob Storage, transcribe with Gemini 2.5 Flash, detect screen share regions, and write the transcript + SOP record to Supabase.

**Save to:** `plans/phase-2-ingestion-transcription/PHASE_2_PLAN.md`

**No Cloudflare needed** — Phase 2 only involves n8n talking to cloud services (SharePoint, Azure Blob, Gemini, Supabase). All accessible from AWS-hosted n8n directly.

---

## Sub-Parts

| Sub-Part | Description | Status |
|----------|-------------|--------|
| 2a | n8n → SharePoint connection (Graph API, OAuth, watch folder) | ⬜ Pending |
| 2b | n8n → Download MP4 → Upload to Azure Blob | ⬜ Pending |
| 2c | n8n → Gemini transcription + screen share detection | ⬜ Pending |
| 2d | n8n → Write transcript + SOP record to Supabase | ⬜ Pending |

---

## Architecture

**Phase 2 data flow:**
```
SharePoint (M365)
  → n8n watches folder via Graph API (poll every X minutes)
  → New MP4 detected → download via Graph API
  → Upload to Azure Blob: sop-media/{sop-id}/original.mp4
  → Create SOP record in Supabase (status: processing)
  → Upload to Gemini File API
  → Gemini transcribes (speaker ID, timestamps, screen changes)
  → Gemini detects screen share periods (crop coordinates)
  → Write transcript_lines to Supabase
  → Update SOP with participants, screen_share_periods
  → Pipeline status: "transcription_complete"
```

**Services used (all cloud, no local Docker):**

| Service | How n8n connects | Purpose |
|---------|-----------------|---------|
| SharePoint | Microsoft Graph API via HTTP Request | Watch folder, download MP4 |
| Azure Blob | REST API with SAS token | Store original MP4 |
| Gemini 2.5 Flash | REST API with API key | Transcription + screen detection |
| Supabase | PostgreSQL connection (direct) | Write SOP, transcript, pipeline status |

---

## Key Information

| Item | Value |
|------|-------|
| n8n instance | `https://awsn8n.cloudnavision.com/` |
| SharePoint site | `cloudnavision.sharepoint.com` |
| SharePoint path | Documents → Infomate → SOP |
| SharePoint tenant | CloudNavision (own tenant, migrate to client later) |
| Azure Blob account | `cnavinfsop` |
| Azure Blob container | `sop-media` (to be created) |
| Gemini model | `gemini-2.5-flash` |
| Supabase | Already connected (transaction pooler, port 6543) |

---

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| SharePoint connection | Graph API via n8n HTTP Request node | Full control, standard approach |
| Graph API auth | Azure AD app registration (CloudNavision tenant) with Application permissions | Service-to-service, no user login required |
| Polling vs webhook | Polling (Graph API delta or scheduled list) | Simpler to set up, reliable |
| n8n workflow output | Claude Code generates workflow JSON for import | Consistent with build approach |
| Gemini prompts | From workflow_1_extraction.md (Nodes 4a, 4b) | Already specified and tested |

---

## Sub-Part Plans

- [2a: SharePoint Connection](2a_sharepoint_connection.md)
- [2b: Azure Blob Upload](2b_azure_blob_upload.md)
- [2c: Gemini Transcription](2c_gemini_transcription.md)
- [2d: Supabase Write](2d_supabase_write.md)

---

## Build Order

Strict sequence — each sub-part depends on the previous:

1. **2a** — SharePoint Graph API connection + folder watching
2. **2b** — Download MP4 + upload to Azure Blob + create SOP record
3. **2c** — Gemini transcription + screen share detection
4. **2d** — Write transcript to Supabase + update SOP record

---

## Checklist

```
2a: SharePoint Connection
- [ ] Azure AD app registration for Graph API (Application permissions)
- [ ] Graph API permissions: Sites.Read.All, Files.Read.All
- [ ] Admin consent granted
- [ ] n8n OAuth2 credential configured for Graph API
- [ ] n8n workflow: HTTP Request to list files in SharePoint folder
- [ ] n8n workflow: scheduled trigger (poll every X minutes)
- [ ] Test: n8n can list files in the SOP folder

2b: Azure Blob Upload
- [ ] Azure Blob container 'sop-media' created
- [ ] SAS token with write permissions confirmed
- [ ] n8n workflow: download MP4 from SharePoint via Graph API
- [ ] n8n workflow: upload MP4 to Azure Blob (sop-media/{sop-id}/original.mp4)
- [ ] n8n workflow: create SOP record in Supabase (status: processing)
- [ ] n8n workflow: create pipeline_runs record
- [ ] Test: MP4 appears in Azure Blob, SOP record in Supabase

2c: Gemini Transcription
- [ ] n8n workflow: upload MP4 to Gemini File API
- [ ] n8n workflow: send transcription prompt (speaker ID, timestamps)
- [ ] n8n workflow: send screen share detection prompt (crop coordinates)
- [ ] n8n workflow: parse Gemini JSON responses
- [ ] Test: transcript JSON has speakers, timestamps, text, screen_changes

2d: Supabase Write
- [ ] n8n workflow: bulk insert transcript_lines to Supabase
- [ ] n8n workflow: update SOP with video_url, participants, screen_share_periods
- [ ] n8n workflow: update pipeline_runs status to 'transcription_complete'
- [ ] n8n workflow: track Gemini API cost in pipeline_runs
- [ ] Test: full transcript visible in Supabase, SOP record updated
```

---

## Test Checkpoint

When Phase 2 is complete, verify in Supabase:

1. `sops` table has a new record with status `processing`, `video_url` pointing to Azure Blob
2. `transcript_lines` table has real transcript data with correct speakers and timestamps
3. `pipeline_runs` table tracks the pipeline progress and Gemini API cost
4. The MP4 file exists in Azure Blob at `sop-media/{sop-id}/original.mp4`

---

## Status: ⬜ Pending
