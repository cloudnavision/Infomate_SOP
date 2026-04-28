# SOP Version Merge — Implementation Plan
**Date:** 2026-04-27
**Spec:** `docs/superpowers/specs/2026-04-27-sop-version-merge-design.md`
**Feature:** Compare original vs updated SOP, approve step-level changes, produce a merged SOP

---

## File Map

| File | Action |
|---|---|
| `schema/004_sop_version_merge.sql` | **New** — DB migration |
| `api/app/models.py` | Add `project_code` to `SOP`; add `SOPMergeSession` model |
| `api/app/schemas.py` | Add `project_code` to `SOPListItem`+`SOPDetail`; add merge schemas |
| `api/app/routes/merge.py` | **New** — all merge endpoints (prefix `/api/merge`) |
| `api/app/main.py` | Register `merge.router` before `sops.router` |
| `extractor/requirements.txt` | Add `google-generativeai>=0.8.0` |
| `extractor/app/sop_comparator.py` | **New** — Gemini diff logic |
| `extractor/app/main.py` | Add `POST /api/compare-sops` endpoint |
| `frontend/src/api/types.ts` | Add `project_code` to `SOPListItem`+`SOPDetail`; add merge types |
| `frontend/src/api/client.ts` | Add merge API functions |
| `frontend/src/routes/sop.$id.overview.tsx` | Add project_code field (editor/admin) |
| `frontend/src/routes/dashboard.tsx` | Add "Merge SOPs" button (editor/admin) |
| `frontend/src/routes/merge.tsx` | **New** — `/merge` groups list |
| `frontend/src/routes/merge.$sessionId.tsx` | **New** — diff review wizard |
| `frontend/src/routes/merge.$sessionId.preview.tsx` | **New** — final preview + create merged SOP |

---

## Tasks

### Task 1 — DB migration (2 min)

**New file:** `schema/004_sop_version_merge.sql`

```sql
-- Migration 004: SOP Version Merge
-- Run in Supabase SQL editor

ALTER TABLE sops
  ADD COLUMN IF NOT EXISTS project_code VARCHAR(50) NULL;

CREATE INDEX IF NOT EXISTS idx_sops_project_code
  ON sops(project_code) WHERE project_code IS NOT NULL;

COMMENT ON COLUMN sops.project_code IS
  'Groups related SOP recordings as versions of the same process (e.g. AGED-001)';

CREATE TABLE IF NOT EXISTS sop_merge_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES users(id),
    base_sop_id UUID NOT NULL REFERENCES sops(id),
    updated_sop_id UUID NOT NULL REFERENCES sops(id),
    merged_sop_id UUID REFERENCES sops(id),
    status TEXT NOT NULL DEFAULT 'reviewing',   -- reviewing | merged | abandoned
    diff_result JSONB,
    approved_changes JSONB
);
```

**Action:** Run this SQL in the Supabase SQL editor.

**Verify:** In Supabase Table Editor, confirm `sops` has a `project_code` column and `sop_merge_sessions` table exists.

Commit: `feat: migration 004 — project_code on sops + sop_merge_sessions table`

---

### Task 2 — Backend model: project_code + SOPMergeSession (3 min)

**File:** `api/app/models.py`

**2a — Add `project_code` to SOP** (after `template_id`, around line 131):
```python
    # Project code — groups related recordings as versions of the same process
    project_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
```

**2b — Add SOPMergeSession model** (after ExportHistory, around line 497):
```python
class SOPMergeSession(Base):
    __tablename__ = "sop_merge_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()")
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("users.id"))
    base_sop_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sops.id"))
    updated_sop_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sops.id"))
    merged_sop_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("sops.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), server_default=text("'reviewing'"))
    diff_result: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)
    approved_changes: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)
```

Commit: `feat: SOPMergeSession model + project_code on SOP`

---

### Task 3 — Backend schemas (4 min)

**File:** `api/app/schemas.py`

**3a — Add `project_code` to `SOPListItem`** (after `tags: list[dict] = []`, line 235):
```python
    project_code: Optional[str] = None
```

**3b — Add `project_code` to `SOPDetail`** (after `process_map_config: Optional[Any] = None`, line 266):
```python
    project_code: Optional[str] = None
```

**3c — Add merge schemas** (after `CombineExportBody`, before `ExportResponse`):
```python
class ProjectCodeUpdate(BaseModel):
    project_code: Optional[str] = None   # None = clear the code


class MergeCompareBody(BaseModel):
    base_sop_id: str
    updated_sop_id: str


class MergeMatch(BaseModel):
    status: str                          # unchanged | changed | added | removed
    base_step_id: Optional[str] = None
    updated_step_id: Optional[str] = None
    change_summary: Optional[str] = None


class MergeSessionResponse(BaseModel):
    session_id: str
    status: str
    base_sop_id: str
    updated_sop_id: str
    merged_sop_id: Optional[str] = None
    matches: list[MergeMatch] = []


class MergeStepDecision(BaseModel):
    step_id: str      # ID from base or updated SOP
    source: str       # "base" or "updated"


class MergeFinalizeBody(BaseModel):
    steps: list[MergeStepDecision]   # ordered final step list
```

