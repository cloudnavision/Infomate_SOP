# 3b — n8n Workflow 2: Frame Extraction Nodes

## Context

Frame extraction nodes are appended to the existing **n8n Workflow 2** (the Phase 2 ingestion workflow). The workflow currently ends after writing transcript lines to the database and setting `pipeline_status = extracting_frames`. Phase 3 picks up from that point.

**Prerequisite:** TL must fix Cloudflare Bot Fight Mode before this sub-task can be tested end-to-end. See `PHASE_3_ISSUES.md`.

---

## Node Chain Overview

```
[Existing: Write Transcript Lines to DB]
          ↓
[Existing: Update Status = extracting_frames]
          ↓
[Node 1: Load Pipeline Run Data]          ← Postgres SELECT
          ↓
[Node 2: Call Frame Extractor]            ← HTTP POST (BLOCKED by Bot Fight Mode)
          ↓
[Node 3: Process Frame Response]          ← Code node
          ↓
[Node 4: Insert SOP Steps]                ← Postgres bulk insert
          ↓
[Node 5: Update Pipeline Status]          ← Postgres UPDATE → classifying_frames
```

---

## Node 1: Load Pipeline Run Data

**Node type:** Postgres

**Purpose:** Load the `pipeline_runs` record for this job to get `video_blob_url`, `screen_share_periods`, and `sop_id`.

**Query:**
```sql
SELECT
  pr.id AS pipeline_run_id,
  pr.sop_id,
  pr.video_blob_url,
  pr.screen_share_periods,
  s.title AS sop_title
FROM pipeline_runs pr
JOIN sops s ON s.id = pr.sop_id
WHERE pr.id = '{{ $json.pipeline_run_id }}'
LIMIT 1;
```

**Output:** Single row with `sop_id`, `video_blob_url`, `screen_share_periods` (JSONB array).

---

## Node 2: Call Frame Extractor

**Node type:** HTTP Request

**Name:** `Call Frame Extractor`

**Method:** POST

**URL:**
```
https://soptest.cloudnavision.com/api/extract
```

> **BLOCKED:** This URL is currently blocked by Cloudflare Bot Fight Mode. When TL adds the WAF Skip Rule, this node will work as-is.

**Headers:**

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |
| `x-internal-key` | `sop-pipeline-2024` |

**Body (JSON — Expression mode):**

```json
{
  "sop_id": "={{ $json.sop_id }}",
  "video_url": "={{ $json.video_blob_url }}",
  "screen_share_periods": "={{ $json.screen_share_periods }}",
  "pyscenedetect_threshold": 3.0,
  "min_scene_len_sec": 2,
  "dedup_hash_threshold": 8,
  "frame_offset_sec": 1.5
}
```

**Timeout:** `600000` ms (10 minutes — required for FFmpeg processing of long videos)

**Options:**
- `fullResponse: false` (we only need the response body, not headers)
- On error: `Continue` + store error → check in next node

**Expected response:**
```json
{
  "frames": [...],
  "stats": { "total_detected": 38, "after_dedup": 14, "after_classification": 11, "useful_count": 11 }
}
```

---

## Node 3: Process Frame Response

**Node type:** Code (JavaScript)

**Name:** `Process Frame Response`

**Purpose:** Parse the extractor response, validate it, and build the array of `sop_steps` rows to insert.

```javascript
const response = $input.first().json;

// Validate response
if (!response.frames || !Array.isArray(response.frames)) {
  throw new Error('Invalid extractor response: missing frames array');
}

const sopId = $('Load Pipeline Run Data').first().json.sop_id;
const frames = response.frames;

// Build sop_steps insert rows
const steps = frames.map((frame, index) => ({
  sop_id: sopId,
  sequence_order: index + 1,
  timestamp_start: frame.timestamp_sec,
  timestamp_end: null, // will be computed in Phase 5 when clips are extracted
  screenshot_url: frame.azure_url,
  frame_id: frame.frame_id,
  gemini_description: frame.description,
  scene_score: frame.scene_score,
  frame_width: frame.width,
  frame_height: frame.height,
  review_status: 'draft',
  title: `Step ${index + 1}`, // placeholder — replaced in Phase 4 annotation
  created_at: new Date().toISOString()
}));

// Also pass stats for logging
return steps.map(step => ({
  json: {
    ...step,
    _stats: response.stats
  }
}));
```

