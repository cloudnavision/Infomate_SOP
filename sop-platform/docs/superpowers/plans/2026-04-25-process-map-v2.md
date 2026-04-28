# Process Map v2 — Implementation Plan
**Date:** 2026-04-25  
**Feature:** Step reorder (drag-and-drop), include/exclude steps, mandatory confirm/upload gate, confirmed PNG used in DOCX/PDF export

---

## File Map

| File | Action |
|------|--------|
| `frontend/src/api/types.ts` | Add `confirmed_url`, `confirmed_at`, `is_confirmed` to `ProcessMapConfig` |
| `frontend/src/api/client.ts` | Update `saveProcessMap` signature; add `uploadProcessMapImage(id, file)` |
| `frontend/src/routes/sop.$id.processmap.tsx` | Step 2 drag-reorder + include/exclude; new Step 4 "Confirm & Upload" |
| `api/app/schemas.py` | Update `ProcessMapConfigBody` to include confirmation fields |
| `api/app/routes/sops.py` | PATCH preserves confirmation fields; new `POST /process-map/upload` endpoint |
| `extractor/app/doc_renderer.py` | Thread SAS token to `_build_context`; add `_download_confirmed_map`; use confirmed PNG |

---

## Tasks

### Task 1 — Update types + schemas (2 min)

**File:** `frontend/src/api/types.ts` lines 243–246

Replace:
```ts
export interface ProcessMapConfig {
  lanes: ProcessMapLane[]
  assignments: ProcessMapAssignment[]
}
```
With:
```ts
export interface ProcessMapConfig {
  lanes: ProcessMapLane[]
  assignments: ProcessMapAssignment[]
  is_confirmed?: boolean
  confirmed_url?: string | null   // Azure Blob URL of uploaded PNG, or null = use auto-gen
  confirmed_at?: string | null    // ISO timestamp
}
```

**File:** `api/app/schemas.py` lines 313–315

Replace `ProcessMapConfigBody`:
```python
class ProcessMapConfigBody(BaseModel):
    lanes: list[dict]
    assignments: list[dict]
    is_confirmed: bool = False
    confirmed_url: Optional[str] = None
    confirmed_at: Optional[str] = None
```

Commit: `types: add confirmation fields to ProcessMapConfig`

---

### Task 2 — PATCH route preserves confirmation state (3 min)

**File:** `api/app/routes/sops.py` line 454

Current (overwrites entire config):
```python
sop.process_map_config = {"lanes": body.lanes, "assignments": body.assignments}
```

Replace with (merge — preserve confirmed_url when re-editing lanes/assignments):
```python
existing = sop.process_map_config or {}
sop.process_map_config = {
    "lanes": body.lanes,
    "assignments": body.assignments,
    "is_confirmed": body.is_confirmed,
    "confirmed_url": body.confirmed_url if body.confirmed_url is not None else existing.get("confirmed_url"),
    "confirmed_at": body.confirmed_at if body.confirmed_at is not None else existing.get("confirmed_at"),
}
```

Commit: `fix: PATCH process-map preserves confirmation state`

---

### Task 3 — Upload endpoint (5 min)

**File:** `api/app/routes/sops.py`

Add these imports at the top if not already present:
```python
from fastapi import UploadFile
import httpx
```

