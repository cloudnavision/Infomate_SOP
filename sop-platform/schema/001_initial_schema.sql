-- ============================================================
-- SOP Platform — Initial Database Schema
-- PostgreSQL 16+
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- for transcript full-text search

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE sop_status AS ENUM (
    'processing',   -- Pipeline is running
    'draft',        -- Pipeline complete, awaiting review
    'in_review',    -- Editor has started reviewing
    'published',    -- Approved, visible to viewers
    'archived'      -- Superseded by newer version
);

CREATE TYPE user_role AS ENUM ('viewer', 'editor', 'admin');

CREATE TYPE callout_confidence AS ENUM ('ocr_exact', 'ocr_fuzzy', 'gemini_only');

CREATE TYPE callout_match_method AS ENUM (
    'ocr_exact_text',      -- Gemini label matched OCR text exactly
    'ocr_fuzzy_text',      -- Partial/Levenshtein match
    'ocr_disambiguated',   -- Multiple OCR hits, picked by region
    'gemini_coordinates',  -- No OCR match, using Gemini estimate
    'manual'               -- Human-placed during review
);

CREATE TYPE pipeline_status AS ENUM (
    'queued',
    'transcribing',
    'detecting_screenshare',
    'extracting_frames',
    'deduplicating',
    'classifying_frames',
    'generating_annotations',
    'extracting_clips',
    'generating_sections',
    'completed',
    'failed'
);

CREATE TYPE section_content_type AS ENUM (
    'text',         -- Plain prose (purpose, training prereqs, etc.)
    'table',        -- Structured table data (risks, SOW, quality params)
    'diagram',      -- Mermaid syntax + rendered image URL
    'list'          -- Bullet/numbered list
);

-- ============================================================
-- USERS
-- ============================================================

CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email       VARCHAR(255) UNIQUE NOT NULL,
    name        VARCHAR(255) NOT NULL,
    role        user_role NOT NULL DEFAULT 'viewer',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- ============================================================
-- SOPS (master record)
-- ============================================================

CREATE TABLE sops (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title                   VARCHAR(500) NOT NULL,
    status                  sop_status NOT NULL DEFAULT 'processing',
    
    -- Source video
    video_url               TEXT,                    -- Azure Blob URL for full recording
    video_duration_sec      INTEGER,                 -- Duration in seconds
    video_file_size_bytes   BIGINT,                  -- Original file size
    cropped_video_url       TEXT,                    -- Cropped screen-share only version
    
    -- Screen share detection results
    screen_share_periods    JSONB DEFAULT '[]',      -- [{start_sec, end_sec, crop: {x,y,w,h}}]
    
    -- Template reference
    template_id             VARCHAR(100),            -- Which DOCX template to use for export
    
    -- Metadata
    meeting_date            DATE,                    -- When the KT session occurred
    meeting_participants    JSONB DEFAULT '[]',      -- ["Kanu Parmar", "Lasya Bogavarapu", ...]
    client_name             VARCHAR(255),            -- e.g., "Starboard Hotels"
    process_name            VARCHAR(255),            -- e.g., "Aged Debtor Report"
    
    -- Ownership
    created_by              UUID REFERENCES users(id),
    published_by            UUID REFERENCES users(id),
    
    -- Timestamps
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at            TIMESTAMPTZ,
    archived_at             TIMESTAMPTZ
);

CREATE INDEX idx_sops_status ON sops(status);
CREATE INDEX idx_sops_client ON sops(client_name);
CREATE INDEX idx_sops_created ON sops(created_at DESC);

-- ============================================================
-- SOP STEPS (the core procedure — one per screenshot)
-- ============================================================

