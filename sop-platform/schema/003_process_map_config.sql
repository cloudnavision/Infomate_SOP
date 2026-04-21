-- Migration 003: Add process_map_config to sops table
-- Run this in Supabase SQL editor

ALTER TABLE sops
  ADD COLUMN IF NOT EXISTS process_map_config JSONB DEFAULT NULL;

COMMENT ON COLUMN sops.process_map_config IS
  'Swim-lane process map config: {lanes: [{id,name,color}], assignments: [{step_id,lane_id,is_decision}]}';
