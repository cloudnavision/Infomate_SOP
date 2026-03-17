# n8n Workflow 1: Extraction Pipeline
# ====================================
# Triggered when admin uploads MP4 via React app
# Orchestrates: transcription, frame extraction, annotation, clip generation

## Trigger
- **Node**: Webhook
- **Method**: POST
- **Path**: /webhook/extract
- **Authentication**: Header Auth (shared secret with FastAPI)
- **Expected payload**:
  ```json
  {
    "sop_id": "uuid",
    "video_file_path": "/data/uploads/kt_session_2025_12_31.mp4",
    "meeting_date": "2025-12-31",
    "title": "Aged Debtor Report KT Session",
    "client_name": "Starboard Hotels",
    "process_name": "Aged Debtor Report"
  }
  ```

---

## Node 1: Webhook Trigger
- **Type**: n8n-nodes-base.webhook
- **Config**:
  - httpMethod: POST
  - path: "extract"
  - responseMode: "onReceived" (respond immediately, process async)
  - responseCode: 202

---

## Node 2: Create pipeline_run record
- **Type**: n8n-nodes-base.postgres
- **Operation**: executeQuery
- **Query**:
  ```sql
  INSERT INTO pipeline_runs (sop_id, status, current_stage)
  VALUES ('{{$json.sop_id}}', 'transcribing', 'transcribing')
  RETURNING id;
  ```
- Also update sops table:
  ```sql
  UPDATE sops SET status = 'processing' WHERE id = '{{$json.sop_id}}';
  ```

---

## Node 3: SSE progress notifier (Function)
- **Type**: n8n-nodes-base.code
- **Purpose**: Helper function used throughout to push progress events to React app
- **Code**:
  ```javascript
  // This node is called between stages to update pipeline_runs
  // and notify the React app via FastAPI SSE endpoint
  const sopId = $input.first().json.sop_id;
  const pipelineId = $input.first().json.pipeline_id;
  const stage = $input.first().json.current_stage;
  const stageResult = $input.first().json.stage_result || {};
  
  // Update pipeline_runs in postgres (done by subsequent postgres node)
  return [{
    json: {
      sop_id: sopId,
      pipeline_id: pipelineId,
      current_stage: stage,
      stage_result: stageResult
    }
  }];
  ```

---

## Node 4a: Gemini — Transcription (parallel branch 1)
- **Type**: n8n-nodes-base.httpRequest
- **Purpose**: Upload video to Gemini File API, then request transcription
- **Pre-node (Code)**: Prepare Gemini File API upload
  ```javascript
  // Step 1: Upload video to Gemini File API
  const videoPath = $input.first().json.video_file_path;
  const fs = require('fs');
  const fileBuffer = fs.readFileSync(videoPath);
  const fileSize = fs.statSync(videoPath).size;
  
  return [{
    json: {
      sop_id: $input.first().json.sop_id,
      video_path: videoPath,
      file_size: fileSize,
      mime_type: 'video/mp4'
    },
    binary: {
      video: {
        data: fileBuffer.toString('base64'),
        mimeType: 'video/mp4',
        fileName: videoPath.split('/').pop()
      }
    }
  }];
  ```

- **HTTP Request 1**: Upload to Gemini File API
  - Method: POST
  - URL: `https://generativelanguage.googleapis.com/upload/v1beta/files`
  - Headers:
    - `x-goog-api-key`: `{{$credentials.geminiApiKey}}`
    - `X-Goog-Upload-Protocol`: `resumable`
    - `X-Goog-Upload-Command`: `start`
    - `X-Goog-Upload-Header-Content-Length`: `{{$json.file_size}}`
    - `X-Goog-Upload-Header-Content-Type`: `video/mp4`
  - Body JSON: `{"file": {"display_name": "kt_session"}}`

- **HTTP Request 2** (after upload completes): Generate transcription
  - Method: POST
  - URL: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
  - Headers:
    - `x-goog-api-key`: `{{$credentials.geminiApiKey}}`
  - Body JSON:
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

---