CREATE TABLE sop_steps (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sop_id                      UUID NOT NULL REFERENCES sops(id) ON DELETE CASCADE,
    
    -- Ordering
    sequence                    INTEGER NOT NULL,
    
    -- Content
    title                       VARCHAR(500) NOT NULL,       -- Short title: "Log in to shared folder"
    description                 TEXT,                        -- Full infinitive-language instruction
    sub_steps                   JSONB DEFAULT '[]',          -- ["Clear columns C to H", "Update date header"]
    
    -- Video timing
    timestamp_start             FLOAT NOT NULL,              -- Seconds into the video
    timestamp_end               FLOAT,                       -- When next step begins
    
    -- Screenshots
    screenshot_url              TEXT,                        -- Raw extracted frame (PNG)
    annotated_screenshot_url    TEXT,                        -- With callouts burned in (PNG)
    screenshot_width            INTEGER,                     -- Original image dimensions
    screenshot_height           INTEGER,
    
    -- AI metadata
    scene_score                 FLOAT,                       -- PySceneDetect confidence
    frame_classification        VARCHAR(50),                 -- 'useful', 'transitional', 'duplicate'
    gemini_description          TEXT,                        -- AI's description of what's on screen
    
    -- Review status
    is_approved                 BOOLEAN DEFAULT FALSE,
    reviewed_by                 UUID REFERENCES users(id),
    reviewed_at                 TIMESTAMPTZ,
    
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(sop_id, sequence)
);

CREATE INDEX idx_steps_sop ON sop_steps(sop_id, sequence);
CREATE INDEX idx_steps_timestamp ON sop_steps(sop_id, timestamp_start);

-- ============================================================
-- STEP CALLOUTS (annotation markers on screenshots)
-- ============================================================

CREATE TABLE step_callouts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    step_id             UUID NOT NULL REFERENCES sop_steps(id) ON DELETE CASCADE,
    
    -- Position and identity
    callout_number      INTEGER NOT NULL,            -- Display number (1, 2, 3...)
    label               TEXT NOT NULL,               -- "Double-click 'Credit Check' folder"
    element_type        VARCHAR(50),                 -- 'button', 'folder', 'cell', 'menu_item', 'icon'
    
    -- Coordinates (pixels on original screenshot dimensions)
    target_x            INTEGER NOT NULL,
    target_y            INTEGER NOT NULL,
    
    -- AI matching metadata
    confidence          callout_confidence NOT NULL DEFAULT 'gemini_only',
    match_method        callout_match_method NOT NULL DEFAULT 'gemini_coordinates',
    ocr_matched_text    VARCHAR(500),                -- The OCR text that was matched (if any)
    gemini_region_hint  VARCHAR(200),                -- "left sidebar, third item down"
    
    -- Review
    was_repositioned    BOOLEAN DEFAULT FALSE,       -- Did a human move this from AI position?
    original_x          INTEGER,                     -- AI's original suggestion (for learning loop)
    original_y          INTEGER,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(step_id, callout_number)
);

CREATE INDEX idx_callouts_step ON step_callouts(step_id);

-- ============================================================
-- STEP VIDEO CLIPS (short per-step demonstrations)
-- ============================================================

