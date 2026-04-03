# Phase 4a: n8n Workflow 3 — Gemini Frame Classification

### Objective
For every `sop_steps` row where `frame_classification = 'useful'` and `gemini_description IS NULL`, download the PNG from Azure Blob, send it to Gemini Vision with a structured prompt, parse the JSON response into step description + UI element callouts, and write results to Supabase. Advance `pipeline_runs.status` to `generating_annotations` when all steps are done.

### Prerequisites
- Phase 3 verified — `sop_steps` rows in Supabase with valid `screenshot_url`
- Gemini API key from Google AI Studio (same project as Phase 2 — `GEMINI_API_KEY`)
- Same Supabase + Azure credentials as Workflow 2

---

### Workflow File

`sop-platform/n8n-workflows/Saara - SOP_Workflow 3 - Gemini Classification.json`

Import this to n8n. Delete any old "Gemini Classification" workflow first.

---

### Node Chain (16 nodes)

```
Every 2 Minutes (Schedule)
→ Setup Config (Set — all credentials including GEMINI_API_KEY)
→ Poll Pending Classifications (GET pipeline_runs WHERE status=classifying_frames, limit=1)
→ Any Pending? (IF — $json.id is not empty)
  → FALSE → No Work — Stop (NoOp)
  → TRUE  → Extract Run Info (Code — unpack pipeline_run_id + sop_id)
           → Get SOP Steps (GET sop_steps WHERE sop_id=X AND frame_classification=useful, ORDER BY sequence)
           → Split Steps (SplitInBatches — batchSize=1)
             → [batch] → Build Image URL (Code — append SAS to screenshot_url)
                        → Download Frame Image (HTTP GET — returns PNG binary)
                        → Build Gemini Request (Code — base64 encode + structured prompt)
                        → Call Gemini Vision (POST generateContent, gemini-2.5-flash)
                        → Parse Gemini Response (Code — extract description + callouts)
                        → Update SOP Step (PATCH sop_steps — gemini_description)
                        → Insert Step Callouts (POST step_callouts — bulk array)
                        → [loop back to Split Steps]
             → [done] → Update Pipeline Run (PATCH — status=generating_annotations)
```

---

### Setup Config Node — Values to Fill In

| Field | Value | Where to find |
|-------|-------|--------------|
| `SUPABASE_URL` | `https://hzluuqhbkiblmojxgbab.supabase.co` | Same as Workflow 2 |
| `SUPABASE_ANON_KEY` | anon key | Same as Workflow 2 |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | Same as Workflow 2 |
| `AZURE_BLOB_SAS_TOKEN` | SAS token (no `?` prefix) | Same as Workflow 2 |
| `GEMINI_API_KEY` | API key from Google AI Studio | Same project used in Phase 2 |

---

### Key Node Details

**Poll Pending Classifications**
```
GET {SUPABASE_URL}/rest/v1/pipeline_runs
  ?status=eq.classifying_frames
  &select=id,sop_id
  &limit=1
Headers:
  apikey: {SUPABASE_ANON_KEY}
  Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}
```

**Extract Run Info (Code)**
```javascript
const run = $input.first().json;
const config = $('Setup Config').first().json;
return [{
  json: {
    pipeline_run_id: run.id,
    sop_id: run.sop_id,
  }
}];
```

**Get SOP Steps**
```
GET {SUPABASE_URL}/rest/v1/sop_steps
  ?sop_id=eq.{sop_id}
  &frame_classification=eq.useful
  &gemini_description=is.null
  &select=id,sequence,screenshot_url,timestamp_start
  &order=sequence.asc
```

**Build Image URL (Code)**
```javascript
const step = $input.first().json;
const config = $('Setup Config').first().json;
return [{
  json: {
    step_id: step.id,
    sequence: step.sequence,
    timestamp_start: step.timestamp_start,
    screenshot_url: step.screenshot_url,
    screenshot_url_with_sas: step.screenshot_url + '?' + config.AZURE_BLOB_SAS_TOKEN,
  }
}];
```

**Download Frame Image**
```
GET {{ $json.screenshot_url_with_sas }}
Response format: file (binary PNG)
```

**Build Gemini Request (Code)**
```javascript
const prevData = $('Build Image URL').first().json;
const input = $input.first();
const binaryKey = Object.keys(input.binary || {})[0] || 'data';
const base64Image = input.binary?.[binaryKey]?.data || '';

const prompt = `You are analyzing a screenshot from a software training video where a trainer is demonstrating a business process step by step.

1. Write one clear action-oriented sentence describing what is happening on screen (e.g., "The trainer opens the Aged Debtor report by navigating to the shared Credit Check folder").

2. Identify all interactive UI elements that should be annotated with numbered callouts. For each element provide:
   - label: short imperative action label (e.g., "Double-click 'Credit Check' folder")
   - element_type: one of: button, folder, cell, menu_item, icon, text_field, dropdown, link, tab, checkbox
   - target_x: estimated X pixel coordinate from left edge of image
   - target_y: estimated Y pixel coordinate from top edge of image
   - region_hint: brief location description (e.g., "top-right toolbar", "left sidebar third item")

Return ONLY valid JSON with no markdown code blocks:
{
  "description": "...",
  "ui_elements": [
    {
      "label": "...",
      "element_type": "...",
      "target_x": 0,
      "target_y": 0,
      "region_hint": "..."
    }
  ]
}`;

return [{
  json: {
    step_id: prevData.step_id,
    sequence: prevData.sequence,
    screenshot_url: prevData.screenshot_url,
    geminiBody: {
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType: "image/png",
              data: base64Image
            }
          },
          { text: prompt }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    }
  }
}];
```

