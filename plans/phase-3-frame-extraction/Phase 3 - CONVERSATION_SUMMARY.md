# Chat Summary — SOP Automation Platform Build
## Phase 3: Frame Extraction
## Date: 2026-03-26

---

## Project Context

**Client:** Starboard Hotels
**Stack:** React + FastAPI + Supabase + n8n + Gemini 2.5 Flash
**Goal:** KT meeting recording → structured SOP in ~4 minutes
**Working directory:** `d:/CloudNavision/1. Projects/SOP/SOP Automation System/sop-platform/`

**Phases complete before Phase 3:**
- Phase 1 ✅ — Docker infra, PostgreSQL schema, FastAPI CRUD, React scaffold
- Phase 1.5 ✅ — Supabase Auth + Azure AD SSO, role-based access
- Phase 2 ✅ — n8n Workflow 1: SharePoint → Azure Blob → Gemini transcription → Supabase

**Phase 3 objective:** Extract scene-change frames from the screen-share portion of KT videos, upload PNGs to Azure Blob, insert `sop_steps` rows into Supabase, advance pipeline status to `classifying_frames`.

---

## Infrastructure (already running before Phase 3)

| Service | URL / Location | Purpose |
|---------|---------------|---------|
| sop-extractor container | `localhost:8001` | FastAPI + FFmpeg + PySceneDetect |
| Cloudflare Tunnel | `soptest.cloudnavision.com → localhost:8001` | Exposes extractor publicly |
| n8n | `https://awsn8n.cloudnavision.com/` | Workflow orchestration |
| Supabase | `https://hzluuqhbkiblmojxgbab.supabase.co` | Database |
| Azure Blob | `cnavinfsop` / container `infsop` | Video + frame storage |

---

## What Was Built

### 3a: sop-extractor `/extract` endpoint

**`sop-platform/extractor/app/scene_detector.py`** — full implementation (was a placeholder)

4-stage pipeline per screen-share period:
1. **FFmpeg crop + trim** — cuts video to screen-share bounding box, trims to start/end time
2. **PySceneDetect AdaptiveDetector** — finds scene-change boundaries (threshold 3.0, min 2s)
3. **Frame capture at T+1.5s offset** — captures PNG per scene, skips half-rendered transitions
4. **imagehash phash dedup** — Hamming distance ≤ 8 = DUPLICATE, else USEFUL

**`sop-platform/extractor/app/main.py`** — added `POST /extract` endpoint

- Pydantic models: `CropRegion`, `ScreenSharePeriod`, `ExtractRequest`, `FrameResult`, `ExtractionStats`, `ExtractResponse`
- Uses `asyncio.to_thread()` to run blocking pipeline in thread pool
- Downloads video from Azure Blob via `requests.get()` streaming
- Uploads USEFUL frame PNGs to Azure Blob via `requests.put()` with SAS token
- Returns `azure_url` WITHOUT SAS token (safe to store in Supabase)
- Blob path pattern: `{sop_id}/frames/frame_001.png`
- Temp directory auto-cleans via `tempfile.TemporaryDirectory` context manager

**`sop-platform/extractor/requirements.txt`** — added `requests==2.32.3`

**Rebuild command:**
```bash
sudo docker compose build sop-extractor && sudo docker compose up -d sop-extractor
```

### 3b: n8n Workflow 2

**`sop-platform/n8n-workflows/Saara - SOP_Workflow 2 - Frame Extraction.json`**

12-node workflow:
```
Every 2 Minutes (Schedule)
→ Setup Config (Set — all credentials)
→ Poll Pending Extractions (GET pipeline_runs WHERE status=extracting_frames, limit=1)
→ Any Pending? (IF — $json.id is not empty)
  → FALSE → No Work — Stop (NoOp)
  → TRUE  → Extract Run Info (Code — unpack pipeline_run_id + sop_id)
           → Get SOP Record (GET sops — video_url, screen_share_periods)
           → Build Extract Request (Code — normalise field names, append SAS to video_url)
           → Call Frame Extractor (POST soptest.cloudnavision.com/extract, 600s timeout)
           → Build Step Inserts (Code — map frames → sop_steps rows)
           → Insert SOP Steps (POST Supabase sop_steps, bulk array)
           → Update Pipeline Run (PATCH — status=classifying_frames, stage_results)
```

**Setup Config credentials (already baked into JSON):**
```
SUPABASE_URL: https://hzluuqhbkiblmojxgbab.supabase.co
SUPABASE_ANON_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...JMhGY
SUPABASE_SERVICE_ROLE_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...5x5o
AZURE_BLOB_SAS_TOKEN: sv=2024-11-04&ss=bfqt&srt=co&sp=rwdlacuptfx...%3D
AZURE_BLOB_ACCOUNT: cnavinfsop
AZURE_BLOB_CONTAINER: infsop
EXTRACTOR_URL: https://soptest.cloudnavision.com
```

---

## Issues Faced & Fixes

### Issue 1: `Any Pending?` IF node always going to False Branch
**Root cause:** n8n HTTP Request auto-splits Supabase array — `$json` = `{id, sop_id}` plain object. `$json.length` on an object = `undefined` → not > 0 → False Branch.
**Fix:** Changed condition from `$json.length > 0` to `$json.id is not empty` (string notEmpty operator).

### Issue 2: `Build Extract Request` — `Cannot read properties of undefined (reading 'video_url')`
**Root cause:** Same auto-split issue. `$input.first().json[0]` = `undefined` because n8n already unwrapped the array.
**Fix:** Changed `const sop = $input.first().json[0]` → `const sop = $input.first().json`

