-- Migration 005: Add is_merged flag to sops table
ALTER TABLE sops ADD COLUMN IF NOT EXISTS is_merged BOOLEAN NOT NULL DEFAULT FALSE;