## Node 4b: Gemini — Screen Share Detection (parallel branch 2)
- **Type**: n8n-nodes-base.httpRequest
- **Purpose**: Detect when screen sharing is active and get crop coordinates
- **Uses same uploaded file_uri from Node 4a** (or uploads separately if parallel)
- **Prompt**:
  ```
  Analyze this Teams meeting recording. For each distinct period where
  someone is sharing their screen, provide:
  1. start_time and end_time (in seconds)
  2. The bounding box of the shared screen content in pixels:
     x, y (top-left corner), width, height
  3. Whether webcam thumbnails are visible and where (top/bottom/side)

  The video resolution is [detected from metadata].
  Return ONLY valid JSON:
  {
    "screen_share_periods": [
      {
        "start_sec": 32,
        "end_sec": 1908,
        "crop": {"x": 170, "y": 95, "w": 1580, "h": 890},
        "webcam_position": "right_strip"
      }
    ]
  }
  ```

---

## Node 4c: Azure Blob Upload (parallel branch 3)
- **Type**: n8n-nodes-base.httpRequest
- **Purpose**: Upload original MP4 to Azure Blob Storage
- **Method**: PUT
- **URL**: `https://{{storage_account}}.blob.core.windows.net/sop-media/{{sop_id}}/original.mp4`
- **Headers**:
  - `x-ms-blob-type`: `BlockBlob`
  - `Authorization`: `Bearer {{$credentials.azureBlobSas}}`
- **Returns**: The public URL for the stored video

---

## Node 5: Merge
- **Type**: n8n-nodes-base.merge
- **Mode**: Combine (wait for all 3 branches)
- **Combines**: transcript data + crop coordinates + video blob URL

---

## Node 6: Code — Parse and transform transcript
- **Type**: n8n-nodes-base.code
- **Purpose**: Parse Gemini JSON response, convert MM:SS timestamps to seconds,
  prepare bulk insert for transcript_lines
- **Code**:
  ```javascript
  const geminiResponse = JSON.parse($input.first().json.transcription_response);
  const transcript = geminiResponse.transcript;
  
  // Convert MM:SS to seconds
  function mmssToSec(mmss) {
    const [m, s] = mmss.split(':').map(Number);
    return m * 60 + s;
  }
  
  const lines = transcript.map((line, idx) => ({
    sop_id: $input.first().json.sop_id,
    sequence: idx + 1,
    speaker: line.speaker,
    timestamp_sec: mmssToSec(line.start),
    content: line.text
  }));
  
  const participants = geminiResponse.meeting_participants || geminiResponse.speakers;
  
  return [{
    json: {
      sop_id: $input.first().json.sop_id,
      transcript_lines: lines,
      screen_changes: geminiResponse.screen_changes,
      participants: participants,
      screen_share_periods: $input.first().json.screen_share_periods,
      video_url: $input.first().json.video_blob_url
    }
  }];
  ```

---

## Node 7: Postgres — Bulk insert transcript + update SOP
- **Type**: n8n-nodes-base.postgres
- **Operation**: executeQuery
- **Queries** (run sequentially):
  1. Bulk insert transcript_lines (using unnest for performance)
  2. Update sops with video_url, screen_share_periods, meeting_participants
  3. Update pipeline_runs status → 'extracting_frames'

---

## Node 8: HTTP — Frame Extractor Service
- **Type**: n8n-nodes-base.httpRequest
- **Method**: POST
- **URL**: `http://frame-extractor:8001/extract`
- **Body**:
  ```json
  {
    "sop_id": "{{sop_id}}",
    "video_path": "/data/uploads/{{filename}}",
    "screen_share_periods": {{screen_share_periods}},
    "pyscenedetect_threshold": 3.0,
    "min_scene_len_sec": 2,
    "dedup_hash_threshold": 8,
    "frame_offset_sec": 1.5
  }
  ```
- **Timeout**: 300 seconds (5 min for long videos)
- **Response**: JSON with extracted frames metadata

---

## Node 9: Postgres — Insert extracted frames as draft steps
- **Type**: n8n-nodes-base.postgres
- **Purpose**: Create sop_steps records for each useful frame
- **Code node before** (prepares insert data):
  ```javascript
  const frames = $input.first().json.frames;
  const sopId = $input.first().json.sop_id;
  
  return frames
    .filter(f => f.classification === 'USEFUL')
    .map((frame, idx) => ({
      json: {
        sop_id: sopId,
        sequence: idx + 1,
        title: `Step ${idx + 1}`,  // Will be overwritten by AI
        description: frame.description,
        timestamp_start: frame.timestamp_sec,
        screenshot_url: frame.file_path,  // Local path, will be replaced with Blob URL
        screenshot_width: frame.width,
        screenshot_height: frame.height,
        scene_score: frame.scene_score,
        frame_classification: frame.classification,
        gemini_description: frame.description
      }
    }));
  ```