CREATE TABLE step_clips (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    step_id         UUID NOT NULL REFERENCES sop_steps(id) ON DELETE CASCADE,
    
    clip_url        TEXT NOT NULL,                   -- Azure Blob URL
    duration_sec    INTEGER NOT NULL,
    file_size_bytes BIGINT,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clips_step ON step_clips(step_id);

-- ============================================================
-- STEP DISCUSSIONS (contextual Q&A from the KT session)
-- ============================================================

CREATE TABLE step_discussions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    step_id             UUID NOT NULL REFERENCES sop_steps(id) ON DELETE CASCADE,
    
    summary             TEXT NOT NULL,               -- AI-generated summary of the discussion point
    discussion_type     VARCHAR(50),                 -- 'question', 'clarification', 'decision', 'warning'
    
    -- References back to transcript lines
    transcript_refs     JSONB NOT NULL DEFAULT '[]', -- [transcript_line_id, ...]
    transcript_start    FLOAT,                       -- Start timestamp of the discussion
    transcript_end      FLOAT,                       -- End timestamp
    
    -- Who was involved
    speakers            JSONB DEFAULT '[]',          -- ["Suchith", "Lasya"]
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_discussions_step ON step_discussions(step_id);

-- ============================================================
-- TRANSCRIPT LINES (full meeting transcript)
-- ============================================================

CREATE TABLE transcript_lines (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sop_id          UUID NOT NULL REFERENCES sops(id) ON DELETE CASCADE,
    
    sequence        INTEGER NOT NULL,
    speaker         VARCHAR(255) NOT NULL,
    timestamp_sec   FLOAT NOT NULL,              -- Seconds into the video
    content         TEXT NOT NULL,
    
    -- Link to which step this line relates to (nullable — some lines are between steps)
    linked_step_id  UUID REFERENCES sop_steps(id) ON DELETE SET NULL,
    
    -- For transcript corrections during review
    original_speaker    VARCHAR(255),            -- Before human correction
    original_content    TEXT,                    -- Before human correction
    was_edited          BOOLEAN DEFAULT FALSE,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transcript_sop ON transcript_lines(sop_id, sequence);
CREATE INDEX idx_transcript_timestamp ON transcript_lines(sop_id, timestamp_sec);
CREATE INDEX idx_transcript_speaker ON transcript_lines(sop_id, speaker);
CREATE INDEX idx_transcript_step ON transcript_lines(linked_step_id);

-- Full-text search on transcript content
CREATE INDEX idx_transcript_content_trgm ON transcript_lines USING gin(content gin_trgm_ops);

-- ============================================================
-- SOP SECTIONS (generated text content for non-step sections)
-- ============================================================

CREATE TABLE sop_sections (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sop_id          UUID NOT NULL REFERENCES sops(id) ON DELETE CASCADE,
    
    section_key     VARCHAR(100) NOT NULL,        -- 'purpose', 'risks', 'comm_matrix_infomate', etc.
    section_title   VARCHAR(500) NOT NULL,        -- "Purpose/Objective/Scope"
    display_order   INTEGER NOT NULL,             -- For rendering order
    
    -- Content (one of these will be populated based on content_type)
    content_type    section_content_type NOT NULL DEFAULT 'text',
    content_text    TEXT,                         -- For prose sections
    content_json    JSONB,                        -- For tables, lists, structured data
    
    -- For diagram sections
    mermaid_syntax  TEXT,                         -- Raw Mermaid code
    diagram_url     TEXT,                         -- Rendered PNG URL
    
    -- Review
    is_approved     BOOLEAN DEFAULT FALSE,
    was_edited      BOOLEAN DEFAULT FALSE,        -- Did human modify AI output?
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(sop_id, section_key)
);

CREATE INDEX idx_sections_sop ON sop_sections(sop_id, display_order);

-- ============================================================
-- PIPELINE RUNS (tracks extraction pipeline progress)
-- ============================================================

CREATE TABLE pipeline_runs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sop_id              UUID NOT NULL REFERENCES sops(id) ON DELETE CASCADE,
    
    status              pipeline_status NOT NULL DEFAULT 'queued',
    current_stage       VARCHAR(100),
    
    -- Per-stage results (populated as each stage completes)
    stage_results       JSONB NOT NULL DEFAULT '{}',
    -- Example: {
    --   "transcription": {"speakers": 7, "lines": 824, "duration_sec": 42},
    --   "screen_detection": {"periods": [...], "crop": {...}},
    --   "frame_extraction": {"raw": 38, "after_dedup": 14, "useful": 11},
    --   "section_generation": {"sections_generated": 12}
    -- }
    
    -- Cost tracking
    total_api_cost      FLOAT DEFAULT 0,             -- Running Gemini API cost in USD
    gemini_input_tokens BIGINT DEFAULT 0,
    gemini_output_tokens BIGINT DEFAULT 0,
    
    -- Timing
    processing_time_sec INTEGER,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    
    -- Error handling
    error_message       TEXT,
    error_stage         VARCHAR(100),
    retry_count         INTEGER DEFAULT 0
);

CREATE INDEX idx_pipeline_sop ON pipeline_runs(sop_id);
CREATE INDEX idx_pipeline_status ON pipeline_runs(status);

-- ============================================================
-- SOP VERSIONS (for version history and audit trail)
-- ============================================================

CREATE TABLE sop_versions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sop_id          UUID NOT NULL REFERENCES sops(id) ON DELETE CASCADE,
    
    version_number  INTEGER NOT NULL,
    author_id       UUID REFERENCES users(id),
    change_summary  TEXT,                          -- "Updated step 4 callout positions, corrected Wyndermere spelling"
    
    -- Full snapshot of the SOP state at this version
    snapshot        JSONB NOT NULL,                -- Complete SOP data as JSON
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(sop_id, version_number)
);

