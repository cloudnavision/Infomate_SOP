# Phase 1b: FastAPI CRUD Endpoints ✅ Complete

### Objective
Build read-only CRUD endpoints that serve SOP data from PostgreSQL with SQLAlchemy async models, Pydantic response schemas, and properly nested relationships.

### What Was Built

**Configuration:**
- `api/app/config.py` — pydantic-settings with DATABASE_URL, CORS_ORIGINS, EXTRACTOR_URL
- `api/app/database.py` — async SQLAlchemy engine, session factory, get_db dependency

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

**Seed Data:**
- `schema/002_seed_aged_debtor.sql` — 1 SOP, 8 steps, 5 callouts, 8 transcript lines, 4 sections, 2 discussions, 5 watchlist entries

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
- GET /api/sops returns 1 SOP with step_count
- GET /api/sops/{id} returns full nested data: 8 steps, 5 callouts, 2 discussions, 4 sections, 5 watchlist entries
- All relationships load correctly via selectinload (no N+1 queries)
- 404 returned for non-existent SOP ID
