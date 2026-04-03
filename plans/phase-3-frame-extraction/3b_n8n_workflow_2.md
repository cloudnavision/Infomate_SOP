# Phase 3b: n8n Workflow 2 — Frame Extraction

### Objective
Build a new n8n workflow that polls Supabase every 2 minutes for SOPs with `pipeline_runs.status = extracting_frames`, calls the `sop-extractor /extract` endpoint, bulk-inserts the returned frames as `sop_steps` rows in Supabase, and advances the pipeline status to `classifying_frames`.

### Prerequisites
- Phase 3a complete — `soptest.cloudnavision.com/extract` endpoint live and tested
- Workflow 1 has processed at least one SOP (so there's a record with `status = extracting_frames`)
- Same Supabase + Azure credentials as Workflow 1

---

### Workflow File

`sop-platform/n8n-workflows/Saara - SOP_Workflow 2 - Frame Extraction.json`

Import this into n8n. **Delete any previous version first** (n8n appends "1" to node names on re-import over existing — causes expression breakage).

---

### Node Chain (12 nodes)

```
Every 2 Minutes (Schedule)
→ Setup Config (Set — all credentials in one place)
→ Poll Pending Extractions (GET pipeline_runs WHERE status=extracting_frames, limit=1)
→ Any Pending? (IF — items count > 0)
  → FALSE → No Work — Stop (NoOp)
  → TRUE  → Extract Run Info (Code — unpack pipeline_run_id + sop_id)
           → Get SOP Record (GET sops WHERE id=sop_id — video_url, screen_share_periods)
           → Build Extract Request (Code — construct /extract body, append SAS to video_url)
           → Call Frame Extractor (POST soptest.cloudnavision.com/extract, 600s timeout)
           → Build Step Inserts (Code — map frames → sop_steps rows)
           → Insert SOP Steps (POST Supabase sop_steps, bulk array)
           → Update Pipeline Run (PATCH pipeline_runs — status=classifying_frames, stage_results)
```

---

### Setup Config Node — Values to Fill In

After importing, open the **Setup Config** node and update these values:

| Field | Value | Where to find |
|-------|-------|--------------|
| `SUPABASE_URL` | `https://your-project.supabase.co` | Supabase dashboard → Settings → API |
| `SUPABASE_ANON_KEY` | anon/public key | Supabase dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | Supabase dashboard → Settings → API |
| `AZURE_BLOB_SAS_TOKEN` | SAS token string (no `?` prefix) | Same as Workflow 1 Setup Config |
| `AZURE_BLOB_ACCOUNT` | `cnavinfsop` | Same as Workflow 1 |
| `AZURE_BLOB_CONTAINER` | `infsop` | Same as Workflow 1 |
| `EXTRACTOR_URL` | `https://soptest.cloudnavision.com` | Already configured — do not change |

**Copy these directly from Workflow 1's Setup Config** — they are identical.

---

### Key Node Details

**Poll Pending Extractions**
```
GET {SUPABASE_URL}/rest/v1/pipeline_runs
  ?status=eq.extracting_frames
  &select=id,sop_id
  &limit=1
Headers:
  apikey: {SUPABASE_ANON_KEY}
  Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}
```

Processes one SOP per trigger cycle. If multiple SOPs are queued, they'll be processed on successive 2-minute cycles.

**Extract Run Info (Code node)**
```javascript
const run = $input.all()[0].json[0];
return [{
  json: {
    pipeline_run_id: run.id,
    sop_id: run.sop_id,
    // + all config values from Setup Config
  }
}];
```

**Build Extract Request (Code node)**
```javascript
// video_url in Supabase has no SAS — append it for download
const videoUrlWithSas = sop.video_url + '?' + prevJson.AZURE_BLOB_SAS_TOKEN;

// screen_share_periods is JSONB — parse if needed
let periods = sop.screen_share_periods;
if (typeof periods === 'string') periods = JSON.parse(periods);
```

**Call Frame Extractor**
- Timeout: **600000ms (10 minutes)**
- This is the longest-running node — do not reduce the timeout

**Build Step Inserts (Code node)**
```javascript
const frames = extractorResponse.frames || [];
// Each frame becomes one sop_steps row:
const steps = frames.map((frame, idx) => ({
  sop_id,
  sequence: idx + 1,
  title: `Step ${idx + 1}`,         // Overwritten by AI in Phase 5
  timestamp_start: frame.timestamp_sec,
  screenshot_url: frame.azure_url,
  screenshot_width: frame.width,
  screenshot_height: frame.height,
  scene_score: frame.scene_score,
  frame_classification: frame.classification.toLowerCase()  // 'useful'
}));
```

**Insert SOP Steps**
```
POST {SUPABASE_URL}/rest/v1/sop_steps
Headers:
  Prefer: return=minimal   ← Supabase returns empty 201 — this is correct
Body: JSON array of all step rows (bulk insert in one request)
```

**Update Pipeline Run**
```
PATCH {SUPABASE_URL}/rest/v1/pipeline_runs?id=eq.{pipeline_run_id}
Body:
{
  "status": "classifying_frames",
  "current_stage": "frame_extraction_complete",
  "stage_results": {
    "frame_extraction": {
      "raw_scenes": 38,
      "after_dedup": 14,
      "periods_processed": 1
    }
  }
}
```

---

### Import Steps

1. Open n8n at `https://awsn8n.cloudnavision.com/`
2. Check if any old "Frame Extraction" workflow exists → delete it first
3. Click **+ New workflow** → **...** menu → **Import from file**
4. Select `Saara - SOP_Workflow 2 - Frame Extraction.json`
5. Open **Setup Config** node → fill in all 7 credentials (see table above)
6. **Activate** the workflow (toggle in top-right)

---

### Testing

**Manual trigger test:**

1. In Supabase SQL Editor, find a completed pipeline run and reset it:
   ```sql
   -- Find a completed SOP
   SELECT id, sop_id FROM pipeline_runs WHERE status = 'extracting_frames' LIMIT 5;

   -- Or reset a completed one for testing:
   UPDATE pipeline_runs
   SET status = 'extracting_frames', current_stage = 'transcription_complete'
   WHERE sop_id = 'your-sop-uuid';
   ```

2. In n8n, open Workflow 2 → click **Test workflow** (or wait up to 2 minutes for schedule)

3. Watch the execution — all nodes should go green

4. Verify in Supabase:
   ```sql
   -- Check steps were created
   SELECT id, sequence, title, timestamp_start, screenshot_url, frame_classification
   FROM sop_steps
   WHERE sop_id = 'your-sop-uuid'
   ORDER BY sequence;

   -- Check pipeline status advanced
   SELECT status, current_stage, stage_results
   FROM pipeline_runs
   WHERE sop_id = 'your-sop-uuid';
   ```

5. Check Azure Blob: navigate to `infsop/{sop_id}/frames/` — PNG files should be visible

---

### Common Issues & Fixes

| Issue | Likely Cause | Fix |
|-------|-------------|-----|
| `Any Pending?` always false | No `extracting_frames` records | Manually set a pipeline_run status (see test SQL above) |
| `Poll Pending Extractions` returns empty | Using anon key instead of service_role | Ensure `Authorization: Bearer {SERVICE_ROLE_KEY}` header is set |
| `Call Frame Extractor` times out | Video is very long or extractor crashed | Check `docker compose logs sop-extractor`, increase timeout to 900s if needed |
| `Insert SOP Steps` returns 409 Conflict | Steps already exist for this SOP | Delete existing steps: `DELETE FROM sop_steps WHERE sop_id = '...'`, re-test |
| `Build Step Inserts` throws "No frames" | Extractor returned empty frames array | Check extractor logs — likely FFmpeg crop issue or wrong screen_share_periods |
| Node name has "1" suffix (e.g. `Setup Config1`) | Imported over existing workflow | Delete old workflow, re-import fresh |
| `screen_share_periods` is null in SOP record | Phase 2 screen detection didn't populate it | Check `sops.screen_share_periods` in Supabase — may need to re-run Phase 2 workflow |

---

### Validation Checklist

```
Setup:
- [ ] Workflow 2 JSON imported to n8n (fresh, no "1" suffix on nodes)
- [ ] Setup Config node — all 7 values filled in
- [ ] Workflow activated

Test:
- [ ] pipeline_run set to status=extracting_frames for a test SOP
- [ ] Workflow triggered (manual or schedule)
- [ ] All 12 nodes green in execution view
- [ ] sop_steps rows in Supabase (sequence 1, 2, 3...) with screenshot_url pointing to Azure Blob
- [ ] screenshot_url opens to a valid PNG in Azure Blob
- [ ] pipeline_runs.status = classifying_frames
- [ ] pipeline_runs.stage_results.frame_extraction has raw_scenes, after_dedup, periods_processed
```

### Status: ⬜ Pending
