# 7b: Dashboard Polish

**Status: ✅ Complete — 2026-04-03**

## Changes

### Backend
- `api/app/schemas.py` — Added `pipeline_status: Optional[str]` and `pipeline_stage: Optional[str]` to `SOPListItem`
- `api/app/routes/sops.py` — Added two correlated subqueries (`latest_run_status_subq`, `latest_run_stage_subq`) to `GET /api/sops`; updated `SOPListItem` constructor with `row[2]` and `row[3]`

### Frontend
- `frontend/src/api/types.ts` — Added `pipeline_status: string | null` and `pipeline_stage: string | null` to `SOPListItem`
- `frontend/src/components/SOPCard.tsx` — Replaced `<Link>` with `<div onClick>` + `useNavigate`; added `PipelineBadge` component; added "Open →" and "Export PDF" (disabled) buttons
- `frontend/src/routes/dashboard.tsx` — Added `useState<string>` search; search input above grid; client-side filter across title, client_name, process_name

## Badge Logic
```
pipeline_status == 'failed'               → red badge "Pipeline failed"
pipeline_status not in ['completed', null] → blue badge "Processing… (stage)"
pipeline_status == 'completed' or null    → no badge
```
