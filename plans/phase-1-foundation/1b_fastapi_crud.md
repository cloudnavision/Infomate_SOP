# Phase 1b: FastAPI CRUD Endpoints ✅ Complete

### Objective
Build read-only CRUD endpoints that serve SOP data from Supabase (PostgreSQL via transaction pooling) with SQLAlchemy async models, Pydantic response schemas, and properly nested relationships.

### What Was Built

**Configuration:**
- `api/app/config.py` — pydantic-settings with DATABASE_URL (Supabase transaction pooler, port 6543), CORS_ORIGINS, EXTRACTOR_URL, N8N_WEBHOOK_BASE_URL
- `api/app/database.py` — async SQLAlchemy engine, session factory (pool_size conservative for transaction pooling), get_db dependency

**Models (api/app/models.py):**
SQLAlchemy 2.0 models for all tables from 001_initial_schema.sql:
- User, SOP, SOPStep, StepCallout, StepClip, StepDiscussion
- TranscriptLine, SOPSection, SectionTemplate
- PipelineRun, SOPVersion, PropertyWatchlist, ExportHistory
- 6 Python enums: SOPStatus, UserRole, CalloutConfidence, CalloutMatchMethod, PipelineStatus, SectionContentType
- All relationships with back_populates

**Schemas (api/app/schemas.py):**
Pydantic v2 response models:
- SOPListItem (with step_count)
- SOPDetail (nested steps, sections, watchlist)
- StepSchema (nested callouts, clips, discussions)
- CalloutSchema, StepClipSchema, DiscussionSchema
- TranscriptLineSchema, SectionSchema, WatchlistSchema

**Endpoints:**
| Method | Endpoint | Returns |
|---|---|---|
| GET | /api/sops | List of SOPs with status filter |
| GET | /api/sops/{id} | Full SOP with nested steps, callouts, sections, watchlist |
| GET | /api/sops/{id}/steps | All steps ordered by sequence |
| GET | /api/sops/{id}/steps/{step_id} | Single step with callouts, clips, discussions |
| GET | /api/sops/{id}/sections | Sections ordered by display_order |
| GET | /api/sops/{id}/transcript | Transcript lines with optional ?speaker= filter |
| GET | /api/sops/{id}/watchlist | Property watchlist |

**Placeholder route files (for later phases):**
- api/app/routes/exports.py — Phase 5
- api/app/routes/media.py — Phase 4
- api/app/routes/pipeline.py — Phase 4

**Database:**
- Schema applied to Supabase via SQL Editor (001_initial_schema.sql)
- Seed data loaded to Supabase via SQL Editor (002_seed_aged_debtor.sql)
- Connection via transaction pooling (port 6543) — not direct connection
- Pool size set conservatively (5-10) due to transaction pooler limits

**Seed Data:**
- `schema/002_seed_aged_debtor.sql` — 1 SOP, 8 steps, 5 callouts, 8 transcript lines, 4 sections, 2 discussions, 5 watchlist entries
- Loaded into Supabase via SQL Editor (not via docker exec since no local Postgres)

### How to Test
```bash
# List SOPs
curl http://localhost:8000/api/sops

# Full SOP detail
curl http://localhost:8000/api/sops/10000000-0000-0000-0000-000000000001

# Transcript filtered by speaker
curl "http://localhost:8000/api/sops/10000000-0000-0000-0000-000000000001/transcript?speaker=Kanu+Parmar"

# API docs
open http://localhost:8000/docs
```

### Verification Result
- GET /api/sops returns 1 SOP with step_count: 8
- GET /api/sops/{id} returns full nested data: 8 steps, 5 callouts, 2 discussions, 4 sections, 5 watchlist entries
- All relationships load correctly via selectinload (no N+1 queries)
- 404 returned for non-existent SOP ID
- API connects to Supabase transaction pooler successfully

### Issues Encountered
| Issue | Fix |
|---|---|
| Routes returned "Not Found" after architecture update | API container was running old code — rebuilt with `sudo docker compose up -d --build sop-api` |
| Supabase tables didn't exist | Schema and seed data had to be run manually in Supabase SQL Editor |
| Seed data was in local Postgres (now removed) | Re-applied seed data to Supabase via SQL Editor |
