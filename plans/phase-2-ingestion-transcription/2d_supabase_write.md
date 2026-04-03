# Phase 2d: Write Transcript + SOP Data to Supabase

### Objective
Extend the n8n workflow with the final nodes — write the Gemini-generated transcript to Supabase, update the SOP record with metadata, update the pipeline status, and mark the SharePoint file as processed.

### Prerequisites
- Phase 2c complete — transcript JSON parsed, screen share data parsed, all ready as structured data
- Supabase REST API accessible from n8n
- Supabase service_role key for write operations

### What to Build (add to existing workflow after Node 17)

**Node 18: HTTP Request — Bulk insert transcript_lines**
- Method: POST
- URL: `https://{{SUPABASE_URL}}/rest/v1/transcript_lines`
- Headers:
  - `apikey`: `{{SUPABASE_ANON_KEY}}`
  - `Authorization`: `Bearer {{SUPABASE_SERVICE_KEY}}`
  - `Content-Type`: `application/json`
  - `Prefer`: `return=minimal`
- Body: JSON array of all transcript lines from Node 17
```json
[
  {"sop_id": "{{sop_id}}", "sequence": 1, "speaker": "Kanu Parmar", "timestamp_sec": 0, "content": "Morning Lasya."},
  {"sop_id": "{{sop_id}}", "sequence": 2, "speaker": "Lasya Bogavarapu", "timestamp_sec": 7, "content": "Hi Kanu..."},
  ...
]
```

**Note on bulk insert:** The Supabase REST API accepts a JSON array for bulk insert. If the transcript has 100+ lines, this is one POST request — not 100 individual inserts.

**Node 19: HTTP Request — Update SOP record**
- Method: PATCH
- URL: `https://{{SUPABASE_URL}}/rest/v1/sops?id=eq.{{sop_id}}`
- Headers: same as Node 18 (apikey + service_role)
- Body:
```json
{
  "meeting_participants": ["Kanu Parmar", "Lasya Bogavarapu", "Suchith Peiris"],
  "screen_share_periods": [{"start_sec": 32, "end_sec": 1908, "crop": {"x": 170, "y": 95, "w": 1580, "h": 890}}],
  "video_duration_sec": 1950
}
```

**Note:** `video_duration_sec` can be estimated from the last transcript line's timestamp, or from the file metadata.

**Node 20: HTTP Request — Update pipeline_runs**
- Method: PATCH
- URL: `https://{{SUPABASE_URL}}/rest/v1/pipeline_runs?sop_id=eq.{{sop_id}}`
- Headers: same
- Body:
```json
{
  "status": "transcription_complete",
  "current_stage": "transcription_complete",
  "total_api_cost": 0.32,
  "gemini_input_tokens": 180000,
  "gemini_output_tokens": 4500,
  "stage_results": {
    "transcription": {
      "speakers": 4,
      "lines": 87,
      "duration_sec": 45,
      "cost": 0.30
    },
    "screen_detection": {
      "periods": 1,
      "cost": 0.02
    }
  }
}
```

**Node 21: HTTP Request — Mark file as processed**
- Method: POST
- URL: `https://{{SUPABASE_URL}}/rest/v1/processed_sharepoint_files`
- Headers: same
- Body:
```json
{
  "file_id": "{{file_id from SharePoint}}",
  "filename": "{{file_name}}",
  "sop_id": "{{sop_id}}"
}
```

This ensures the file won't be picked up again on the next poll (Node 4 in Phase 2a filters against this table).

**Node 22: Error Trigger — Handle failures**
- Type: Error Trigger (connected to all nodes as error handler)
- On any error, execute:
  - HTTP Request to PATCH pipeline_runs:
    ```json
    {
      "status": "failed",
      "error_message": "{{error_message}}",
      "error_stage": "{{stage_where_error_occurred}}",
      "completed_at": "{{now}}"
    }
    ```

### Supabase REST API Patterns

**Insert (POST):**
```
POST /rest/v1/{table}
Headers: apikey, Authorization Bearer service_role, Content-Type application/json
Body: { ... } for single row, [ {...}, {...} ] for bulk
```

**Update (PATCH):**
```
PATCH /rest/v1/{table}?{column}=eq.{value}
Headers: same
Body: { fields to update }
```

**The `?id=eq.{value}` filter is required** — without it, Supabase PATCH updates ALL rows.

### End-to-End Test (Full Phase 2)

When all 4 sub-parts are connected and working:

1. Upload a test MP4 to the SharePoint SOP folder
2. Trigger the n8n workflow manually (or wait for the 15-minute schedule)
3. Watch the n8n execution log — all nodes should turn green

Then verify:
- **Azure Blob:** `sop-media/{sop-id}/original.mp4` exists and is playable
- **Supabase `sops`:** new record with video_url, participants, screen_share_periods, status "processing"
- **Supabase `transcript_lines`:** full transcript with correct speakers, timestamps in seconds, content text
- **Supabase `pipeline_runs`:** status "transcription_complete", API cost tracked, stage_results populated
- **Supabase `processed_sharepoint_files`:** file_id recorded (won't be re-processed)
- **React app:** sign in → Dashboard → new SOP card visible → click into it → shows transcript data

### Validation
- [ ] Transcript lines inserted (check row count matches Gemini output)
- [ ] Speaker names correct in each line
- [ ] Timestamps are seconds (numbers), not MM:SS strings
- [ ] SOP record updated with participants + screen_share_periods
- [ ] pipeline_runs updated with status, cost, stage_results
- [ ] Processed file tracked (not re-processed on next poll)
- [ ] Error handler works (test by intentionally breaking a node)
- [ ] Full pipeline runs end-to-end without errors

### Checklist
```
Manual:
- [ ] Verify Supabase service_role key is in n8n variables
- [ ] processed_sharepoint_files table exists in Supabase

Build:
- [ ] Node 18: Bulk insert transcript_lines
- [ ] Node 19: Update SOP record (PATCH)
- [ ] Node 20: Update pipeline_runs (PATCH)
- [ ] Node 21: Mark file as processed (POST)
- [ ] Node 22: Error handler
- [ ] Connect nodes after Node 17 (Parse Transcript)
- [ ] Test: full end-to-end pipeline execution
```

### Status: ⬜ Pending