CREATE INDEX idx_versions_sop ON sop_versions(sop_id, version_number DESC);

-- ============================================================
-- PROPERTY WATCHLIST (specific to hotel BPO context)
-- This could be generalised as "entity_watchlist" for other BPO processes
-- ============================================================

CREATE TABLE property_watchlist (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sop_id          UUID NOT NULL REFERENCES sops(id) ON DELETE CASCADE,
    
    property_name   VARCHAR(255) NOT NULL,
    known_issues    TEXT,
    status          VARCHAR(50) DEFAULT 'active',    -- 'active', 'resolved', 'model_property'
    required_actions TEXT,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_watchlist_sop ON property_watchlist(sop_id);

-- ============================================================
-- EXPORT HISTORY (tracks DOCX/PDF generations)
-- ============================================================

CREATE TABLE export_history (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sop_id          UUID NOT NULL REFERENCES sops(id) ON DELETE CASCADE,
    
    format          VARCHAR(20) NOT NULL,            -- 'docx', 'pdf', 'markdown'
    file_url        TEXT NOT NULL,                   -- Azure Blob URL
    file_size_bytes BIGINT,
    
    generated_by    UUID REFERENCES users(id),
    sop_version     INTEGER,                         -- Which version was exported
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exports_sop ON export_history(sop_id, created_at DESC);

-- ============================================================
-- UPDATED_AT TRIGGER (auto-update timestamps)
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER trg_sops_updated BEFORE UPDATE ON sops
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_steps_updated BEFORE UPDATE ON sop_steps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_callouts_updated BEFORE UPDATE ON step_callouts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_transcript_updated BEFORE UPDATE ON transcript_lines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_sections_updated BEFORE UPDATE ON sop_sections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_watchlist_updated BEFORE UPDATE ON property_watchlist
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SEED DATA: Default section keys and display order
-- These define the SOP template structure
-- ============================================================

CREATE TABLE section_templates (
    section_key     VARCHAR(100) PRIMARY KEY,
    section_title   VARCHAR(500) NOT NULL,
    display_order   INTEGER NOT NULL,
    content_type    section_content_type NOT NULL,
    ai_prompt       TEXT,                           -- The Gemini prompt template for this section
    is_required     BOOLEAN DEFAULT TRUE
);

INSERT INTO section_templates (section_key, section_title, display_order, content_type, is_required) VALUES
    ('purpose',             'Purpose/Objective/Scope',                      1,  'text',    TRUE),
    ('inputs',              'Input',                                        2,  'list',    TRUE),
    ('process_summary',     'Process Description',                          3,  'list',    TRUE),
    ('outputs',             'Output',                                       4,  'list',    TRUE),
    ('risks',               'Description of Risks',                         5,  'table',   TRUE),
    ('training_prereqs',    'Training Prerequisites',                       6,  'list',    TRUE),
    ('software_access',     'Software Applications/Access Levels',          7,  'table',   TRUE),
    ('process_map',         'Process Map',                                  8,  'diagram', TRUE),
    -- Section 9 (Detailed Procedure) comes from sop_steps, not sop_sections
    ('comm_matrix_infomate','Communication Matrix - InfoMate',              10, 'table',   TRUE),
    ('comm_matrix_client',  'Communication Matrix - Client',                11, 'table',   TRUE),
    ('faq',                 'FAQ',                                          12, 'table',   FALSE),
    ('quality_params',      'Quality Parameters',                           13, 'table',   TRUE),
    ('quality_sampling',    'Quality Sampling Percentage',                   14, 'text',    TRUE),
    ('sow',                 'Detailed Statement of Work',                   15, 'table',   TRUE),
    ('baseline_target',     'Baselining and Target',                        16, 'table',   TRUE),
    ('challenges',          'Challenges',                                   17, 'text',    FALSE),
    ('improvements',        'Process Improvements',                         18, 'text',    FALSE),
    ('certification',       'SOP Author/Reviewer/Approver Certification',   19, 'text',    FALSE);