---

## Node 10: Split In Batches — Annotation loop
- **Type**: n8n-nodes-base.splitInBatches
- **Batch Size**: 3 (process 3 frames at a time to parallelise Gemini calls)
- **For each frame in batch**:

### Node 10a: Code — Prepare Gemini annotation prompt
  ```javascript
  const step = $input.first().json;
  const transcriptContext = $input.first().json.nearby_transcript;
  
  const prompt = `You are analyzing a screenshot from a KT (knowledge transfer) session.
  
  At timestamp ${step.timestamp_start}s, the speaker was discussing:
  "${transcriptContext}"
  
  Looking at this screenshot, identify each UI element that the speaker is referencing
  or that a user would need to interact with to follow this process step.
  
  For each element, provide:
  - label: the visible text label of the element
  - type: button, folder, cell, menu_item, tab, icon, link, field, checkbox
  - region_hint: natural language location ("left sidebar, third item", "column H header", "top menu bar")
  
  Return ONLY valid JSON:
  {
    "elements": [
      {"label": "Credit Check", "type": "folder", "region_hint": "left sidebar, second item"}
    ]
  }`;
  
  return [{ json: { ...step, prompt } }];
  ```

### Node 10b: HTTP — Gemini semantic annotation
  - Send screenshot image + prompt to Gemini
  - Model: gemini-2.5-flash
  - Temperature: 0.1

### Node 10c: HTTP — Google Cloud Vision OCR
  - **URL**: `https://vision.googleapis.com/v1/images:annotate`
  - **Body**:
    ```json
    {
      "requests": [{
        "image": {"source": {"imageUri": "{{screenshot_local_path}}"}},
        "features": [{"type": "TEXT_DETECTION"}]
      }]
    }
    ```
  - Returns: text annotations with bounding boxes

### Node 10d: Code — Match Gemini labels to OCR bounding boxes
  ```javascript
  const geminiElements = JSON.parse($input.first().json.gemini_response).elements;
  const ocrAnnotations = $input.first().json.ocr_response.textAnnotations || [];
  const imgWidth = $input.first().json.screenshot_width;
  const imgHeight = $input.first().json.screenshot_height;
  
  function levenshtein(a, b) {
    // Standard Levenshtein distance implementation
    const m = a.length, n = b.length;
    const dp = Array.from({length: m+1}, () => Array(n+1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = Math.min(
          dp[i-1][j] + 1,
          dp[i][j-1] + 1,
          dp[i-1][j-1] + (a[i-1] !== b[j-1] ? 1 : 0)
        );
    return dp[m][n];
  }
  
  function regionToApproxCoords(hint, w, h) {
    // Convert "left sidebar" → {x: w*0.15, y: h*0.5}
    let x = w * 0.5, y = h * 0.5;
    if (hint.includes('left')) x = w * 0.15;
    if (hint.includes('right')) x = w * 0.85;
    if (hint.includes('top')) y = h * 0.15;
    if (hint.includes('bottom')) y = h * 0.85;
    if (hint.includes('center') || hint.includes('middle')) { x = w * 0.5; y = h * 0.5; }
    return { x: Math.round(x), y: Math.round(y) };
  }
  
  // Skip first OCR annotation (it's the full text block)
  const ocrWords = ocrAnnotations.slice(1);
  
  const callouts = geminiElements.map((el, idx) => {
    const label = el.label.toLowerCase().trim();
    
    // Try exact OCR match
    let bestMatch = null;
    let bestScore = Infinity;
    let matchMethod = 'gemini_coordinates';
    let confidence = 'gemini_only';
    
    for (const ocr of ocrWords) {
      const ocrText = ocr.description.toLowerCase().trim();
      const vertices = ocr.boundingPoly.vertices;
      const cx = Math.round((vertices[0].x + vertices[2].x) / 2);
      const cy = Math.round((vertices[0].y + vertices[2].y) / 2);
      
      // Exact match
      if (ocrText === label || label.includes(ocrText)) {
        if (!bestMatch || ocrText.length > bestMatch.text.length) {
          bestMatch = { x: cx, y: cy, text: ocrText };
          matchMethod = 'ocr_exact_text';
          confidence = 'ocr_exact';
          bestScore = 0;
        }
      }
      
      // Fuzzy match
      const dist = levenshtein(ocrText, label);
      const threshold = Math.max(2, Math.floor(label.length * 0.3));
      if (dist < threshold && dist < bestScore) {
        bestMatch = { x: cx, y: cy, text: ocrText };
        matchMethod = 'ocr_fuzzy_text';
        confidence = 'ocr_fuzzy';
        bestScore = dist;
      }
    }
    
    // If multiple matches, use region hint to disambiguate
    if (bestMatch && bestScore > 0) {
      matchMethod = 'ocr_disambiguated';
    }
    
    // Fallback to Gemini region estimate
    const coords = bestMatch
      ? { x: bestMatch.x, y: bestMatch.y }
      : regionToApproxCoords(el.region_hint || '', imgWidth, imgHeight);
    
    return {
      step_id: $input.first().json.step_id,
      callout_number: idx + 1,
      label: `${el.label} (${el.type})`,
      target_x: coords.x,
      target_y: coords.y,
      confidence: confidence,
      match_method: matchMethod,
      ocr_matched_text: bestMatch ? bestMatch.text : null,
      gemini_region_hint: el.region_hint,
      element_type: el.type
    };
  });
  
  return [{ json: { callouts, step_id: $input.first().json.step_id } }];
  ```

