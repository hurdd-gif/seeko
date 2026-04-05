-- Add sort_order column to areas so the dashboard can control display order
-- independent of name or created_at.

ALTER TABLE areas ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Seed initial ordering: Main Game first, Fighting Club second.
UPDATE areas SET sort_order = 0 WHERE name = 'Main Game';
UPDATE areas SET sort_order = 1 WHERE name = 'Fighting Club';

-- Secondary index for ordering queries.
CREATE INDEX idx_areas_sort_order ON areas(sort_order);
