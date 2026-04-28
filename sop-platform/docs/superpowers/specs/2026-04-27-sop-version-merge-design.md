# SOP Version Merge — Design Spec
**Date:** 2026-04-27
**Feature:** Compare original vs updated SOP recording, approve step-level changes, produce a new merged SOP

---

## Problem

A KT process is recorded once (Recording 1). After a system change or process update, the same process is re-recorded (Recording 2). Both recordings generate their own SOP through the existing pipeline. The platform needs a way to:
1. Identify that Recording 2 is an updated version of Recording 1
2. Compare their generated SOPs step by step (using Gemini for semantic matching)
3. Show a diff to an editor/admin for review and approval
4. Produce a new SOP record that represents the final merged/updated version

---

## Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| How to link related SOPs? | `project_code` text tag on `sops` table | Simple, no pipeline changes, user-controlled grouping |
| Where is project_code set? | Manually on SOP detail page (editor/admin) | No need to touch n8n or upload flow |
| Comparison method | Gemini semantic diff via extractor | Sequential index matching would miss step reordering; Gemini handles semantic equivalence |
| Diff stored where? | `sop_merge_sessions` DB table | Browser state is lost on refresh; merge can take minutes |
| Final merged output | New SOP record (status=draft) | Original SOPs stay untouched; merged SOP is a normal SOP |
| Who can merge? | Editor + Admin only | Same as other write operations |
| Recording 2 pipeline | Unchanged — same n8n pipeline as any SOP | No special handling needed |
| Merge Dashboard | Separate route `/merge` | Keeps merge workflow isolated from main dashboard |

---

## User Flow

```
SOP Detail Page (Recording 1 or 2)
  └─ Editor sets project_code: "AGED-001"
       (both Recording 1 SOP and Recording 2 SOP get same code)

Dashboard
  └─ "Merge SOPs" button (editor/admin only)
       │
       ▼
/merge  — lists project groups
  - Groups SOPs by project_code where count ≥ 2
  - Shows group name (project_code), SOP titles, recording dates
  - "Start Merge →" button per group

       │
       ▼
/merge/new?base=<sop_id>&updated=<sop_id>
  - Triggers Gemini comparison (POST /api/merge/compare)
  - Creates sop_merge_session record (status=reviewing)
  - Redirects to /merge/:session_id

       │
       ▼
/merge/:session_id  — Diff Review
  - 2-column layout: Base SOP (left) | Updated SOP (right)
  - Step cards colour-coded:
      GREEN  = added in updated (auto-included, editor can exclude)
      YELLOW = changed (editor must Accept new / Keep original)
      RED    = removed in updated (editor can restore or discard)
      GREY   = unchanged (always included)
  - Each changed step shows: old description vs new description side-by-side
  - "Accept new version" / "Keep original" buttons per yellow step
  - "Next: Preview →" button (enabled when all yellow steps resolved)

       │
       ▼
/merge/:session_id/preview  — Final Preview
  - Flat step list of the approved merged result with continuous numbering
  - Shows which steps came from base vs updated (small badge)
  - "Create Merged SOP" button
  - Creates new SOP record → redirects to /sops/:new_id

       │
       ▼
New SOP (status=draft)
  - title: "{original_title} (Updated)"
  - project_code: inherited from group
  - steps: the approved merged set
  - Can be exported, reviewed, published normally
```

---

## DB Changes

### 1. `sops` table — new column
```sql
ALTER TABLE sops ADD COLUMN project_code VARCHAR(50) NULL;
CREATE INDEX idx_sops_project_code ON sops(project_code) WHERE project_code IS NOT NULL;
```

### 2. New `sop_merge_sessions` table
```sql
CREATE TABLE sop_merge_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES users(id),
    base_sop_id UUID NOT NULL REFERENCES sops(id),
    updated_sop_id UUID NOT NULL REFERENCES sops(id),
    merged_sop_id UUID REFERENCES sops(id),   -- set after merge is complete
    status TEXT NOT NULL DEFAULT 'reviewing',  -- reviewing | merged | abandoned
    diff_result JSONB,                          -- Gemini structured diff
    approved_changes JSONB                      -- editor's final decisions
);
```

---

## Gemini Diff Contract

### Request to extractor `POST /api/compare-sops`
```json
{
  "base_steps": [
    { "id": "uuid-1", "sequence": 1, "title": "Login to NavAcc", "description": "..." }
  ],
  "updated_steps": [
    { "id": "uuid-a", "sequence": 1, "title": "Login to NavAcc", "description": "..." },
    { "id": "uuid-b", "sequence": 2, "title": "Select Company", "description": "..." }
  ]
}
```

