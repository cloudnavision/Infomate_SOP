# Phase 2c: Gemini Transcription + Screen Share Detection

### Objective
Extend the n8n workflow. Upload the MP4 to Gemini's File API, send transcription and screen share detection prompts, parse the structured JSON responses, and calculate API cost.

### Prerequisites
- Phase 2b complete — MP4 uploaded to Azure Blob, SOP + pipeline_runs records in Supabase
- Gemini API key ready (GCP project with Gemini API enabled and billing)
- Gemini model: `gemini-2.5-flash`

### What to Build (add to existing workflow after Node 11)

**Node 12: HTTP Request — Start Gemini File Upload**
- Method: POST
- URL: `https://generativelanguage.googleapis.com/upload/v1beta/files`
- Headers:
  - `x-goog-api-key`: `{{GEMINI_API_KEY}}`
  - `X-Goog-Upload-Protocol`: `resumable`
  - `X-Goog-Upload-Command`: `start`
  - `X-Goog-Upload-Header-Content-Length`: `{{file_size}}`
  - `X-Goog-Upload-Header-Content-Type`: `video/mp4`
- Body JSON: `{"file": {"display_name": "kt_session_{{sop_id}}"}}`
- Returns: Upload URL in response header (`X-Goog-Upload-URL`)

**Node 13: HTTP Request — Complete Gemini File Upload**
- Method: PUT
- URL: from Node 12 response header
- Headers:
  - `X-Goog-Upload-Command`: `upload, finalize`
  - `X-Goog-Upload-Offset`: `0`
  - `Content-Type`: `video/mp4`
