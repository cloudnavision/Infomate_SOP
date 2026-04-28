# Plan: Process Groups with Auto-Generated Codes
**Date:** 2026-04-28
**Status:** ✅ COMPLETE (2026-04-28)

## Goal
Replace manual project-code assignment (per-SOP Overview tab) with a managed **Process Group** entity.  
Users create a named group from the Merge SOPs page, pick which SOPs belong to it, and the system auto-assigns a code (`GRP-001`, `GRP-002`, …). The merge workflow continues to use `project_code` on SOPs internally — we just generate it automatically now.

---

## File Map

| Action | Path |
|--------|------|
| CREATE | `schema/006_process_groups.sql` |
| MODIFY | `api/app/models.py` |
| MODIFY | `api/app/schemas.py` |
| MODIFY | `api/app/routes/merge.py` |
| MODIFY | `frontend/src/api/types.ts` |
| MODIFY | `frontend/src/api/client.ts` |
| MODIFY | `frontend/src/routes/merge.index.tsx` |

---

## Task 1 — DB migration: process_groups table

**File:** `schema/006_process_groups.sql`

```sql
CREATE TABLE IF NOT EXISTS process_groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    code        VARCHAR(50)  UNIQUE NOT NULL,   -- auto-generated e.g. GRP-001
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Run in Supabase SQL Editor** after deployment.

---

## Task 2 — Add ProcessGroup SQLAlchemy model

**File:** `api/app/models.py`  
Add after the `SOPMergeSession` class (around line 520).

```python
class ProcessGroup(Base):
    __tablename__ = "process_groups"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()")
    )
```

Also add `UUID` to the sqlalchemy imports if not already present:
```python
from sqlalchemy.dialects.postgresql import JSONB, UUID
```

---

## Task 3 — Add Pydantic schemas

**File:** `api/app/schemas.py`  
Add at the bottom of the merge-related schemas section (after `MergeFinalizeBody`).

```python
class CreateProcessGroupBody(BaseModel):
    name: str
    sop_ids: list[str]   # UUIDs of SOPs to add to this group

class ProcessGroupResponse(BaseModel):
    id: str
    name: str
    code: str
    sop_ids: list[str]
```

---

## Task 4 — API: create endpoint + update groups list

**File:** `api/app/routes/merge.py`

### 4a — Import ProcessGroup
```python
from app.models import SOP, SOPStatus, SOPStep, SOPMergeSession, User, ProcessGroup
from app.schemas import (
    ProjectCodeUpdate, MergeCompareBody, MergeSessionResponse,
    MergeMatch, MergeFinalizeBody, CreateProcessGroupBody, ProcessGroupResponse,
)
```

Also add `func` to sqlalchemy imports:
```python
from sqlalchemy import select, func
```

### 4b — New endpoint: POST /api/merge/process-groups

Add before the `list_merge_groups` route:

```python
@router.post("/merge/process-groups", response_model=ProcessGroupResponse)
async def create_process_group(
    body: CreateProcessGroupBody,
    current_user: Annotated[User, Depends(require_editor)],
    db: AsyncSession = Depends(get_db),
) -> ProcessGroupResponse:
    """Create a named process group, auto-generate GRP-XXX code, assign to selected SOPs."""
    # Auto-generate next sequential code
    count_result = await db.execute(select(func.count(ProcessGroup.id)))
    next_num = (count_result.scalar() or 0) + 1
    code = f"GRP-{next_num:03d}"

    group = ProcessGroup(name=body.name, code=code, created_by=current_user.id)
    db.add(group)
    await db.flush()

    assigned_ids: list[str] = []
    for sop_id_str in body.sop_ids:
        sop = (await db.execute(
            select(SOP).where(SOP.id == uuid.UUID(sop_id_str))
        )).scalar_one_or_none()
        if sop:
            sop.project_code = code
            assigned_ids.append(sop_id_str)

    await db.commit()
    return ProcessGroupResponse(
        id=str(group.id), name=group.name, code=code, sop_ids=assigned_ids
    )
```

### 4c — Update GET /api/merge/groups to include group name

Update the return dict to include the `name` from `process_groups` if available:

```python
# In list_merge_groups, join process_groups to get the name
from sqlalchemy import select, func, outerjoin

stmt = (
    select(SOP, ProcessGroup.name.label("group_name"))
    .outerjoin(ProcessGroup, ProcessGroup.code == SOP.project_code)
    .where(SOP.project_code.isnot(None))
    .order_by(SOP.project_code, SOP.meeting_date)
)
rows = list((await db.execute(stmt)).all())

groups: dict[str, dict] = {}
for sop, group_name in rows:
    code = sop.project_code
    if code not in groups:
        groups[code] = {"name": group_name, "sops": []}
    groups[code]["sops"].append({
        "id": str(sop.id),
        "title": sop.title,
        "status": sop.status.value,
        "meeting_date": str(sop.meeting_date) if sop.meeting_date else None,
        "client_name": sop.client_name,
    })