### Response
```json
{
  "matches": [
    {
      "status": "unchanged",
      "base_step_id": "uuid-1",
      "updated_step_id": "uuid-a"
    },
    {
      "status": "added",
      "base_step_id": null,
      "updated_step_id": "uuid-b"
    },
    {
      "status": "changed",
      "base_step_id": "uuid-3",
      "updated_step_id": "uuid-c",
      "change_summary": "Step description updated — button label changed from 'Save' to 'Save & Submit'"
    },
    {
      "status": "removed",
      "base_step_id": "uuid-5",
      "updated_step_id": null
    }
  ]
}
```

---

## API Contract

> All merge routes use prefix `/api/merge/` (separate router) to avoid FastAPI path-param conflicts with `/api/sops/{sop_id}`.

### `PATCH /api/sops/{sop_id}/project-code`
**Auth:** `require_editor`
**Body:** `{ "project_code": "AGED-001" }` — Pydantic schema: `ProjectCodeUpdate`
**Response:** updated SOP (includes `project_code` field)

### `GET /api/merge/groups`
**Auth:** `require_editor`
**Response:** list of project groups with ≥2 SOPs
```json
[
  {
    "project_code": "AGED-001",
    "sops": [
      { "id": "uuid-1", "title": "Aged Debtor Process", "meeting_date": "2026-03-01" },
      { "id": "uuid-2", "title": "Aged Debtor Process", "meeting_date": "2026-04-15" }
    ]
  }
]
```

### `POST /api/merge/compare`
**Auth:** `require_editor`
**Body:** `{ "base_sop_id": "uuid-1", "updated_sop_id": "uuid-2" }`
**Logic:**
1. Check: if an active session (status=reviewing) already exists for this base+updated pair → return existing session (no duplicate)
2. Load both SOPs (steps eager-loaded)
3. POST steps to extractor `/api/compare-sops`
4. Create `sop_merge_session` record (status=reviewing, diff_result=Gemini response)
5. Return session_id + diff

### `POST /api/merge/sessions/{session_id}/finalize`
**Auth:** `require_editor`
**Body:** `{ "approved_changes": [...] }` — editor's final step decisions
**Logic:**
1. Build merged step list from approved_changes
2. Create new SOP record (status=draft, project_code inherited)
3. Copy approved steps to new SOP (new step records)
4. Update merge_session: merged_sop_id, status=merged
5. Return new SOP id

---

## File Map

| File | Change |
|---|---|
| `api/app/schemas.py` | Add `ProjectCodeUpdate`, `MergeCompareBody`, `MergeSessionResponse`, `MergeFinalizeBody` |
| `api/app/routes/merge.py` | **New** — all merge endpoints (router prefix `/api/merge`) |
| `api/app/main.py` | Register `merge.router` (before `sops.router` to avoid path conflicts) |
| `api/app/models.py` | Add `SOPMergeSession` model |
| `extractor/app/main.py` | Add `POST /api/compare-sops` |
| `extractor/app/sop_comparator.py` | **New** — Gemini comparison logic |
| `frontend/src/api/types.ts` | Add `project_code: string \| null` to `SOPListItem` + `SOPDetail`; add merge types |
| `frontend/src/api/client.ts` | Add merge API functions |
| `frontend/src/routes/merge.tsx` | **New** — `/merge` groups list |
| `frontend/src/routes/merge.$sessionId.tsx` | **New** — diff review wizard (TanStack Router dynamic segment) |
| `frontend/src/routes/merge.$sessionId.preview.tsx` | **New** — final preview + create merged SOP |
| `frontend/src/routes/sop.$id.overview.tsx` | Add project_code field (editor/admin) |
| `frontend/src/routes/dashboard.tsx` | Add "Merge SOPs" button (editor/admin) |
| Supabase migration | `project_code` column on `sops` + `sop_merge_sessions` table |

---

## Extractor: `sop_comparator.py` Logic

```python
COMPARE_PROMPT = """
You are comparing two versions of an SOP (Standard Operating Procedure).
Base SOP steps: {base_steps_json}
Updated SOP steps: {updated_steps_json}

Match each base step to the most semantically similar updated step.
Return ONLY valid JSON with no markdown formatting, no code fences, no explanation.
The JSON must have a single key "matches" containing an array. Each item must have:
- status: "unchanged" | "changed" | "added" | "removed"
- base_step_id: string or null
- updated_step_id: string or null
- change_summary: string (only for "changed" status, 1 sentence; omit for others)

Rules:
- A step is "unchanged" if title and description are functionally identical
- A step is "changed" if the same action is described but with different details
- A step is "added" if it appears only in the updated SOP
- A step is "removed" if it appears only in the base SOP
- Each step ID appears in at most one match
"""
# Note: call Gemini with response_mime_type="application/json" to enforce JSON-only output
```

---

## What's NOT in scope
- Automatic detection that Recording 2 is related to Recording 1 (user sets project_code manually)
- Version chains longer than 2 (base + one update per merge session)
- Diff of screenshots (text content only)
- Merge of sections/watchlist/process maps (steps only in MVP)
- `export_history` for merged SOP creation