Add after existing `save_process_map` route:
```python
@router.post("/sops/{sop_id}/process-map/upload")
async def upload_process_map_image(
    sop_id: UUID,
    file: UploadFile,
    current_user: Annotated[User, Depends(require_editor)],
    db: AsyncSession = Depends(get_db),
):
    """Upload a corrected process map PNG. Stores in Azure Blob, saves confirmed_url."""
    if file.content_type not in ("image/png", "image/jpeg"):
        raise HTTPException(status_code=400, detail="Only PNG or JPEG files are accepted")

    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 15 MB)")

    sop = (await db.execute(select(SOP).where(SOP.id == sop_id))).scalar_one_or_none()
    if sop is None:
        raise HTTPException(status_code=404, detail=f"SOP {sop_id} not found")

    blob_name = f"sop-{sop_id}/process_map_confirmed.png"
    blob_url = f"{settings.azure_blob_base_url}/{blob_name}"
    upload_url = f"{blob_url}?{settings.azure_blob_sas_token}"

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.put(
            upload_url,
            content=data,
            headers={"x-ms-blob-type": "BlockBlob", "Content-Type": "image/png"},
        )
        if resp.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=f"Azure upload failed: {resp.status_code}")

    confirmed_at = datetime.now(timezone.utc).isoformat()
    existing = sop.process_map_config or {}
    sop.process_map_config = {
        **existing,
        "is_confirmed": True,
        "confirmed_url": blob_url,
        "confirmed_at": confirmed_at,
    }
    sop.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return {"confirmed_url": blob_url, "confirmed_at": confirmed_at}
```

Commit: `feat: POST /api/sops/{id}/process-map/upload — upload confirmed PNG to Azure`

---

### Task 4 — Frontend API client (3 min)

**File:** `frontend/src/api/client.ts` line 118–119

**4a. Update `saveProcessMap` to accept full config (including confirmation fields):**

The current signature already passes `ProcessMapConfig` to `mutateAPI`, so updating the interface in Task 1 is sufficient — `mutateAPI` serialises the whole object. No code change needed here beyond Task 1.

**4b. Add `uploadProcessMapImage` after `saveProcessMap` (line 120):**

```ts
export const uploadProcessMapImage = async (id: string, file: File): Promise<{ confirmed_url: string; confirmed_at: string }> => {
  const headers = await getAuthHeaders()
  // Remove Content-Type so browser sets multipart/form-data boundary automatically
  const { 'Content-Type': _, ...headersWithoutContentType } = headers as Record<string, string>
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_BASE}/api/sops/${id}/process-map/upload`, {
    method: 'POST',
    headers: headersWithoutContentType,
    body: form,
  })
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  return res.json()
}
```

Note: `getAuthHeaders()` is `async` — must be awaited. Use `API_BASE` (defined at line 4 of client.ts), not a bare `/api/...` path.

Commit: `feat: uploadProcessMapImage API client function`

---

### Task 5 — Step 2: drag-and-drop reorder + include/exclude (15 min)

**File:** `frontend/src/routes/sop.$id.processmap.tsx`

**5a. Update imports (lines 4–6):**
```ts
import { fetchSOP, fetchProcessMap, saveProcessMap, uploadProcessMapImage, sopKeys } from '../api/client'
import type { ProcessMapLane, ProcessMapAssignment, SOPStep, ProcessMapConfig } from '../api/types'
```

**5b. Changes to `StepAssigner` component — add drag state at top of function:**
```ts
const [dragIdx, setDragIdx] = useState<number | null>(null)
const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
const excludedSteps = steps.filter(s => !assignments.find(a => a.step_id === s.id))
```

**5c. Each assignment row — replace the existing `<div key={asgn.step_id} className="flex items-center...">` with:**
```tsx
<div
  key={asgn.step_id}
  draggable
  onDragStart={() => setDragIdx(i)}
  onDragOver={e => { e.preventDefault(); setDragOverIdx(i) }}
  onDrop={() => {
    if (dragIdx === null || dragIdx === i) return
    const next = [...assignments]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(i, 0, moved)
    onChange(next)
    setDragIdx(null); setDragOverIdx(null)
  }}
  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
  className={`flex items-center gap-3 bg-white border rounded-xl px-4 py-3 shadow-sm hover:border-gray-300 transition-colors ${
    dragOverIdx === i ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
  }`}
>
```

**5d. Drag handle `<svg>` — add cursor classes:**
```tsx
<svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-300 shrink-0 cursor-grab active:cursor-grabbing">
```

**5e. Add "Remove" button inside the row (after the lane `<select>`):**
```tsx
<button
  onClick={() => onChange(assignments.filter((_, j) => j !== i))}
  title="Remove from diagram"
  className="text-gray-300 hover:text-red-400 transition-colors shrink-0 ml-1"
