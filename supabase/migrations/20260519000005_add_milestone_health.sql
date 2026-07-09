-- Add a `health` column to milestones so admins can mark a checkpoint
-- as On track / At risk / Off track. Optional — defaults to null
-- ("no signal") so existing milestones keep their current presentation.
--
-- Uses a new enum `milestone_health` rather than a free-text column so
-- the UI badge can stay typed and ordered.

CREATE TYPE public.milestone_health AS ENUM ('on_track', 'at_risk', 'off_track');

ALTER TABLE public.milestones
  ADD COLUMN IF NOT EXISTS health public.milestone_health;
