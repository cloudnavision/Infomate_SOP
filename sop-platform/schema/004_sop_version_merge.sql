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