>
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
  </svg>
</button>
```

**5f. After the assignments list `</div>`, add excluded steps section:**
```tsx
{excludedSteps.length > 0 && (
  <div className="mt-4 pt-4 border-t border-gray-100">
    <p className="text-xs text-gray-400 mb-2">Excluded from diagram</p>
    {excludedSteps.map(s => (
      <div key={s.id} className="flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-lg text-sm text-gray-400 mb-1">
        <span className="flex-1">{s.sequence}. {s.title}</span>
        <button
          onClick={() => onChange([...assignments, { step_id: s.id, lane_id: lanes[0]?.id ?? '', is_decision: false }])}
          className="text-xs text-blue-500 hover:text-blue-700 font-medium"
        >+ Add back</button>
      </div>
    ))}
  </div>
)}
```

Commit: `feat: process map step 2 — drag reorder + include/exclude steps`

---

### Task 6 — New Step 4: Confirm & Upload (15 min)

**File:** `frontend/src/routes/sop.$id.processmap.tsx`

**6a. Update wizard labels + step type:**

Change line with `WIZARD_LABELS`:
```ts
const WIZARD_LABELS = ['1. Define Lanes', '2. Assign Steps', '3. Preview', '4. Confirm']
```

Change `useState<0 | 1 | 2>` to:
```ts
const [wizardStep, setWizardStep] = useState<0 | 1 | 2 | 3>(0)
```

Update ALL navigation casts in the file (search for `as 0 | 1 | 2` and `as 1 | 2`):
- `(prev - 1) as 0 | 1 | 2` → `(prev - 1) as 0 | 1 | 2 | 3`
- `(wizardStep + 1) as 1 | 2` → `(wizardStep + 1) as 1 | 2 | 3`
- The wizard step click handler condition: add `|| (i === 3 && canProceed0 && canProceed1 && canProceed2)`

**6b. Add `canProceed2` gate and `handleConfirmed` to `ProcessMapPage`:**
```ts
const canProceed2 = assignments.length > 0

const handleConfirmed = async (confirmedUrl: string | null, confirmedAt: string) => {
  await saveMutation.mutateAsync()
  // Upload already stored confirmed_url via the upload endpoint.
  // For "confirm auto-gen" we need to also patch the config.
  // saveMutation uses current lanes/assignments — we need to include confirmation fields.
  // See 6c below for the updated mutationFn.
  setSaved(true)
  setTimeout(() => setSaved(false), 3000)
}
```

**6c. Update `saveMutation` to accept a confirmation payload:**

Replace the existing `useMutation` block:
```ts
const [pendingConfirm, setPendingConfirm] = useState<{ confirmed_url: string | null; confirmed_at: string } | null>(null)