**Output:** One item per useful frame, each containing all fields needed for `sop_steps` insert.

---

## Node 4: Insert SOP Steps

**Node type:** Postgres

**Name:** `Insert SOP Steps`

**Mode:** Execute Query (run once per input item — i.e., once per frame)

**Query:**
```sql
INSERT INTO sop_steps (
  sop_id,
  sequence_order,
  timestamp_start,
  timestamp_end,
  screenshot_url,
  frame_id,
  gemini_description,
  scene_score,
  frame_width,
  frame_height,
  review_status,
  title,
  created_at
) VALUES (
  '{{ $json.sop_id }}',
  {{ $json.sequence_order }},
  {{ $json.timestamp_start }},
  NULL,
  '{{ $json.screenshot_url }}',
  '{{ $json.frame_id }}',
  '{{ $json.gemini_description }}',
  {{ $json.scene_score }},
  {{ $json.frame_width }},
  {{ $json.frame_height }},
  'draft',
  '{{ $json.title }}',
  NOW()
)
ON CONFLICT (sop_id, sequence_order) DO UPDATE SET
  screenshot_url = EXCLUDED.screenshot_url,
  timestamp_start = EXCLUDED.timestamp_start,
  gemini_description = EXCLUDED.gemini_description,
  updated_at = NOW()
RETURNING id, sequence_order;
```

**Note:** The `ON CONFLICT` clause allows safe re-runs of the workflow without creating duplicate steps.

---

## Node 5: Update Pipeline Status

**Node type:** Postgres

**Name:** `Update Pipeline Status → classifying_frames`

**Mode:** Execute Query (run once after all steps inserted — use `splitInBatches` merge or aggregate node before this)

```sql
UPDATE pipeline_runs
SET
  pipeline_status = 'classifying_frames',
  frames_extracted = (
    SELECT COUNT(*) FROM sop_steps WHERE sop_id = '{{ $json.sop_id }}'
  ),
  updated_at = NOW()
WHERE sop_id = '{{ $json.sop_id }}'
  AND pipeline_status = 'extracting_frames';
```

**Note:** The `WHERE pipeline_status = 'extracting_frames'` guard prevents accidental status regression if the node runs multiple times.

---

## Error Handling

### Extractor timeout or 5xx error

Add an **IF** node after "Call Frame Extractor":
- Condition: `{{ $json.statusCode }}` is 200
- True branch: → Process Frame Response
- False branch: → Set Status = failed

```sql
-- False branch: Set Status = failed
UPDATE pipeline_runs
SET pipeline_status = 'failed',
    error_message = 'Frame extraction failed: {{ $json.statusCode }} {{ $json.message }}',
    updated_at = NOW()
WHERE id = '{{ $('Load Pipeline Run Data').first().json.pipeline_run_id }}';
```

### Bot Fight Mode 403 (current blocker)

The error manifests as:
- HTTP status: 403
- Body: HTML page containing "Enable JavaScript and cookies to continue"
- `cType`: managed (Cloudflare header)

When this occurs the workflow will route to the false branch and set `status = failed`. The pipeline run can be re-queued manually once TL fixes the WAF rule.

---

## n8n Import Notes

- Delete the old Workflow 2 before re-importing to avoid node name "1" suffix issues
- After import, re-authenticate all Postgres credential references
- Test with a pipeline_run that already has `status = extracting_frames` and a valid `video_blob_url`

---

_Last updated: 2026-03-27_
