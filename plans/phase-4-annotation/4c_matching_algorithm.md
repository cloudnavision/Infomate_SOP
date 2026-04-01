# Phase 4c: Levenshtein Matching Algorithm

### Objective
Connect Gemini's semantic element labels (WHAT) to Vision OCR's bounding boxes (WHERE). Use Levenshtein edit distance to fuzzy-match labels even when OCR text doesn't exactly equal the Gemini label. Output final `(target_x, target_y)` + `confidence` per callout.

---

### Confidence Levels

| Confidence | Condition | React colour | Expected % |
|------------|-----------|--------------|------------|
| `ocr_exact` | Label exactly matches OCR text (or contains/included by) | 🟢 Green | ~65-70% |
| `ocr_fuzzy` | Levenshtein distance ≤ 30% of label length | 🟡 Amber | ~20% |
| `gemini_only` | No OCR match found — use Gemini coordinates or region hint estimate | 🔴 Red | ~10-15% |

---

### Algorithm (n8n Code Node)

**Node name:** "Run Matching Algorithm"
**Position:** After "Call Vision OCR", before "Update SOP Step"

```javascript
const geminiData = $('Parse Gemini Response').first().json;
const visionData = $input.first().json;

const textAnnotations = visionData.responses?.[0]?.textAnnotations || [];
// Skip index 0 (full text block) — use individual word annotations
const ocrWords = textAnnotations.slice(1);

const imgWidth = geminiData.screenshot_width || 1920;
const imgHeight = geminiData.screenshot_height || 1080;

// ── Levenshtein distance ──────────────────────────────────────────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m + 1}, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i-1][j] + 1,
        dp[i][j-1] + 1,
        dp[i-1][j-1] + (a[i-1] !== b[j-1] ? 1 : 0)
      );
    }
  }
  return dp[m][n];
}

// ── Region hint → approximate coords (fallback) ───────────────────────────────
function regionToApproxCoords(hint, w, h) {
  let x = w * 0.5, y = h * 0.5;
  const lower = (hint || '').toLowerCase();
  if (lower.includes('left'))   x = w * 0.15;
  if (lower.includes('right'))  x = w * 0.85;
  if (lower.includes('top'))    y = h * 0.15;
  if (lower.includes('bottom')) y = h * 0.85;
  if (lower.includes('center') || lower.includes('middle')) { x = w * 0.5; y = h * 0.5; }
  return { x: Math.round(x), y: Math.round(y) };
}

// ── Match each Gemini element → OCR bounding box ──────────────────────────────
const elements = geminiData.callouts || [];

const matchedCallouts = elements.map(el => {
  const label = (el.label || '').toLowerCase().trim();
  let bestMatch = null;
  let bestScore = Infinity;
  let confidence = 'gemini_only';
  let matchMethod = 'gemini_coordinates';

  for (const ocr of ocrWords) {
    const ocrText = (ocr.description || '').toLowerCase().trim();
    if (!ocrText) continue;

    const vertices = ocr.boundingPoly?.vertices || [];
    if (vertices.length < 3) continue;
    const cx = Math.round(((vertices[0].x || 0) + (vertices[2].x || 0)) / 2);
    const cy = Math.round(((vertices[0].y || 0) + (vertices[2].y || 0)) / 2);

    // Exact / substring match
    if (ocrText === label || label.includes(ocrText) || ocrText.includes(label)) {
      if (!bestMatch || ocrText.length > (bestMatch.text || '').length) {
        bestMatch = { x: cx, y: cy, text: ocrText };
        confidence = 'ocr_exact';
        matchMethod = 'ocr_exact_text';
        bestScore = 0;
      }
      continue;
    }

    // Fuzzy match via Levenshtein
    if (bestScore === 0) continue; // already exact — skip fuzzy
    const dist = levenshtein(ocrText, label);
    const threshold = Math.max(2, Math.floor(label.length * 0.3));
    if (dist <= threshold && dist < bestScore) {
      bestMatch = { x: cx, y: cy, text: ocrText };
      confidence = 'ocr_fuzzy';
      matchMethod = 'ocr_fuzzy_text';
      bestScore = dist;
    }
  }

  // Fallback: use Gemini pixel estimate if available, else region hint
  let coords;
  if (bestMatch) {
    coords = { x: bestMatch.x, y: bestMatch.y };
  } else if (el.target_x > 0 || el.target_y > 0) {
    coords = { x: el.target_x, y: el.target_y };
    matchMethod = 'gemini_coordinates';
  } else {
    coords = regionToApproxCoords(el.gemini_region_hint, imgWidth, imgHeight);
    matchMethod = 'gemini_region_estimate';
  }

  return {
    step_id: el.step_id,
    callout_number: el.callout_number,
    label: el.label,
    element_type: el.element_type,
    target_x: coords.x,
    target_y: coords.y,
    gemini_region_hint: el.gemini_region_hint,
    confidence: confidence,
    match_method: matchMethod,
    ocr_matched_text: bestMatch ? bestMatch.text : null,
  };
});

return [{
  json: {
    step_id: geminiData.step_id,
    sequence: geminiData.sequence,
    gemini_description: geminiData.gemini_description,
    callouts: matchedCallouts,
    callout_count: matchedCallouts.length,
    ocr_word_count: ocrWords.length,
  }
}];
```

---

### DB Output (step_callouts)

```json
{
  "step_id": "uuid",
  "callout_number": 1,
  "label": "Double-click 'Credit Check' folder",
  "element_type": "folder",
  "target_x": 450,
  "target_y": 320,
  "gemini_region_hint": "center of screen, Windows Explorer",
  "confidence": "ocr_exact",
  "match_method": "ocr_exact_text",
  "ocr_matched_text": "credit check"
}
```

---

### Why Levenshtein threshold = 30% of label length?

Short labels (4 chars): threshold = 2 — tight matching, avoids false positives
Medium labels (10 chars): threshold = 3 — allows minor OCR noise
Long labels (20 chars): threshold = 6 — handles OCR splitting across words

This dynamic threshold balances precision vs recall across label lengths.

---

### Status: ⬜ Pending