**Call Gemini Vision**
```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={{ $('Setup Config').first().json.GEMINI_API_KEY }}
Content-Type: application/json
Body: {{ JSON.stringify($json.geminiBody) }}
Timeout: 60s
```

**Parse Gemini Response (Code)**
```javascript
const data = $input.first().json;
const prev = $('Build Gemini Request').first().json;

const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
let parsed;
try {
  parsed = JSON.parse(raw);
} catch (e) {
  const match = raw.match(/\{[\s\S]*\}/);
  parsed = match ? JSON.parse(match[0]) : { description: raw, ui_elements: [] };
}

const description = parsed.description || '';
const elements = parsed.ui_elements || [];
const callouts = elements.map((el, idx) => ({
  step_id: prev.step_id,
  callout_number: idx + 1,
  label: el.label || `Element ${idx + 1}`,
  element_type: el.element_type || 'button',
  target_x: Math.round(el.target_x || 0),
  target_y: Math.round(el.target_y || 0),
  gemini_region_hint: el.region_hint || '',
  confidence: 'gemini_only',
  match_method: 'gemini_coordinates',
}));

return [{
  json: {
    step_id: prev.step_id,
    sequence: prev.sequence,
    gemini_description: description,
    callouts: callouts,
    callout_count: callouts.length,
  }
}];
```

**Update SOP Step**
```
PATCH {SUPABASE_URL}/rest/v1/sop_steps?id=eq.{step_id}
Headers: Prefer: return=minimal
Body: { "gemini_description": "{{ $json.gemini_description }}" }
```

**Insert Step Callouts**
```
POST {SUPABASE_URL}/rest/v1/step_callouts
Headers: Prefer: return=minimal
Body: {{ JSON.stringify($('Parse Gemini Response').first().json.callouts) }}
```
> If callouts is `[]`, Supabase returns 201 with no rows inserted — this is fine.

**Update Pipeline Run**
```
PATCH {SUPABASE_URL}/rest/v1/pipeline_runs?id=eq.{pipeline_run_id}
Body:
{
  "status": "generating_annotations",
  "current_stage": "gemini_classification_complete",
  "stage_results": {
    "gemini_classification": {
      "steps_classified": N,
      "total_callouts": M
    }
  }
}
```

---

### Testing

**1. Ensure a test SOP is in classifying_frames:**
```sql
-- Check if you have steps ready
SELECT id, sequence, screenshot_url, frame_classification, gemini_description
FROM sop_steps
WHERE sop_id = 'your-sop-uuid'
ORDER BY sequence;

-- Reset pipeline for testing
UPDATE pipeline_runs
SET status = 'classifying_frames'
WHERE sop_id = 'your-sop-uuid';

-- Clear previous Gemini results if re-testing
UPDATE sop_steps SET gemini_description = NULL WHERE sop_id = 'your-sop-uuid';
DELETE FROM step_callouts WHERE step_id IN (
  SELECT id FROM sop_steps WHERE sop_id = 'your-sop-uuid'
);
```

**2. In n8n → Workflow 3 → Test workflow**

Each Gemini call takes ~3-10s. A 15-step SOP takes ~1-2 minutes total.

**3. Verify results:**
```sql
-- Check descriptions written
SELECT sequence, LEFT(gemini_description, 80) as description
FROM sop_steps
WHERE sop_id = 'your-sop-uuid'
ORDER BY sequence;

-- Check callouts created
SELECT s.sequence, c.callout_number, c.label, c.element_type, c.target_x, c.target_y
FROM step_callouts c
JOIN sop_steps s ON c.step_id = s.id
WHERE s.sop_id = 'your-sop-uuid'
ORDER BY s.sequence, c.callout_number;

-- Check pipeline advanced
SELECT status, stage_results
FROM pipeline_runs
WHERE sop_id = 'your-sop-uuid';
-- Expected: status = 'generating_annotations'
```

---

### Common Issues & Fixes

| Issue | Likely Cause | Fix |
|-------|-------------|-----|
| `Call Gemini Vision` 400 error | base64 data is empty | Check Download Frame Image — ensure `responseFormat: file` is set |
| `Call Gemini Vision` 429 rate limit | Too many requests | Add Wait node (5s) between calls, or reduce batch frequency |
| `Parse Gemini Response` JSON parse error | Gemini returned markdown-wrapped JSON | The code strips markdown — but increase temperature to 0.0 if recurring |
| `Insert Step Callouts` 409 Conflict | Callouts already exist for this step | `DELETE FROM step_callouts WHERE step_id = '...'` and re-test |
| `Update SOP Step` 0 rows updated | step_id expression wrong | Check `$('Parse Gemini Response').first().json.step_id` is correct UUID |
| `Get SOP Steps` returns empty | Steps already have gemini_description | The query filters `gemini_description=is.null` — steps already classified are skipped |
| `Split Steps` done immediately | No null-description useful steps | Workflow completes correctly — advances to generating_annotations |

---

### Validation Checklist

```
Setup:
- [ ] Workflow 3 JSON imported (delete old version first)
- [ ] Setup Config — GEMINI_API_KEY filled in
- [ ] Workflow activated

Test:
- [ ] pipeline_run reset to status=classifying_frames
- [ ] Workflow triggered (manual test)
- [ ] All 16 nodes green in execution view
- [ ] sop_steps.gemini_description populated for each useful step
- [ ] step_callouts rows in Supabase (1-5 per step typically)
- [ ] step_callouts have valid target_x, target_y coordinates
- [ ] pipeline_runs.status = generating_annotations
```

### Status: ⬜ Pending