### Issue 3: `screen_share_periods` field name mismatch
**Root cause:** Gemini (Phase 2) stored periods with `start_sec`/`end_sec` fields. The extractor expects `start_time`/`end_time`.
**Fix:** Added normalisation in `Build Extract Request` code node:
```javascript
periods = periods.map(p => ({
  start_time: p.start_time !== undefined ? p.start_time : p.start_sec,
  end_time: p.end_time !== undefined ? p.end_time : p.end_sec,
  crop: p.crop
}));
```

### Issue 4: `Call Frame Extractor` body not sending — "Using Fields Below" empty
**Root cause:** n8n imported `"contentType": "json"` + `"body"` incorrectly as UI "Using Fields Below" mode with empty fields.
**Fix:** Changed to `"specifyBody": "json"` + `"jsonBody"` expression in the JSON — renders correctly as a JSON body field in n8n UI.

### Issue 5: Cloudflare Bot Fight Mode blocking n8n requests (403)
**Root cause:** Cloudflare's Bot Fight Mode intercepts n8n's automated HTTP requests. Returns HTML challenge page (requires JavaScript execution) instead of forwarding to sop-extractor. n8n cannot execute JavaScript → always 403.
**Status: PENDING — needs TL to fix**

**Fix Option A (simplest):** Cloudflare Dashboard → `cloudnavision.com` → Security → Bots → Bot Fight Mode → OFF

**Fix Option B (keep bot protection):**
1. Cloudflare Dashboard → `cloudnavision.com` → Security → WAF → Custom Rules → Create rule
   - Field: `Request Header` `x-internal-key` equals `sop-pipeline-2024`
   - Action: Skip → Managed Challenges
2. Workflow already has header `x-internal-key: sop-pipeline-2024` in `Call Frame Extractor` node

**Evidence:**
```
Error: 403
cZone: soptest.cloudnavision.com
cType: managed  ← Cloudflare bot challenge, not server error
```

---

## Key Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Cloudflare URL | `soptest.cloudnavision.com` | Already configured in Phase 2, verified working |
| Separate workflow | New Workflow 2 (not appended to Workflow 1) | Clean separation of concerns |
| Azure upload from extractor | Pass `azure_sas_token` in request body | Keeps credentials in n8n, extractor stays stateless |
| Multiple screen_share_periods | Iterate all periods | Gemini may detect 2-3 separate screen-share windows |
| `video_url` + SAS | Append SAS in n8n before calling extractor | `sops.video_url` in Supabase stores base URL without SAS |
| Frame classification | Returns `USEFUL`/`DUPLICATE` | Phase 4 Gemini does deeper classification |
| `asyncio.to_thread()` | Run blocking pipeline in thread pool | Keeps FastAPI event loop responsive during 5-10 min processing |

---

## Test Verification (pending Cloudflare fix)

Once Cloudflare is resolved, verify with:

```sql
-- Check steps were created
SELECT sequence, title, timestamp_start, screenshot_url, frame_classification
FROM sop_steps
WHERE sop_id = 'your-sop-uuid'
ORDER BY sequence;

-- Check pipeline advanced
SELECT status, stage_results
FROM pipeline_runs
WHERE sop_id = 'your-sop-uuid';
-- Expected: status = 'classifying_frames'
```

Also check Azure Blob: `infsop/{sop_id}/frames/` should contain `frame_001.png`, `frame_002.png`...

**To reset a pipeline run for testing:**
```sql
UPDATE pipeline_runs
SET status = 'extracting_frames'
WHERE sop_id = 'your-sop-uuid';
```

---

## Files Created / Modified

| File | Change |
|------|--------|
| `extractor/app/scene_detector.py` | Full implementation — FFmpeg crop, PySceneDetect, T+1.5s offset, phash dedup |
| `extractor/app/main.py` | Added `POST /extract` endpoint, Pydantic models, Azure upload helper |
| `extractor/requirements.txt` | Added `requests==2.32.3` |
| `n8n-workflows/Saara - SOP_Workflow 2 - Frame Extraction.json` | New 12-node workflow with real credentials |
| `plans/phase-3-frame-extraction/PHASE_3_PLAN.md` | Phase overview, architecture, decisions |
| `plans/phase-3-frame-extraction/3a_sop_extractor_endpoint.md` | Detailed 3a guide |
| `plans/phase-3-frame-extraction/3b_n8n_workflow_2.md` | Detailed 3b guide |
| `CHECKLIST.md` | Phase 3 section updated |

---

## Current Status

| Step | Status |
|------|--------|
| sop-extractor `/extract` endpoint — code written | ✅ Done |
| Container rebuilt + health check passing | ✅ Done |
| n8n Workflow 2 — imported + credentials set | ✅ Done |
| `Any Pending?` IF node fix | ✅ Done |
| `Build Extract Request` body fix | ✅ Done |
| Cloudflare Bot Fight Mode blocking n8n | ⚠️ Pending TL action |
| End-to-end test — sop_steps in Supabase | ⬜ Blocked by Cloudflare |

---

## What's Next — Phase 4

Once Phase 3 end-to-end test passes (`sop_steps` in Supabase + PNGs in Azure Blob):

**Phase 4: Gemini Frame Classification**
- New n8n Workflow 3
- Polls `sop_steps` where `frame_classification = 'useful'` and `gemini_description IS NULL`
- Sends each `screenshot_url` image to Gemini
- Gets back: `gemini_description` (what's on screen) + UI element list (label, type, region_hint)
- Updates `sop_steps.gemini_description`
- Inserts `step_callouts` rows (one per UI element identified)
- Updates `pipeline_runs.status` → `generating_annotations`