const saveMutation = useMutation({
  mutationFn: (confirmOverride?: { is_confirmed: boolean; confirmed_url: string | null; confirmed_at: string }) =>
    saveProcessMap(id, {
      lanes,
      assignments,
      is_confirmed: confirmOverride?.is_confirmed ?? pmData?.process_map_config?.is_confirmed ?? false,
      confirmed_url: confirmOverride?.confirmed_url ?? pmData?.process_map_config?.confirmed_url ?? null,
      confirmed_at: confirmOverride?.confirmed_at ?? pmData?.process_map_config?.confirmed_at ?? null,
    }),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: sopKeys.processMap(id) })
    qc.invalidateQueries({ queryKey: sopKeys.detail(id) })
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  },
})
```

Update `handleConfirmed`:
```ts
const handleConfirmed = (confirmedUrl: string | null, confirmedAt: string) => {
  saveMutation.mutate({
    is_confirmed: true,
    confirmed_url: confirmedUrl,
    confirmed_at: confirmedAt,
  })
}
```

The existing "Save Process Map" button in `PreviewPane` calls `onSave` → `saveMutation.mutate()` (no args) which still works via the optional parameter.

**6d. Add `ConfirmPane` component (add before `ProcessMapPage`):**
```tsx
function ConfirmPane({
  lanes, assignments, steps, sopId, currentConfig, isSaving, onConfirmed,
}: {
  lanes: ProcessMapLane[]
  assignments: ProcessMapAssignment[]
  steps: SOPStep[]
  sopId: string
  currentConfig: ProcessMapConfig | null
  isSaving: boolean
  onConfirmed: (confirmedUrl: string | null, confirmedAt: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const svgMarkup = generateSwimlane(lanes, assignments, steps)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError(null)
    try {
      const result = await uploadProcessMapImage(sopId, file)
      onConfirmed(result.confirmed_url, result.confirmed_at)
    } catch (err: any) {
      setError(err.message ?? 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Confirm Process Map</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Review the auto-generated diagram below. Confirm it as-is, or upload a corrected PNG — the confirmed version will be embedded in your DOCX/PDF export.
        </p>
      </div>

      {/* Show confirmed uploaded image OR auto-generated SVG */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-auto">
        {currentConfig?.confirmed_url ? (
          <img src={`${currentConfig.confirmed_url}?${''}`} alt="Confirmed process map" className="max-w-full p-4" />
        ) : svgMarkup ? (
          <div className="min-w-max p-4" dangerouslySetInnerHTML={{ __html: svgMarkup }} />
        ) : (
          <p className="p-8 text-center text-gray-400 text-sm">No diagram — complete steps 1 and 2 first.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => onConfirmed(null, new Date().toISOString())}
          disabled={isSaving}
          className="flex flex-col items-center gap-2 p-5 border-2 border-gray-200 rounded-xl hover:border-green-400 hover:bg-green-50 disabled:opacity-50 transition-colors text-sm text-gray-700"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8 text-green-500">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span className="font-medium">Confirm auto-generated</span>
          <span className="text-xs text-gray-400 text-center">Use the diagram above in exports</span>
        </button>

        <label className="flex flex-col items-center gap-2 p-5 border-2 border-dashed border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors text-sm text-gray-700 cursor-pointer">
          {uploading
            ? <svg className="animate-spin w-8 h-8 text-blue-400" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
            : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8 text-blue-400"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
          }
          <span className="font-medium">{uploading ? 'Uploading…' : 'Upload corrected PNG'}</span>
          <span className="text-xs text-gray-400 text-center">Replace with your own diagram</span>
          <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleFileUpload} disabled={uploading} />
        </label>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {currentConfig?.is_confirmed && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
          </svg>
          {currentConfig.confirmed_url
            ? `Using uploaded PNG — confirmed ${new Date(currentConfig.confirmed_at!).toLocaleDateString()}`
            : `Using auto-generated diagram — confirmed ${new Date(currentConfig.confirmed_at!).toLocaleDateString()}`
          }
        </div>
      )}
    </div>
  )
}
```

Note: the `src` for the confirmed image needs the SAS token. Since `confirmed_url` is a bare Azure Blob URL (no SAS), append it from the SOP data. The SOP query already returns steps with SAS-appended URLs; for the image preview, either add `?${SAS}` client-side (available via `pmData` or `sopData`) or make the URL public. For now, use the confirmed_url as-is — if the blob container is not public, the image preview won't render but upload/export will still work. This can be polished later.

**6e. Render `ConfirmPane` in the wizard body (add after `wizardStep === 2` block):**
```tsx
{wizardStep === 3 && (
  <ConfirmPane
    lanes={lanes}
    assignments={assignments}
    steps={steps}
    sopId={id}
    currentConfig={pmData?.process_map_config ?? null}
    isSaving={saveMutation.isPending}
    onConfirmed={handleConfirmed}
  />
)}
```

**6f. Update wizard navigation Next button condition:**

Add `canProceed2 = assignments.length > 0` (for step 2 → step 3 gate, same as `canProceed1`; adjust naming if cleaner).

The existing `disabled` check: `wizardStep === 0 ? !canProceed0 : !canProceed1` → update to:
```tsx
disabled={
  (wizardStep === 0 && !canProceed0) ||
  (wizardStep === 1 && !canProceed1) ||
  (wizardStep === 2 && !canProceed1)
}
```

Hide "Next" button on step 3 (no next step):
```tsx
{wizardStep < 3 && (
  <button ...>Next</button>
)}
```

Commit: `feat: process map step 4 — confirm auto-gen or upload corrected PNG`

---

### Task 7 — Export: thread SAS token + use confirmed PNG (8 min)

**File:** `extractor/app/doc_renderer.py`

**7a. Update `_build_context` signature (line 206) to accept SAS token:**
```python
def _build_context(tpl: DocxTemplate, sop_data: dict, tmp_dir: Path, table_registry: dict | None = None, azure_sas_token: str = "") -> dict:
```

**7b. Update call to `_build_context` inside `render_sop` (line 58):**
```python
context = _build_context(tpl, sop_data, tmp_dir, table_registry, azure_sas_token=azure_sas_token)
```

**7c. Replace the `pm_config` / `process_map` block (lines 257–262) inside `_build_context`:**

Replace:
```python
pm_config = sop_data.get("process_map_config")
process_map = (
    _generate_swimlane_map(tpl, pm_config, steps_raw, tmp_dir)
    if pm_config and pm_config.get("lanes") and pm_config.get("assignments")
    else _generate_process_map(tpl, steps_raw, tmp_dir)
)
```

With:
```python
pm_config = sop_data.get("process_map_config")
confirmed_url = pm_config.get("confirmed_url") if pm_config else None

if confirmed_url:
    process_map = _download_confirmed_map(tpl, confirmed_url, tmp_dir, sas_token=azure_sas_token)
    if process_map is None:
        process_map = (
            _generate_swimlane_map(tpl, pm_config, steps_raw, tmp_dir)
            if pm_config and pm_config.get("lanes") and pm_config.get("assignments")
            else _generate_process_map(tpl, steps_raw, tmp_dir)
        )
elif pm_config and pm_config.get("lanes") and pm_config.get("assignments"):
    process_map = _generate_swimlane_map(tpl, pm_config, steps_raw, tmp_dir)
else:
    process_map = _generate_process_map(tpl, steps_raw, tmp_dir)
```

**7d. Add `_download_confirmed_map` helper near other helpers (after `_generate_swimlane_map`):**
```python
def _download_confirmed_map(
    tpl: DocxTemplate,
    url: str,
    tmp_dir: Path,
    sas_token: str = "",
) -> Optional[InlineImage]:
    """Download the user-uploaded confirmed process map PNG and embed it."""
    try:
        full_url = f"{url}?{sas_token}" if sas_token and "?" not in url else url
        resp = requests.get(full_url, timeout=30)
        resp.raise_for_status()
        map_path = tmp_dir / "process_map_confirmed.png"
        map_path.write_bytes(resp.content)
        return InlineImage(tpl, str(map_path), width=Inches(6.5))
    except Exception as exc:
        logger.warning("Could not download confirmed process map from %s: %s", url, exc)
        return None
```

Note: `requests` is already imported at the top of doc_renderer.py — no extra import needed.

Commit: `feat: export uses confirmed process map PNG when available`

---

## Verification Checklist

1. Wizard: drag-and-drop reorders steps in Step 2 (drag handle visible, rows highlight on dragover)
2. Wizard: "Remove" button excludes a step; it appears in "Excluded" section; "Add back" restores it
3. Wizard: step 4 renders ConfirmPane with two options
4. Confirm auto-gen → saves config with `is_confirmed: true, confirmed_url: null`; green banner shows
5. Upload PNG → file goes to Azure Blob; `confirmed_url` stored; banner shows with date
6. Re-opening wizard: step 4 shows already-confirmed state
7. Re-editing lanes (steps 1–2) and saving does NOT clear `confirmed_url`
8. DOCX export embeds the uploaded PNG when `confirmed_url` is set
9. DOCX export falls back to generated SVG when `confirmed_url` is null
10. Viewer role: read-only preview unchanged (no wizard, no confirm pane)