Commit: `feat: merge schemas — ProjectCodeUpdate, MergeCompareBody, MergeSessionResponse, MergeFinalizeBody`

---

### Task 4 — Backend merge routes (5 min)

**New file:** `api/app/routes/merge.py`

```python
"""
SOP Version Merge routes — Phase: version merge
GET  /api/merge/groups            — list project groups with 2+ SOPs
POST /api/merge/compare           — trigger Gemini diff, create session
GET  /api/merge/sessions/{id}     — get session + diff
POST /api/merge/sessions/{id}/finalize — approve changes, create merged SOP
PATCH /api/sops/{id}/project-code — set project_code on a SOP
"""
import uuid
from datetime import datetime
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.dependencies.auth import require_editor
from app.models import SOP, SOPStatus, SOPStep, SOPMergeSession, User
from app.schemas import (
    ProjectCodeUpdate, MergeCompareBody, MergeSessionResponse,
    MergeMatch, MergeFinalizeBody, SOPListItem,
)

router = APIRouter(prefix="/api", tags=["merge"])


# ── PATCH /api/sops/{sop_id}/project-code ────────────────────────────────────

@router.patch("/sops/{sop_id}/project-code")
async def set_project_code(
    sop_id: uuid.UUID,
    body: ProjectCodeUpdate,
    current_user: Annotated[User, Depends(require_editor)],
    db: AsyncSession = Depends(get_db),
) -> dict:
    sop = (await db.execute(select(SOP).where(SOP.id == sop_id))).scalar_one_or_none()
    if sop is None:
        raise HTTPException(status_code=404, detail="SOP not found")
    sop.project_code = body.project_code
    await db.commit()
    return {"sop_id": str(sop_id), "project_code": sop.project_code}


# ── GET /api/merge/groups ─────────────────────────────────────────────────────

@router.get("/merge/groups")
async def list_merge_groups(
    current_user: Annotated[User, Depends(require_editor)],
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Return all project_code groups that have 2+ SOPs."""
    stmt = (
        select(SOP)
        .where(SOP.project_code.isnot(None))
        .order_by(SOP.project_code, SOP.meeting_date)
    )
    sops = list((await db.execute(stmt)).scalars().all())

    groups: dict[str, list] = {}
    for sop in sops:
        code = sop.project_code
        if code not in groups:
            groups[code] = []
        groups[code].append({
            "id": str(sop.id),
            "title": sop.title,
            "status": sop.status.value,
            "meeting_date": str(sop.meeting_date) if sop.meeting_date else None,
            "client_name": sop.client_name,
        })

    return [
        {"project_code": code, "sops": sop_list}
        for code, sop_list in groups.items()
        if len(sop_list) >= 2
    ]


# ── POST /api/merge/compare ───────────────────────────────────────────────────

@router.post("/merge/compare", response_model=MergeSessionResponse)
async def compare_sops(
    body: MergeCompareBody,
    current_user: Annotated[User, Depends(require_editor)],
    db: AsyncSession = Depends(get_db),
) -> MergeSessionResponse:
    """Trigger Gemini diff between two SOPs. Returns existing session if already started."""
    base_id = uuid.UUID(body.base_sop_id)
    updated_id = uuid.UUID(body.updated_sop_id)

    # Check for existing active session (prevent duplicates)
    existing = (await db.execute(
        select(SOPMergeSession)
        .where(
            SOPMergeSession.base_sop_id == base_id,
            SOPMergeSession.updated_sop_id == updated_id,
            SOPMergeSession.status == "reviewing",
        )
    )).scalar_one_or_none()

    if existing:
        matches = [MergeMatch(**m) for m in (existing.diff_result or {}).get("matches", [])]
        return MergeSessionResponse(
            session_id=str(existing.id),
            status=existing.status,
            base_sop_id=str(existing.base_sop_id),
            updated_sop_id=str(existing.updated_sop_id),
            merged_sop_id=str(existing.merged_sop_id) if existing.merged_sop_id else None,
            matches=matches,
        )

    # Load both SOPs with steps
    def load_sop_steps(sop_id: uuid.UUID):
        return (
            select(SOP)
            .where(SOP.id == sop_id)
            .options(selectinload(SOP.steps))
        )

    base_sop = (await db.execute(load_sop_steps(base_id))).scalar_one_or_none()
    updated_sop = (await db.execute(load_sop_steps(updated_id))).scalar_one_or_none()

    if base_sop is None:
        raise HTTPException(status_code=404, detail=f"Base SOP {body.base_sop_id} not found")
    if updated_sop is None:
        raise HTTPException(status_code=404, detail=f"Updated SOP {body.updated_sop_id} not found")

    base_sop.steps.sort(key=lambda s: s.sequence)
    updated_sop.steps.sort(key=lambda s: s.sequence)

    base_steps = [
        {"id": str(s.id), "sequence": s.sequence, "title": s.title, "description": s.description or ""}
        for s in base_sop.steps
    ]
    updated_steps = [
        {"id": str(s.id), "sequence": s.sequence, "title": s.title, "description": s.description or ""}
        for s in updated_sop.steps
    ]

    # Call extractor /api/compare-sops
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{settings.extractor_url}/api/compare-sops",
                json={"base_steps": base_steps, "updated_steps": updated_steps},
            )
            resp.raise_for_status()
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=503, detail="Comparison timed out") from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Extractor error: {exc}") from exc

    diff_result = resp.json()

    # Create session
    session = SOPMergeSession(
        base_sop_id=base_id,
        updated_sop_id=updated_id,
        created_by=current_user.id,
        status="reviewing",
        diff_result=diff_result,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    matches = [MergeMatch(**m) for m in diff_result.get("matches", [])]
    return MergeSessionResponse(
        session_id=str(session.id),
        status=session.status,
        base_sop_id=str(base_id),
        updated_sop_id=str(updated_id),
        matches=matches,
    )


# ── GET /api/merge/sessions/{session_id} ─────────────────────────────────────

@router.get("/merge/sessions/{session_id}", response_model=MergeSessionResponse)
async def get_session(
    session_id: uuid.UUID,
    current_user: Annotated[User, Depends(require_editor)],
    db: AsyncSession = Depends(get_db),
) -> MergeSessionResponse:
    session = (await db.execute(
        select(SOPMergeSession).where(SOPMergeSession.id == session_id)
    )).scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    matches = [MergeMatch(**m) for m in (session.diff_result or {}).get("matches", [])]
    return MergeSessionResponse(
        session_id=str(session.id),
        status=session.status,
        base_sop_id=str(session.base_sop_id),
        updated_sop_id=str(session.updated_sop_id),
        merged_sop_id=str(session.merged_sop_id) if session.merged_sop_id else None,
        matches=matches,
    )


# ── POST /api/merge/sessions/{session_id}/finalize ───────────────────────────

@router.post("/merge/sessions/{session_id}/finalize")
async def finalize_merge(
    session_id: uuid.UUID,
    body: MergeFinalizeBody,
    current_user: Annotated[User, Depends(require_editor)],
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a new merged SOP from the approved step decisions."""
    session = (await db.execute(
        select(SOPMergeSession).where(SOPMergeSession.id == session_id)
    )).scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status == "merged":
        raise HTTPException(status_code=409, detail="Session already merged")

    # Load base and updated SOPs (steps + metadata)
    def load_full(sop_id: uuid.UUID):
        return select(SOP).where(SOP.id == sop_id).options(selectinload(SOP.steps))

    base_sop = (await db.execute(load_full(session.base_sop_id))).scalar_one()
    updated_sop = (await db.execute(load_full(session.updated_sop_id))).scalar_one()

    step_map: dict[str, SOPStep] = {}
    for s in base_sop.steps:
        step_map[str(s.id)] = s
    for s in updated_sop.steps:
        step_map[str(s.id)] = s

    # Create new merged SOP
    merged_sop = SOP(
        title=f"{base_sop.title} (Updated)",
        status=SOPStatus.draft,
        client_name=base_sop.client_name,
        process_name=base_sop.process_name,
        meeting_date=updated_sop.meeting_date,
        project_code=base_sop.project_code,
        created_by=current_user.id,
    )
    db.add(merged_sop)
    await db.flush()   # get merged_sop.id

    # Copy approved steps
    for seq, decision in enumerate(body.steps, start=1):
        source_step = step_map.get(decision.step_id)
        if source_step is None:
            raise HTTPException(
                status_code=400,
                detail=f"Step {decision.step_id} not found in base or updated SOP",
            )
        new_step = SOPStep(
            sop_id=merged_sop.id,
            sequence=seq,
            title=source_step.title,
            description=source_step.description,
            sub_steps=source_step.sub_steps,
            timestamp_start=source_step.timestamp_start,
            timestamp_end=source_step.timestamp_end,
            screenshot_url=source_step.screenshot_url,
            annotated_screenshot_url=source_step.annotated_screenshot_url,
            screenshot_width=source_step.screenshot_width,
            screenshot_height=source_step.screenshot_height,
        )
        db.add(new_step)

    # Mark session merged
    session.merged_sop_id = merged_sop.id
    session.status = "merged"
    session.approved_changes = [d.model_dump() for d in body.steps]

    await db.commit()
    return {"merged_sop_id": str(merged_sop.id)}
```

