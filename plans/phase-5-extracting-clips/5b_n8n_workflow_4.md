# 5b — n8n Workflow 4: Extracting Clips

## Overview

**File:** `sop-platform/n8n-workflows/Saara - SOP_Workflow 4 - Extract Clips.json`

**Trigger:** Every 2 minutes — polls `pipeline_runs` WHERE `status = generating_annotations`

**Status transition:** `generating_annotations` → `generating_sections`

---

## Node Chain (14 nodes)

| # | Node | Type | Purpose |
|---|------|------|---------|
| 1 | Every 2 Minutes | Schedule Trigger | Polls for work |
| 2 | Setup Config | Set | All credentials |
| 3 | Poll Pending Clips | HTTP GET | pipeline_runs WHERE status=generating_annotations |
| 4 | Any Pending? | IF | Stop if nothing to do |
| 5 | No Work — Stop | NoOp | End branch |
| 6 | Extract Run Info | Code | Carries pipeline_run_id + sop_id + video_blob_url forward |
| 7 | Get SOP Steps | HTTP GET | sop_steps WHERE sop_id = X, ordered by sequence |
| 8 | Build Clip Request | Code | Compute start/end per step (60s cap), build /clip request body |
| 9 | Call Clip Extractor | HTTP POST | POST soptest.cloudnavision.com/api/clip |
| 10 | Process Clip Response | Code | Map clip results → step_clips insert rows |
| 11 | Split Clips | SplitInBatches(1) | Loop one clip at a time for insert |
| 12 | Insert Step Clip | HTTP POST | Insert one step_clips row per loop |
| 13 | Update Pipeline Run | HTTP PATCH | status = generating_sections (after all inserts) |

---

## Node Details

### Node 2 — Setup Config

Assignments:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AZURE_BLOB_SAS_TOKEN`
- `AZURE_ACCOUNT` = `cnavinfsop`
- `AZURE_CONTAINER` = `infsop`
- `EXTRACTOR_INTERNAL_KEY` (x-internal-key header for sop-api)

---

### Node 3 — Poll Pending Clips

```
GET {SUPABASE_URL}/rest/v1/pipeline_runs
  ?status=eq.generating_annotations
  &select=id,sop_id,video_blob_url
  &limit=1
```

---

### Node 6 — Extract Run Info (Code)

```javascript
const run = $input.first().json;
const config = $('Setup Config').first().json;

return [{
  json: {
    pipeline_run_id: run.id,
    sop_id: run.sop_id,
    video_blob_url: run.video_blob_url,
    SUPABASE_URL: config.SUPABASE_URL,
    SUPABASE_ANON_KEY: config.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: config.SUPABASE_SERVICE_ROLE_KEY,
    AZURE_BLOB_SAS_TOKEN: config.AZURE_BLOB_SAS_TOKEN,
    AZURE_ACCOUNT: config.AZURE_ACCOUNT,
    AZURE_CONTAINER: config.AZURE_CONTAINER,
    EXTRACTOR_INTERNAL_KEY: config.EXTRACTOR_INTERNAL_KEY,
  }
}];
```

---

### Node 7 — Get SOP Steps

```
GET {SUPABASE_URL}/rest/v1/sop_steps
  ?sop_id=eq.{sop_id}
  &select=id,sequence,timestamp_start
  &order=sequence.asc
```

Returns all steps ordered by sequence — needed to compute each clip's end time.

---

### Node 8 — Build Clip Request (Code)

```javascript
const steps = $input.all().map(i => i.json);
const runInfo = $('Extract Run Info').first().json;
const config = $('Setup Config').first().json;

const MAX_CLIP_DURATION = 60; // seconds cap

const clips = steps.map((step, idx) => {
  const start_sec = step.timestamp_start;
  const nextStep = steps[idx + 1];
  const rawEnd = nextStep ? nextStep.timestamp_start : start_sec + MAX_CLIP_DURATION;
  const end_sec = Math.min(rawEnd, start_sec + MAX_CLIP_DURATION);

  return {
    step_id: step.id,
    sequence: step.sequence,
    start_sec: start_sec,
    end_sec: end_sec,
  };
});

