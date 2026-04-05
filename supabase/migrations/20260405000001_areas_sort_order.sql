-- Add sort_order column to areas so the dashboard can control display order
-- independent of name or created_at.

ALTER TABLE public.areas ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Seed initial ordering: Main Game first, Fighting Club second.
UPDATE public.areas SET sort_order = 0 WHERE name = 'Main Game';
UPDATE public.areas SET sort_order = 1 WHERE name = 'Fighting Club';

-- Secondary index for ordering queries.
CREATE INDEX IF NOT EXISTS idx_areas_sort_order ON public.areas(sort_order);
