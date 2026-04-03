# Phase 5: Extracting Clips

**Objective:** For each completed annotation run, cut a short MP4 clip per step from the original KT recording video using FFmpeg, upload to Azure Blob, and insert `step_clips` rows.

**Status transition:** `generating_annotations` → `extracting_clips` → `generating_sections`

**Status: 🔲 Pending**

---

## Sub-Parts

| Sub-Part | File | Description | Status |
|----------|------|-------------|--------|
| 5a | [5a_sop_extractor_clip_endpoint.md](5a_sop_extractor_clip_endpoint.md) | New `POST /clip` endpoint on sop-extractor — FFmpeg cut + Azure upload | 🔲 Pending |
| 5b | [5b_n8n_workflow_4.md](5b_n8n_workflow_4.md) | n8n Workflow 4 — polls `generating_annotations`, calls /clip, inserts step_clips rows | 🔲 Pending |

---

## Architecture

```
Supabase pipeline_runs (status = generating_annotations)
  → n8n Workflow 4 polls every 2 minutes
  → Get sop_steps (all steps for sop_id, ordered by sequence)
  → Compute clip boundaries (start = timestamp_start, end = next step's timestamp_start)
  → POST sop-extractor /clip  (single call — all clips in one request)
      → FFmpeg cuts each clip from original video
      → Upload to Azure Blob: {sop_id}/clips/clip_{sequence:03d}.mp4
      → Returns clip results
  → Insert step_clips rows (one per step)
  → Update pipeline_runs.status = generating_sections
```

---

## Database

**Read: `sop_steps`**
```
id, sequence, timestamp_start, timestamp_end, screenshot_url
```

**Write: `step_clips`**
```sql
id              UUID
step_id         UUID FK → sop_steps
clip_url        TEXT    -- Azure Blob base URL (no SAS token)
duration_sec    INTEGER
file_size_bytes BIGINT
created_at      TIMESTAMPTZ
```

**Update: `pipeline_runs`**
```
status → generating_sections
current_stage → clips_complete
```

---

## Clip Boundary Logic

Each step's clip is cut from:
- **start_sec** = `step.timestamp_start`
- **end_sec** = `next_step.timestamp_start` (or `start_sec + 60` for last step)
- **Max duration cap**: 60 seconds — prevents oversized clips if steps are far apart
- **Min duration**: no minimum — even a 3-second clip is valid

```
Step 1: start=120.5 → end=185.2  (64.7s → capped at 60s → clip: 120.5–180.5)
Step 2: start=185.2 → end=310.0  (124.8s → capped at 60s → clip: 185.2–245.2)
Step 3: start=310.0 → end=350.5  (40.5s → under cap → clip: 310.0–350.5)
Step 4: start=350.5 → [last]     (no next step → clip: 350.5–410.5)
```

---

## Azure Blob Path

```
{azure_account}.blob.core.windows.net/{azure_container}/{sop_id}/clips/clip_{sequence:03d}.mp4
```

Example:
```
cnavinfsop.blob.core.windows.net/infsop/82c234ae-67d5.../clips/clip_001.mp4
```

Store base URL (no SAS) in `step_clips.clip_url` — same pattern as `sop_steps.screenshot_url`.

---

## Key Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Single vs per-step extractor call | Single call, all clips in one request | One video download for all clips; avoids re-downloading per step |
| FFmpeg encode mode | `-c copy` with `-avoid_negative_ts make_zero` | Near-instant cuts, no quality loss; keyframe alignment acceptable for short clips |
| Clip duration cap | 60 seconds | Prevents huge files if steps are spread far apart in the recording |
| Clip storage | Azure Blob `{sop_id}/clips/` | Consistent with frame storage pattern |
| SAS token in URL | No — store base URL only | Same as screenshots; SAS added at access time |
| Retry safety | Check `step_clips` existence before insert | Re-running skips already-clipped steps |

---

## Verify SQL

```sql
-- Check clips created
SELECT sc.step_id, sc.clip_url, sc.duration_sec, sc.file_size_bytes
FROM step_clips sc
JOIN sop_steps ss ON ss.id = sc.step_id
WHERE ss.sop_id = '82c234ae-67d5-479a-a4cc-f31abc8fe855'
ORDER BY ss.sequence;

-- Check pipeline advanced
SELECT status, current_stage
FROM pipeline_runs
WHERE sop_id = '82c234ae-67d5-479a-a4cc-f31abc8fe855';
```

---

## Test SOP

- `sop_id`: `82c234ae-67d5-479a-a4cc-f31abc8fe855`
- 4 steps with `timestamp_start` values already set
- `pipeline_runs.status` = `generating_annotations` ✅ (ready for Phase 5)