return [{
  json: {
    clipRequestBody: {
      sop_id: runInfo.sop_id,
      video_url: runInfo.video_blob_url + '?' + config.AZURE_BLOB_SAS_TOKEN,
      clips: clips,
      azure_sas_token: config.AZURE_BLOB_SAS_TOKEN,
      azure_account: config.AZURE_ACCOUNT,
      azure_container: config.AZURE_CONTAINER,
    }
  }
}];
```

---

### Node 9 — Call Clip Extractor

```
POST https://soptest.cloudnavision.com/api/clip
Headers:
  Content-Type: application/json
  x-internal-key: {{ $('Setup Config').first().json.EXTRACTOR_INTERNAL_KEY }}
Body (specifyBody: json):
  {{ JSON.stringify($json.clipRequestBody) }}
Timeout: 600000ms (10 min — video download + FFmpeg)
```

> **Note:** Requires adding `POST /api/clip` proxy route to `sop-api` (mirrors the existing `/api/extract` proxy pattern).

---

### Node 10 — Process Clip Response (Code)

```javascript
const response = $input.first().json;

if (!response.clips || !Array.isArray(response.clips)) {
  throw new Error('Invalid clip response: ' + JSON.stringify(response));
}

return response.clips.map(clip => ({
  json: {
    step_id: clip.step_id,
    clip_url: clip.clip_url,
    duration_sec: clip.duration_sec,
    file_size_bytes: clip.file_size_bytes,
  }
}));
```

---

### Node 11 — Split Clips

`SplitInBatches` — batchSize: 1

- `main[0]` → done → Update Pipeline Run
- `main[1]` → loop → Insert Step Clip

---

### Node 12 — Insert Step Clip

```
POST {SUPABASE_URL}/rest/v1/step_clips
Headers:
  apikey: {SUPABASE_ANON_KEY}
  Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}
  Content-Type: application/json
  Prefer: return=minimal
Body:
  {{ JSON.stringify({
    step_id: $json.step_id,
    clip_url: $json.clip_url,
    duration_sec: $json.duration_sec,
    file_size_bytes: $json.file_size_bytes
  }) }}
```

---

### Node 13 — Update Pipeline Run

```
PATCH {SUPABASE_URL}/rest/v1/pipeline_runs
  ?id=eq.{pipeline_run_id}
Body:
  {"status": "generating_sections", "current_stage": "clips_complete"}
```

---

## sop-api Proxy Route to Add

In `sop-platform/api/app/main.py`, add alongside the existing `/api/extract` proxy:

```python
@app.post("/api/clip", tags=["pipeline"], dependencies=[Depends(require_internal_key)])
async def proxy_clip(body: dict) -> Any:
    """Proxy POST /api/clip → sop-extractor:8001/clip"""
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {"status": "processing", "result": None, "error": None}
    asyncio.create_task(_run_clip_job_proxy(job_id, body))
    return {"job_id": job_id, "status": "processing"}

async def _run_clip_job_proxy(job_id: str, body: dict) -> None:
    try:
        async with httpx.AsyncClient(timeout=600.0) as client:
            response = await client.post("http://sop-extractor:8001/clip", json=body)
            response.raise_for_status()
            _jobs[job_id] = {"status": "completed", "result": response.json(), "error": None}
    except Exception as exc:
        _jobs[job_id] = {"status": "failed", "result": None, "error": str(exc)}
```

> Or simplify: make it synchronous (blocking) like the original — n8n polls `/api/clip/status/{job_id}` until complete.

---

## Build Order

1. `5a` — add `POST /clip` to sop-extractor, test locally with `curl`
2. Add `POST /api/clip` proxy to sop-api, rebuild container
3. `5b` — build and import Workflow 4 JSON into n8n
4. Reset test SOP to `generating_annotations` and execute workflow
5. Verify `step_clips` rows + pipeline status in Supabase