**Also update** `api/app/main.py` — add import and register merge router BEFORE sops router (line 24–54):
```python
# line 24: change import to include merge
from app.routes import sops, steps, sections, auth, users, exports, merge

# After auth router registration (line 43), add before sops.router:
# ── Merge Routes (SOP Version Merge) ─────────────────────────────────────────
app.include_router(merge.router)

# existing line:
app.include_router(sops.router)
```

Commit: `feat: /api/merge/* endpoints + register merge router`

---

### Task 5 — Extractor: google-generativeai + sop_comparator.py (5 min)

**File:** `extractor/requirements.txt` — add after `httpx`:
```
google-generativeai>=0.8.0
```

**New file:** `extractor/app/sop_comparator.py`

```python
"""Compare two SOPs step-by-step using Gemini semantic analysis."""
import json
import logging
import os

import google.generativeai as genai

logger = logging.getLogger(__name__)

_PROMPT = """You are comparing two versions of a Standard Operating Procedure (SOP).

Base SOP steps (original recording):
{base_steps_json}

Updated SOP steps (newer recording):
{updated_steps_json}

Match each step semantically. Return ONLY valid JSON with no markdown, no code fences.
The JSON must have one key "matches" containing an array.

Each item must have:
- "status": one of "unchanged" | "changed" | "added" | "removed"
- "base_step_id": string (null for "added" steps)
- "updated_step_id": string (null for "removed" steps)
- "change_summary": string (1 sentence, only for "changed" — omit for others)

Rules:
- "unchanged": title and description are functionally identical
- "changed": same action, different details (e.g. button label changed, new field added)
- "added": appears only in updated SOP (base_step_id is null)
- "removed": appears only in base SOP (updated_step_id is null)
- Each step ID appears in at most one match
- Preserve the logical order of the process
"""


def compare_sop_steps(base_steps: list[dict], updated_steps: list[dict]) -> dict:
    """
    Call Gemini to semantically compare two lists of SOP steps.
    Returns {"matches": [...]} structured diff.
    """
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set in environment")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name="gemini-2.0-flash",
        generation_config={"response_mime_type": "application/json"},
    )

    prompt = _PROMPT.format(
        base_steps_json=json.dumps(base_steps, indent=2),
        updated_steps_json=json.dumps(updated_steps, indent=2),
    )

    try:
        response = model.generate_content(prompt)
        raw = response.text.strip()
        result = json.loads(raw)
        if "matches" not in result:
            raise ValueError("Gemini response missing 'matches' key")
        logger.info(
            "SOP compare: base=%d steps, updated=%d steps, matches=%d",
            len(base_steps), len(updated_steps), len(result["matches"]),
        )
        return result
    except json.JSONDecodeError as exc:
        logger.error("Gemini returned invalid JSON: %s", exc)
        raise RuntimeError(f"Gemini returned invalid JSON: {exc}") from exc
```

