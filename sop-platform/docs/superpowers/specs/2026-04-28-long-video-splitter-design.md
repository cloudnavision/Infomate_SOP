# Design: Long Video Splitter (WF0)
**Date:** 2026-04-28
**Status:** Approved

## Problem
KT recordings occasionally exceed 120 minutes. The current pipeline (WF1) processes them as a single SOP, which produces oversized documents and stresses Gemini's context window. Recordings > 120 min should be automatically split into two parts, each processed as a separate SOP, and auto-linked as a Process Group for later merging.

## Scope
- New n8n workflow: `Saara - SOP_WF0 - Long Video Splitter`
- Two new extractor endpoints: `/api/probe-video` and `/api/split-video`
- No changes to WF1, WF2, WF3, WF4, WF5 or the API/frontend

## Architecture

```
SharePoint (unprocessed files)
    │
    ▼
WF0 — runs every 10 min
    ├─ Download video
    ├─ Upload to Azure Blob (full video, reused for frame extraction)
    ├─ POST /api/probe-video → duration_sec
    ├─ If ≤ 7200s → EXIT (WF1 claims it on its own schedule)
    ├─ If > 7200s → Mark SharePoint file as processed (claim it)
    ├─ POST /api/split-video → part1_url, part2_url, actual_split_sec
    ├─ Create SOP Part 1 (Supabase)
    ├─ Create SOP Part 2 (Supabase)
    ├─ POST /api/merge/process-groups (auto Process Group)
    ├─ Gemini transcription → Part 1
    └─ Gemini transcription → Part 2
         (WF2–WF5 pick up each SOP automatically by pipeline_status)
```

## New Extractor Endpoints

### POST /api/probe-video
```
Request:
  video_url: str          # Azure Blob URL with SAS token
  azure_sas_token: str
  azure_account: str
  azure_container: str

Response:
  duration_sec: int       # total duration rounded to seconds
  width: int | null
  height: int | null
```
Implementation: download video to tmp dir, run `ffprobe -v quiet -show_entries format=duration,size -show_entries stream=width,height -of json`.

### POST /api/split-video
```
Request:
  video_url: str          # Azure Blob URL (full video)
  sop_id: str             # used for blob path prefix
  azure_sas_token: str
  azure_account: str
  azure_container: str
  split_target_sec: float # default = duration / 2
  search_window_sec: float # default = 300 (±5 min)

Response:
  part1_url: str          # Azure base URL (no SAS)
  part1_duration_sec: int
  part2_url: str
  part2_duration_sec: int
  actual_split_sec: float # where the cut actually happened
```
Implementation:
1. Download full video
2. `ffprobe` to list keyframe timestamps
3. Pick keyframe nearest to `split_target_sec` within `±search_window_sec`
4. `ffmpeg -y -ss 0 -to {split_sec} -i video -c copy part1.mp4`
5. `ffmpeg -y -ss {split_sec} -i video -c copy part2.mp4`
6. Upload both to Azure: `{sop_id}/parts/part1.mp4`, `{sop_id}/parts/part2.mp4`
7. Return URLs + durations

## n8n Workflow: Saara - SOP_WF0 - Long Video Splitter

**Node sequence:**
1. `Every 10 Minutes` — Schedule trigger
2. `Setup Config` — Set credentials (same as WF1)
3. `Get Root Site` — SharePoint Graph API site ID
4. `Get Drive ID` — SharePoint drive
5. `Get Unprocessed Files` — list files where processed = false
6. `Has Files?` — IF no files → stop
7. `Download Video` — binary download from SharePoint
8. `Upload Full Video to Azure` — PUT to Azure Blob
9. `Probe Video Duration` — POST extractor /api/probe-video
10. `Is Long Video?` — IF duration_sec > 7200
    - FALSE branch → `Stop (Short Video)` — no-op, WF1 handles
    - TRUE branch → continue
11. `Mark File Processed` — SharePoint PATCH to claim file
12. `Split Video` — POST extractor /api/split-video
13. `Create SOP Part 1` — Supabase REST insert
14. `Create SOP Part 2` — Supabase REST insert
15. `Create Process Group` — POST /api/merge/process-groups
16. `Start Gemini Upload Part 1` — resumable upload initiation
17. `Upload Part 1 to Gemini` — binary upload
18. `Poll Part 1 Active` — GET Gemini file status (loop)
19. `Transcribe Part 1` — Gemini generateContent with video + prompt
20. `Save Transcript Part 1` — Supabase bulk insert transcript_lines
21. `Update SOP Part 1` — set video_duration_sec, pipeline_status=extracting_frames
22. `Start Gemini Upload Part 2` — same as 16
23. `Upload Part 2 to Gemini` — same as 17
24. `Poll Part 2 Active` — same as 18
25. `Transcribe Part 2` — same as 19
26. `Save Transcript Part 2` — same as 20
27. `Update SOP Part 2` — same as 21

## Key Decisions
- WF0 runs at 10-min intervals; WF1 at 15-min — WF0 gets first pick of the queue
- Short videos (≤ 7200s) are NOT claimed by WF0; they stay available for WF1
- The full video blob is kept on Azure (needed for WF2 frame extraction)
- Part blobs stored at `{sop_id}/parts/part1.mp4` and `part2.mp4`
- Gemini transcriptions run sequentially (Part 1 then Part 2) within WF0
- After WF0 sets pipeline_status = 'extracting_frames', WF2–WF5 take over automatically
- Process Group is auto-created so both parts appear in Source Groups on /merge page