return [
    {"project_code": code, "name": g["name"], "sops": g["sops"]}
    for code, g in groups.items()
    if len(g["sops"]) >= 2
]
```

---

## Task 5 — Frontend: types + API client

**File:** `frontend/src/api/types.ts`  
Add after the merge types:

```typescript
export interface ProcessGroupResponse {
  id: string
  name: string
  code: string
  sop_ids: string[]
}

export interface CreateProcessGroupInput {
  name: string
  sop_ids: string[]
}
```

Also update `MergeGroup` type to include optional `name`:
```typescript
export interface MergeGroup {
  project_code: string
  name: string | null        // ← add this
  sops: MergeGroupSOP[]
}
```

**File:** `frontend/src/api/client.ts`  
Add:

```typescript
export const createProcessGroup = (body: CreateProcessGroupInput) =>
  fetchAPI<ProcessGroupResponse>('/api/merge/process-groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
```

---

## Task 6 — Frontend: Create Group modal in merge.index.tsx

### State to add inside `MergePage`:
```typescript
const [showModal, setShowModal] = useState(false)
const [groupName, setGroupName] = useState('')
const [selectedSopIds, setSelectedSopIds] = useState<string[]>([])
const [sopSearch, setSopSearch] = useState('')

const recordings = (allSops ?? []).filter(s => !s.is_merged)
const filteredRecordings = recordings.filter(s =>
  s.title.toLowerCase().includes(sopSearch.toLowerCase())
)

const createGroupMutation = useMutation({
  mutationFn: () => createProcessGroup({ name: groupName, sop_ids: selectedSopIds }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['merge-groups'] })
    setShowModal(false)
    setGroupName('')
    setSelectedSopIds([])
    setSopSearch('')
    setTab('groups')
  },
})
```

### "Create Group" button — add to Source Groups tab header:
```tsx
<div className="flex items-center justify-between">
  <p className="text-xs text-gray-400">...</p>
  <button
    onClick={() => setShowModal(true)}
    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
  >
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
    New Group
  </button>
</div>
```

### Modal JSX — add just before closing `</div>` of the component:
```tsx
{showModal && (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-900">Create Process Group</h2>
        <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Group name */}
      <div>
        <label className="text-xs font-semibold text-gray-600 mb-1 block">Group Name</label>
        <input
          value={groupName}
          onChange={e => setGroupName(e.target.value)}
          placeholder="e.g. New Aged Debtor Report"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        {groupName && (
          <p className="text-xs text-gray-400 mt-1">
            Code will be auto-assigned (e.g. <span className="font-mono text-blue-600">GRP-001</span>)
          </p>
        )}
      </div>

      {/* SOP search + multi-select */}
      <div>
        <label className="text-xs font-semibold text-gray-600 mb-1 block">
          Select Recordings <span className="text-gray-400 font-normal">(2 or more)</span>
        </label>
        <input
          value={sopSearch}
          onChange={e => setSopSearch(e.target.value)}
          placeholder="Search recordings…"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        <div className="max-h-56 overflow-y-auto space-y-1 border border-gray-100 rounded-xl p-2">
          {filteredRecordings.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No recordings found</p>
          ) : filteredRecordings.map(sop => {
            const checked = selectedSopIds.includes(sop.id)
            return (
              <label key={sop.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => setSelectedSopIds(prev =>
                    checked ? prev.filter(id => id !== sop.id) : [...prev, sop.id]
                  )}
                  className="accent-blue-600"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{sop.title}</p>
                  <p className="text-xs text-gray-400">{sop.meeting_date ?? ''}</p>
                </div>
              </label>
            )
          })}
        </div>
        {selectedSopIds.length > 0 && (
          <p className="text-xs text-blue-600 mt-1">{selectedSopIds.length} selected</p>
        )}
      </div>

      {createGroupMutation.isError && (
        <p className="text-xs text-red-500">{(createGroupMutation.error as Error).message}</p>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => setShowModal(false)}
          className="flex-1 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => createGroupMutation.mutate()}
          disabled={!groupName.trim() || selectedSopIds.length < 2 || createGroupMutation.isPending}
          className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          {createGroupMutation.isPending ? 'Creating…' : 'Create Group'}
        </button>
      </div>
    </div>
  </div>
)}
```

Also add `useQueryClient` to imports and `const queryClient = useQueryClient()` inside the component.

### Show group name in the Source Groups list:
In the group card header, add the group name below the code badge:
```tsx
<div className="flex flex-col">
  <span className="font-mono text-sm font-bold text-blue-600 ...">
    {group.project_code}
  </span>
  {group.name && (
    <span className="text-xs text-gray-500 mt-0.5">{group.name}</span>
  )}
</div>
```

---

## Task 7 — Rebuild + migrate

```bash
docker compose build sop-api sop-frontend
docker compose up -d sop-api sop-frontend
```

Then run in **Supabase SQL Editor**:
```sql
CREATE TABLE IF NOT EXISTS process_groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    code        VARCHAR(50)  UNIQUE NOT NULL,
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