Commit: `feat: sop_comparator.py — Gemini semantic step diff`

---

### Task 6 — Extractor: /api/compare-sops endpoint (3 min)

**File:** `extractor/app/main.py`

Add Pydantic model (after `RenderAnnotatedResponse`, around line 164):
```python
# ── /api/compare-sops models ──────────────────────────────────────────────────

class CompareSopsRequest(BaseModel):
    base_steps: list[dict]      # [{id, sequence, title, description}]
    updated_steps: list[dict]
```

Add endpoint (after the `/api/render-annotated` endpoint, around line 283):
```python
# ── /api/compare-sops ────────────────────────────────────────────────────────

@app.post("/api/compare-sops", tags=["merge"])
async def compare_sops(req: CompareSopsRequest) -> dict:
    """
    Compare two SOPs step-by-step using Gemini semantic analysis.
    Returns {"matches": [{status, base_step_id, updated_step_id, change_summary?}]}
    """
    from .sop_comparator import compare_sop_steps
    try:
        result = await asyncio.to_thread(
            compare_sop_steps,
            base_steps=req.base_steps,
            updated_steps=req.updated_steps,
        )
        return result
    except Exception as exc:
        logger.error("compare_sops failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))
```

Commit: `feat: POST /api/compare-sops extractor endpoint`

---

### Task 7 — Frontend types + client (3 min)

**File:** `frontend/src/api/types.ts`

Add `project_code` to `SOPListItem` (after `tags: SOPTag[]`, before the closing `}` of the interface):
```ts
  project_code: string | null
```

Add `project_code` to `SOPDetail` (after `process_map_config: ProcessMapConfig | null`, before `steps:`):
```ts
  project_code: string | null
```

Add merge types (after `CombineExportRequest`):
```ts
export interface MergeMatch {
  status: 'unchanged' | 'changed' | 'added' | 'removed'
  base_step_id: string | null
  updated_step_id: string | null
  change_summary?: string
}

export interface MergeSession {
  session_id: string
  status: string
  base_sop_id: string
  updated_sop_id: string
  merged_sop_id: string | null
  matches: MergeMatch[]
}

export interface MergeStepDecision {
  step_id: string
  source: 'base' | 'updated'
}
```

**File:** `frontend/src/api/client.ts`

Add merge functions (after `exportCombinedSOPs`):
```ts
export const setProjectCode = (sopId: string, projectCode: string | null) =>
  mutateAPI<{ sop_id: string; project_code: string | null }>(
    `/api/sops/${sopId}/project-code`, 'PATCH', { project_code: projectCode }
  )

export const fetchMergeGroups = () =>
  fetchAPI<{ project_code: string; sops: { id: string; title: string; status: string; meeting_date: string | null; client_name: string | null }[] }[]>('/api/merge/groups')

export const compareSops = (baseSopId: string, updatedSopId: string) =>
  mutateAPI<import('./types').MergeSession>('/api/merge/compare', 'POST', {
    base_sop_id: baseSopId,
    updated_sop_id: updatedSopId,
  })

export const fetchMergeSession = (sessionId: string) =>
  fetchAPI<import('./types').MergeSession>(`/api/merge/sessions/${sessionId}`)

export const finalizeMerge = (
  sessionId: string,
  steps: import('./types').MergeStepDecision[],
) =>
  mutateAPI<{ merged_sop_id: string }>(
    `/api/merge/sessions/${sessionId}/finalize`, 'POST', { steps }
  )
```