- Body: binary video data
- Returns: JSON with `file.uri` (Gemini's reference to the uploaded file)

**Node 14: HTTP Request — Gemini Transcription**
- Method: POST
- URL: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
- Headers: `x-goog-api-key`: `{{GEMINI_API_KEY}}`
- Body:
```json
{
  "contents": [{
    "parts": [
      {"file_data": {"mime_type": "video/mp4", "file_uri": "{{file_uri}}"}},
      {"text": "Transcribe this meeting recording with precise speaker identification. For each speaker turn, provide: speaker_name, timestamp_start (MM:SS format), timestamp_end, spoken_text. Also identify every moment where the shared screen content changes visually and note the timestamp.\n\nReturn ONLY valid JSON in this exact format:\n{\n  \"speakers\": [\"name1\", \"name2\"],\n  \"transcript\": [\n    {\"speaker\": \"name\", \"start\": \"MM:SS\", \"end\": \"MM:SS\", \"text\": \"spoken words\"}\n  ],\n  \"screen_changes\": [\n    {\"timestamp\": \"MM:SS\", \"description\": \"what is now visible on screen\"}\n  ],\n  \"meeting_participants\": [\"full names mentioned\"]\n}"}
    ]
  }],
  "generationConfig": {
    "temperature": 0.1,
    "responseMimeType": "application/json"
  }
}
```
- Timeout: 300 seconds

**Node 15: HTTP Request — Gemini Screen Share Detection**
- Method: POST (same URL as Node 14)
- Headers: same
- Body:
```json
{
  "contents": [{
    "parts": [
      {"file_data": {"mime_type": "video/mp4", "file_uri": "{{file_uri}}"}},
      {"text": "Analyze this Teams meeting recording. For each distinct period where someone is sharing their screen, provide:\n1. start_time and end_time (in seconds)\n2. The bounding box of the shared screen content in pixels: x, y (top-left corner), width, height\n3. Whether webcam thumbnails are visible and where\n\nReturn ONLY valid JSON:\n{\n  \"screen_share_periods\": [\n    {\n      \"start_sec\": 32,\n      \"end_sec\": 1908,\n      \"crop\": {\"x\": 170, \"y\": 95, \"w\": 1580, \"h\": 890},\n      \"webcam_position\": \"right_strip\"\n    }\n  ]\n}"}
    ]
  }],
  "generationConfig": {
    "temperature": 0.1,
    "responseMimeType": "application/json"
  }
}
```
- Timeout: 300 seconds

**Note:** Nodes 14 and 15 can run in **parallel** — both use the same `file_uri`. In n8n, connect both to Node 13's output, then merge their results.

**Node 16: Merge**
- Type: Merge
- Mode: Combine (wait for both parallel branches)
- Combines transcription result + screen share detection result

**Node 17: Code Node — Parse and transform**
- Parse both Gemini responses
- Convert MM:SS timestamps to seconds
- Prepare transcript_lines array for Supabase
- Extract participants
- Calculate API cost
```javascript
// Parse transcription response
const transcriptText = $('Gemini Transcription').first().json
  .candidates[0].content.parts[0].text;
const transcriptData = JSON.parse(
  transcriptText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
);

// Parse screen share response
const screenText = $('Gemini Screen Detection').first().json
  .candidates[0].content.parts[0].text;
const screenData = JSON.parse(
  screenText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
);

// Convert MM:SS to seconds
function mmssToSec(mmss) {
  const [m, s] = mmss.split(':').map(Number);
  return m * 60 + s;
}

// Build transcript lines
const lines = transcriptData.transcript.map((line, idx) => ({
  sop_id: $('Generate SOP ID').first().json.sop_id,
  sequence: idx + 1,
  speaker: line.speaker,
  timestamp_sec: mmssToSec(line.start),
  content: line.text
}));

// Get participants
const participants = transcriptData.meeting_participants || transcriptData.speakers;

// Calculate API cost (Gemini 2.5 Flash pricing)
const usage1 = $('Gemini Transcription').first().json.usageMetadata || {};
const usage2 = $('Gemini Screen Detection').first().json.usageMetadata || {};
const inputTokens = (usage1.promptTokenCount || 0) + (usage2.promptTokenCount || 0);
const outputTokens = (usage1.candidatesTokenCount || 0) + (usage2.candidatesTokenCount || 0);
const cost = (inputTokens * 0.15 / 1000000) + (outputTokens * 0.60 / 1000000);

return [{
  json: {
    sop_id: $('Generate SOP ID').first().json.sop_id,
    transcript_lines: lines,
    screen_changes: transcriptData.screen_changes,
    participants: participants,
    screen_share_periods: screenData.screen_share_periods,
    speaker_count: participants.length,
    line_count: lines.length,
    api_cost: Math.round(cost * 1000) / 1000,
    input_tokens: inputTokens,
    output_tokens: outputTokens
  }
}];
```

### Gemini File API Notes

- Supports videos up to 2GB
- Uploaded files auto-delete after 48 hours
- Video analysed at 1 FPS internally
- 30-minute video = ~1,800 frames for Gemini
- Transcription typically takes 30-60 seconds
- Resumable upload required for large files

### Error Handling

- If Gemini returns invalid JSON → retry once with stricter prompt
- If File API upload fails → retry with exponential backoff
- If transcription exceeds 5 min timeout → video may be too long, log error
- Store errors in pipeline_runs.error_message

### Validation
- [ ] Video uploaded to Gemini File API (file_uri returned)
- [ ] Transcription returns valid JSON with speakers, timestamps, text
- [ ] Screen share detection returns valid JSON with crop coordinates
- [ ] MM:SS timestamps correctly converted to seconds
- [ ] Participants extracted correctly
- [ ] API cost calculated (input + output tokens)
- [ ] Parallel execution works (both prompts fire simultaneously)

### Checklist
```
Manual:
- [ ] Gemini API key added to n8n workflow variables
- [ ] Test Gemini API key with a simple prompt

Build:
- [ ] Node 12: Start Gemini file upload
- [ ] Node 13: Complete Gemini file upload (binary)
- [ ] Node 14: Transcription prompt
- [ ] Node 15: Screen share detection prompt (parallel with 14)
- [ ] Node 16: Merge parallel results
- [ ] Node 17: Parse + transform + cost calculation
- [ ] Connect after Node 11 (Create Pipeline Run)
- [ ] Test: valid transcript JSON from real video
```

### Status: ⬜ Pending
