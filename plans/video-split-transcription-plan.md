# Video Split Transcription Plan

## Problem
Gemini 2.5 Pro transcription cuts off at ~26 minutes due to thinking tokens consuming the output token budget. A 47-minute recording only gets ~26 minutes transcribed.

## Proposed Solution
Split the video into 2 parts for transcription only, then use the original full video for the rest of the pipeline.

---

## Step-by-Step Plan

### Step 1 — Split the Video
- Use any video editor (e.g. Clipchamp, DaVinci Resolve, or ffmpeg)
- Part 1: 0:00 → 30:00
- Part 2: 30:00 → end (e.g. 30:00 → 47:00)
- Note the exact split timestamp in seconds (needed for offset fix later)

### Step 2 — Upload Both Parts to SharePoint
- Upload Part 1 and Part 2 as separate files
- n8n picks them up and processes each as a separate SOP

### Step 3 — n8n Processes Transcription for Both
- Workflow 1 runs twice (once per file)
- Result: 2 SOPs, 2 transcripts in the database
- Part 1 transcript: timestamps 0:00 → 30:00 ✓
- Part 2 transcript: timestamps 0:00 → 17:00 ✗ (wrong — needs offset)

### Step 4 — Fix Part 2 Timestamps
- Add the split offset (e.g. +1800 seconds for a 30-min split) to every transcript line in Part 2
- This corrects Part 2 timestamps to 30:00 → 47:00

### Step 5 — Merge Transcripts into One SOP
- Move all Part 2 transcript lines into Part 1 SOP
- Delete Part 2 SOP

### Step 6 — Continue Pipeline on Original Full Video
- Frame extraction, clips, annotations all run on the original full video
- Timestamps now align correctly with merged transcript

---

## What Needs to Be Built
- **Merge Tool**: A script/API endpoint to:
  - Accept Part 1 SOP ID + Part 2 SOP ID + split offset (seconds)
  - Add offset to all Part 2 transcript line timestamps
  - Move Part 2 transcript lines into Part 1 SOP
  - Delete Part 2 SOP

---

## Limitations
- Must be done manually every time a recording exceeds 30 minutes
- Requires knowing the exact split timestamp
- Extra upload + processing time for Part 2

---

## Alternative (Recommended)
Add `"thinkingConfig": { "thinkingBudget": 0 }` to Workflow 1 Gemini node.
- One-time change
- No splitting, no merging, no timestamp fixes
- Covers up to ~93 minutes of speech

---

## Status
- [ ] TL approval to proceed with this method
- [ ] Split the 47-min video
- [ ] Upload both parts to SharePoint
- [ ] Process both through n8n
- [ ] Build merge tool
- [ ] Run merge tool on processed SOPs