Also add `MergeMatch, MergeSession, MergeStepDecision` to imports in `client.ts` top-level import from `./types`.

Commit: `feat: merge types + client functions`

---

### Task 8 — Frontend: project_code in overview + dashboard button (4 min)

**File:** `frontend/src/routes/sop.$id.overview.tsx`

Add imports at top (add to existing imports):
```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setProjectCode, sopKeys } from '../api/client'
import { useAuth } from '../hooks/useAuth'
```

Inside `OverviewPage()` function, add after `useQuery`:
```ts
const { appUser } = useAuth()
const canEdit = appUser?.role === 'editor' || appUser?.role === 'admin'
const queryClient = useQueryClient()
const [editingCode, setEditingCode] = useState(false)
const [codeInput, setCodeInput] = useState('')
const projectCodeMutation = useMutation({
  mutationFn: (code: string | null) => setProjectCode(sop?.id ?? '', code),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: sopKeys.detail(id) })
    setEditingCode(false)
  },
})
```

Add project_code UI block just before the sections list (find a logical spot — after the SOP title/metadata area):
```tsx
{/* Project Code */}
<div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
  <div className="flex items-center justify-between">
    <div>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Project Code</p>
      {editingCode ? (
        <div className="flex items-center gap-2 mt-1">
          <input
            value={codeInput}
            onChange={e => setCodeInput(e.target.value.toUpperCase())}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. AGED-001"
            maxLength={50}
          />
          <button
            onClick={() => projectCodeMutation.mutate(codeInput || null)}
            disabled={projectCodeMutation.isPending}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Save
          </button>
          <button onClick={() => setEditingCode(false)} className="text-xs text-gray-400 hover:text-gray-600">
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-sm font-mono font-medium ${sop?.project_code ? 'text-blue-600' : 'text-gray-300'}`}>
            {sop?.project_code || 'None'}
          </span>
          {canEdit && (
            <button
              onClick={() => { setCodeInput(sop?.project_code || ''); setEditingCode(true) }}
              className="text-xs text-gray-400 hover:text-blue-500 underline"
            >
              {sop?.project_code ? 'Edit' : 'Set'}
            </button>
          )}
        </div>
      )}
    </div>
  </div>
</div>
```

**File:** `frontend/src/routes/dashboard.tsx`

Add imports (add to existing imports):
```ts
import { Link } from '@tanstack/react-router'
import { useAuth } from '../hooks/useAuth'
```

Inside `Dashboard()` function, add after `useQuery`:
```ts
const { appUser } = useAuth()
const canMerge = appUser?.role === 'editor' || appUser?.role === 'admin'
```

Add button in the `<h1>` row (wrap the heading + button in a flex div):
```tsx
<div className="flex items-center justify-between mb-6">
  <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
  {canMerge && (
    <Link
      to="/merge"
      className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 transition-colors shadow-sm"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 8a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zm6-6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zm0 8a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" clipRule="evenodd"/>
      </svg>
      Merge SOPs
    </Link>
  )}
</div>
```

Remove the old `<h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>` line.

Commit: `feat: project_code in SOP overview + Merge SOPs button on dashboard`

---

### Task 9 — Frontend: /merge groups list (4 min)

**New file:** `frontend/src/routes/merge.tsx`

```tsx
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { fetchMergeGroups, compareSops } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { ProtectedRoute } from '../components/ProtectedRoute'

export const Route = createFileRoute('/merge')({
  component: () => (
    <ProtectedRoute requiredRole="editor">
      <MergePage />
    </ProtectedRoute>
  ),
})