### Node 10e: Postgres — Insert callouts
  - Bulk insert into step_callouts table

---

## Node 11: HTTP — Extract video clips
- **Type**: n8n-nodes-base.httpRequest
- **URL**: `http://frame-extractor:8001/clips`
- **Body**:
  ```json
  {
    "sop_id": "{{sop_id}}",
    "video_path": "/data/uploads/{{filename}}",
    "crop": {{crop_coords}},
    "steps": [
      {"step_id": "uuid", "start_sec": 52, "end_sec": 127},
      {"step_id": "uuid", "start_sec": 127, "end_sec": 342}
    ]
  }
  ```
- **The frame-extractor runs FFmpeg**:
  ```bash
  ffmpeg -i input.mp4 -vf "crop=w:h:x:y" -ss START -to END \
         -c:v libx264 -crf 23 -c:a aac clip_STEP_ID.mp4
  ```

---

## Node 12: Loop — Upload media to Azure Blob
- **Type**: n8n-nodes-base.splitInBatches
- **Purpose**: Upload each frame PNG and clip MP4 to Azure Blob Storage
- **For each file**:
  - PUT to `https://{{storage}}.blob.core.windows.net/sop-media/{{sop_id}}/frames/{{filename}}`
  - Update sop_steps.screenshot_url with the Blob URL
  - Insert step_clips record with clip Blob URL

---

## Node 13: Execute Workflow — Trigger Section Generation
- **Type**: n8n-nodes-base.executeWorkflow
- **Workflow**: "SOP Section Generation" (Workflow 2)
- **Passes**: sop_id

---

## Node 14: Postgres — Final status update
- **Type**: n8n-nodes-base.postgres
- **Queries**:
  ```sql
  UPDATE pipeline_runs
  SET status = 'completed',
      completed_at = NOW(),
      processing_time_sec = EXTRACT(EPOCH FROM (NOW() - started_at))
  WHERE sop_id = '{{sop_id}}' AND status != 'completed';
  
  UPDATE sops SET status = 'draft' WHERE id = '{{sop_id}}';
  ```

---

## Error Handling
- **Type**: n8n-nodes-base.errorTrigger (connected to all nodes)
- **On error**:
  ```sql
  UPDATE pipeline_runs
  SET status = 'failed',
      error_message = '{{$json.error.message}}',
      error_stage = '{{$json.current_stage}}',
      completed_at = NOW()
  WHERE sop_id = '{{sop_id}}';
  ```
- Also sends notification via webhook to React app (SSE channel)