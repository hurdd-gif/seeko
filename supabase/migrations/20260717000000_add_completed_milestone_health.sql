-- Add 'completed' to the milestone_health enum — the terminal state for a
-- milestone that has shipped. Additive only: existing values and rows are
-- untouched, so this is safe to run against live data.
--
-- UI: MilestoneHealthBadge renders it as a filled green circle with a white
-- check (the solid sibling of on_track's outline). The rollup in areaHealth.ts
-- ranks it BELOW on_track, so an area only reads "Completed" when every
-- signal-carrying milestone has landed.

ALTER TYPE public.milestone_health ADD VALUE IF NOT EXISTS 'completed';