function MergePage() {
  const navigate = useNavigate()
  const { data: groups, isLoading } = useQuery({
    queryKey: ['merge-groups'],
    queryFn: fetchMergeGroups,
  })

  const compareMutation = useMutation({
    mutationFn: ({ base, updated }: { base: string; updated: string }) =>
      compareSops(base, updated),
    onSuccess: (session) => {
      navigate({ to: '/merge/$sessionId', params: { sessionId: session!.session_id } })
    },
  })

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">← Dashboard</Link>
        <h1 className="text-2xl font-bold text-gray-900">Merge SOPs</h1>
      </div>
      <p className="text-sm text-gray-500">
        SOPs grouped by project code. Select a group to compare and merge the original and updated recordings.
        Set a project code from the SOP's Overview tab.
      </p>

      {isLoading ? (
        <p className="text-gray-400 text-sm">Loading groups…</p>
      ) : !groups?.length ? (
        <div className="bg-white border border-gray-100 rounded-xl p-8 text-center">
          <p className="text-gray-400 text-sm">No merge groups yet.</p>
          <p className="text-gray-300 text-xs mt-1">
            Set the same project code on 2 or more SOPs from their Overview tab to create a group.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => (
            <div key={group.project_code} className="bg-white border border-gray-100 rounded-xl shadow-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-bold text-blue-600 bg-blue-50 border border-blue-100 px-3 py-1 rounded-full">
                  {group.project_code}
                </span>
                <span className="text-xs text-gray-400">{group.sops.length} recordings</span>
              </div>
              <div className="space-y-2">
                {group.sops.map(sop => (
                  <div key={sop.id} className="flex items-center gap-3 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
                    <span className="flex-1 truncate">{sop.title}</span>
                    {sop.meeting_date && <span className="text-xs text-gray-400 shrink-0">{sop.meeting_date}</span>}
                  </div>
                ))}
              </div>
              {group.sops.length === 2 && (
                <button
                  onClick={() => compareMutation.mutate({ base: group.sops[0].id, updated: group.sops[1].id })}
                  disabled={compareMutation.isPending}
                  className="w-full mt-2 px-4 py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {compareMutation.isPending ? 'Analysing…' : 'Compare & Merge →'}
                </button>
              )}
              {group.sops.length > 2 && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  More than 2 SOPs in this group — select 2 to compare from the SOP detail pages directly.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

Commit: `feat: /merge groups list route`

---

### Task 10 — Frontend: /merge/$sessionId diff review (15 min)

**New file:** `frontend/src/routes/merge.$sessionId.tsx`

```tsx
import { createFileRoute, Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { fetchMergeSession, fetchSOP, sopKeys } from '../api/client'
import { ProtectedRoute } from '../components/ProtectedRoute'
import type { MergeMatch, MergeStepDecision } from '../api/types'

export const Route = createFileRoute('/merge/$sessionId')({
  component: () => (
    <ProtectedRoute requiredRole="editor">
      <DiffReviewPage />
    </ProtectedRoute>
  ),
})

const STATUS_COLORS: Record<string, string> = {
  unchanged: 'border-gray-200 bg-gray-50',
  changed:   'border-yellow-300 bg-yellow-50',
  added:     'border-green-300 bg-green-50',
  removed:   'border-red-300 bg-red-50',
}

const STATUS_BADGE: Record<string, string> = {
  unchanged: 'bg-gray-100 text-gray-500',
  changed:   'bg-yellow-100 text-yellow-700',
  added:     'bg-green-100 text-green-700',
  removed:   'bg-red-100 text-red-700',
}

type Decision = 'accept_updated' | 'keep_base' | 'include' | 'exclude'

function DiffReviewPage() {
  const { sessionId } = Route.useParams()
  const navigate = useNavigate()

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['merge-session', sessionId],
    queryFn: () => fetchMergeSession(sessionId),
  })

  const { data: baseSop } = useQuery({
    queryKey: session ? sopKeys.detail(session.base_sop_id) : ['noop'],
    queryFn: () => fetchSOP(session!.base_sop_id),
    enabled: !!session,
  })

  const { data: updatedSop } = useQuery({
    queryKey: session ? sopKeys.detail(session.updated_sop_id) : ['noop'],
    queryFn: () => fetchSOP(session!.updated_sop_id),
    enabled: !!session,
  })

  // decisions: one per match index
  const [decisions, setDecisions] = useState<Record<number, Decision>>({})

  useEffect(() => {
    if (!session) return
    const initial: Record<number, Decision> = {}
    session.matches.forEach((m, i) => {
      if (m.status === 'unchanged') initial[i] = 'accept_updated'
      else if (m.status === 'changed') initial[i] = 'accept_updated'
      else if (m.status === 'added') initial[i] = 'include'
      else if (m.status === 'removed') initial[i] = 'exclude'
    })
    setDecisions(initial)
  }, [session])

  const stepById: Record<string, { title: string; description: string | null }> = {}
  baseSop?.steps.forEach(s => { stepById[s.id] = s })
  updatedSop?.steps.forEach(s => { stepById[s.id] = s })

  const changedUnresolved = session?.matches
    .filter((m, i) => m.status === 'changed' && decisions[i] === undefined)
    .length ?? 0

  const buildFinalSteps = (): MergeStepDecision[] => {
    if (!session) return []
    const steps: MergeStepDecision[] = []
    session.matches.forEach((m, i) => {
      const decision = decisions[i]
      if (m.status === 'unchanged' && m.updated_step_id) {
        steps.push({ step_id: m.updated_step_id, source: 'updated' })
      } else if (m.status === 'changed') {
        if (decision === 'keep_base' && m.base_step_id) {
          steps.push({ step_id: m.base_step_id, source: 'base' })
        } else if (m.updated_step_id) {
          steps.push({ step_id: m.updated_step_id, source: 'updated' })
        }
      } else if (m.status === 'added' && decision === 'include' && m.updated_step_id) {
        steps.push({ step_id: m.updated_step_id, source: 'updated' })
      } else if (m.status === 'removed' && decision === 'include' && m.base_step_id) {
        steps.push({ step_id: m.base_step_id, source: 'base' })
      }
    })
    return steps
  }

  const canProceed = changedUnresolved === 0

  if (sessionLoading) return <p className="text-gray-400 p-8">Loading diff…</p>
  if (!session) return <p className="text-red-500 p-8">Session not found.</p>

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/merge" className="text-gray-400 hover:text-gray-600 text-sm">← Back</Link>
        <h1 className="text-2xl font-bold text-gray-900">Review Changes</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-medium text-gray-400 uppercase mb-1">Original</p>
          <p className="font-medium text-gray-800 truncate">{baseSop?.title}</p>
          <p className="text-xs text-gray-400">{baseSop?.meeting_date}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-medium text-gray-400 uppercase mb-1">Updated</p>
          <p className="font-medium text-gray-800 truncate">{updatedSop?.title}</p>
          <p className="text-xs text-gray-400">{updatedSop?.meeting_date}</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {['unchanged','changed','added','removed'].map(s => (
          <span key={s} className={`px-2.5 py-1 rounded-full font-medium border ${STATUS_BADGE[s]} ${STATUS_COLORS[s]}`}>
            {s}
          </span>
        ))}
      </div>

      {/* Diff list */}
      <div className="space-y-3">
        {session.matches.map((match, i) => {
          const baseStep = match.base_step_id ? stepById[match.base_step_id] : null
          const updatedStep = match.updated_step_id ? stepById[match.updated_step_id] : null
          const decision = decisions[i]

          return (
            <div key={i} className={`rounded-xl border p-4 space-y-3 ${STATUS_COLORS[match.status]}`}>
              <div className="flex items-start justify-between gap-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[match.status]}`}>
                  {match.status}
                </span>
                {match.change_summary && (
                  <p className="text-xs text-gray-600 flex-1">{match.change_summary}</p>
                )}
              </div>

              {match.status === 'unchanged' && updatedStep && (
                <p className="text-sm text-gray-700"><span className="font-medium">{updatedStep.title}</span></p>
              )}

              {match.status === 'changed' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-red-600">Original</p>
                    <p className="text-sm font-medium text-gray-800">{baseStep?.title}</p>
                    <p className="text-xs text-gray-500 line-clamp-3">{baseStep?.description}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-green-600">Updated</p>
                    <p className="text-sm font-medium text-gray-800">{updatedStep?.title}</p>
                    <p className="text-xs text-gray-500 line-clamp-3">{updatedStep?.description}</p>
                  </div>
                </div>
              )}

              {match.status === 'added' && (
                <p className="text-sm text-gray-700"><span className="font-medium">{updatedStep?.title}</span> <span className="text-xs text-gray-400">(new step)</span></p>
              )}

              {match.status === 'removed' && (
                <p className="text-sm text-gray-700"><span className="font-medium">{baseStep?.title}</span> <span className="text-xs text-gray-400">(from original)</span></p>
              )}

              {/* Decision buttons */}
              {match.status === 'changed' && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setDecisions(prev => ({ ...prev, [i]: 'accept_updated' }))}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${decision === 'accept_updated' ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-600 hover:border-green-400'}`}
                  >
                    Accept updated
                  </button>
                  <button
                    onClick={() => setDecisions(prev => ({ ...prev, [i]: 'keep_base' }))}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${decision === 'keep_base' ? 'bg-amber-500 text-white border-amber-500' : 'border-gray-300 text-gray-600 hover:border-amber-400'}`}
                  >
                    Keep original
                  </button>
                </div>
              )}

              {(match.status === 'added' || match.status === 'removed') && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setDecisions(prev => ({ ...prev, [i]: 'include' }))}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${decision === 'include' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-blue-400'}`}
                  >
                    Include
                  </button>
                  <button
                    onClick={() => setDecisions(prev => ({ ...prev, [i]: 'exclude' }))}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${decision === 'exclude' ? 'bg-red-500 text-white border-red-500' : 'border-gray-300 text-gray-600 hover:border-red-300'}`}
                  >
                    Exclude
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Link to="/merge" className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
          ← Back
        </Link>
        <div className="flex items-center gap-3">
          {changedUnresolved > 0 && (
            <p className="text-xs text-amber-600">{changedUnresolved} changed step{changedUnresolved > 1 ? 's' : ''} need a decision</p>
          )}
          <button
            onClick={() => navigate({
              to: '/merge/$sessionId/preview',
              params: { sessionId },
              // @ts-expect-error — TanStack Router state is untyped
              state: { steps: buildFinalSteps() },
            })}
            disabled={!canProceed}
            className="px-5 py-2 text-sm font-semibold text-white bg-purple-600 rounded-xl hover:bg-purple-700 disabled:opacity-40 transition-colors"
          >
            Next: Preview →
          </button>
        </div>
      </div>
    </div>
  )
}
```

Commit: `feat: /merge/$sessionId diff review route`

---

### Task 11 — Frontend: /merge/$sessionId/preview (8 min)

**New file:** `frontend/src/routes/merge.$sessionId.preview.tsx`

```tsx
import { createFileRoute, Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { finalizeMerge, fetchSOP, fetchMergeSession, sopKeys } from '../api/client'
import { ProtectedRoute } from '../components/ProtectedRoute'
import type { MergeStepDecision } from '../api/types'

export const Route = createFileRoute('/merge/$sessionId/preview')({
  component: () => (
    <ProtectedRoute requiredRole="editor">
      <PreviewPage />
    </ProtectedRoute>
  ),
})

function PreviewPage() {
  const { sessionId } = Route.useParams()
  const navigate = useNavigate()
  // Read steps passed via navigate({ state: { steps } })
  const routerState = useRouterState({ select: s => s.location.state as { steps?: MergeStepDecision[] } | undefined })
  const steps: MergeStepDecision[] = routerState?.steps ?? []

  const { data: session } = useQuery({
    queryKey: ['merge-session', sessionId],
    queryFn: () => fetchMergeSession(sessionId),
  })

  const { data: baseSop } = useQuery({
    queryKey: session ? sopKeys.detail(session.base_sop_id) : ['noop'],
    queryFn: () => fetchSOP(session!.base_sop_id),
    enabled: !!session,
  })
  const { data: updatedSop } = useQuery({
    queryKey: session ? sopKeys.detail(session.updated_sop_id) : ['noop'],
    queryFn: () => fetchSOP(session!.updated_sop_id),
    enabled: !!session,
  })

  const stepById: Record<string, { title: string; description: string | null }> = {}
  baseSop?.steps.forEach(s => { stepById[s.id] = s })
  updatedSop?.steps.forEach(s => { stepById[s.id] = s })

  const finalizeMutation = useMutation({
    mutationFn: () => finalizeMerge(sessionId, steps),
    onSuccess: (data) => {
      navigate({ to: '/sop/$id/overview', params: { id: data!.merged_sop_id } })
    },
  })

  if (!session) return <p className="text-gray-400 p-8">Loading…</p>

  if (steps.length === 0) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <p className="text-red-500 text-sm">No steps found. Please go back and make your decisions.</p>
        <Link to="/merge/$sessionId" params={{ sessionId }} className="text-blue-500 text-sm mt-2 block">← Back to diff review</Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/merge/$sessionId" params={{ sessionId }} className="text-gray-400 hover:text-gray-600 text-sm">← Back</Link>
        <h1 className="text-2xl font-bold text-gray-900">Preview Merged SOP</h1>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5">
        <p className="text-sm text-gray-500 mb-4">
          The following <strong>{steps.length} steps</strong> will be combined into a new SOP (status: draft).
        </p>

        <div className="space-y-2">
          {steps.map((decision, i) => {
            const step = stepById[decision.step_id]
            return (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <span className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{step?.title ?? decision.step_id}</p>
                  {step?.description && (
                    <p className="text-xs text-gray-400 truncate">{step.description}</p>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${decision.source === 'updated' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                  {decision.source}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {finalizeMutation.isError && (
        <p className="text-sm text-red-500">{(finalizeMutation.error as Error).message}</p>
      )}

      <div className="flex items-center justify-between">
        <Link to="/merge/$sessionId" params={{ sessionId }} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
          ← Back
        </Link>
        <button
          onClick={() => finalizeMutation.mutate()}
          disabled={finalizeMutation.isPending}
          className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          {finalizeMutation.isPending ? 'Creating…' : 'Create Merged SOP →'}
        </button>
      </div>
    </div>
  )
}
```

Commit: `feat: /merge/$sessionId/preview — final preview + create merged SOP`

---

### Task 12 — Rebuild containers + verify (5 min)

```bash
cd "d:/CloudNavision/1. Projects/SOP/SOP Automation System/sop-platform"
docker compose build sop-api sop-extractor sop-frontend
docker compose up -d sop-api sop-extractor sop-frontend
```

**Verification checklist:**
1. Run migration 004 in Supabase SQL editor — confirm `project_code` column + `sop_merge_sessions` table
2. Go to a SOP Overview tab → see "Project Code" field — set `TEST-001` on two SOPs
3. Dashboard shows "Merge SOPs" button for editor/admin, hidden for viewers
4. `/merge` → see the `TEST-001` group with 2 SOPs and "Compare & Merge →" button
5. Click Compare → loading spinner → redirects to `/merge/<sessionId>`
6. Diff review loads with coloured step cards; "changed" steps show Accept/Keep buttons
7. All decisions made → "Next: Preview →" enabled
8. Preview shows final step list with sequence numbers
9. "Create Merged SOP →" → redirects to new SOP Overview
10. New SOP has `(Updated)` in title, status=draft, correct step count

Commit: `chore: rebuild containers for SOP version merge feature`

---

## Verification Checklist

1. `PATCH /api/sops/{id}/project-code` requires editor auth
2. `GET /api/merge/groups` returns only groups with 2+ SOPs
3. `POST /api/merge/compare` deduplicates active sessions
4. Gemini diff runs without error (check extractor logs: `docker compose logs sop-extractor`)
5. Step IDs in diff_result match actual step IDs from loaded SOPs
6. `POST /api/merge/sessions/{id}/finalize` creates new SOP + steps correctly
7. Merged SOP steps have sequence 1, 2, 3… (no gaps)
8. Original base + updated SOPs untouched after merge
9. Frontend: `/merge` hidden from viewers (ProtectedRoute requiredRole="editor")
10. TanStack Router auto-regenerates routeTree.gen.ts after dev server restart
