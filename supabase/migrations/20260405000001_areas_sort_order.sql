-- Add sort_order column to areas so the dashboard can control display order
-- independent of name or created_at.

ALTER TABLE public.areas ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 100;

-- Ensure the default is 100 even if the column already existed with a prior default.
-- New areas added without an explicit sort_order land at the end of the list
-- rather than tying with seeded rows at 0.
ALTER TABLE public.areas ALTER COLUMN sort_order SET DEFAULT 100;

-- Rename legacy 'Battleground' row to 'Main Game' so fresh environments and
-- replays match the name the dashboard renders. Idempotent: no-op if already renamed.
UPDATE public.areas SET name = 'Main Game' WHERE name = 'Battleground';

-- Seed initial ordering: Main Game first, Fighting Club second.
UPDATE public.areas SET sort_order = 0 WHERE name = 'Main Game';
UPDATE public.areas SET sort_order = 1 WHERE name = 'Fighting Club';

-- Secondary index for ordering queries.
CREATE INDEX IF NOT EXISTS idx_areas_sort_order ON public.areas(sort_order);
