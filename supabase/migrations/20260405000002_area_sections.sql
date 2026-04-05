-- Area sections — sub-components per area with independent progress tracking.
-- area.progress auto-averages section progress via a trigger.

CREATE TABLE area_sections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id     uuid NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  name        text NOT NULL,
  progress    integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_area_sections_area_id ON area_sections(area_id);

-- Recalculate area.progress as AVG of section progress when sections change.
-- Leave area.progress untouched if no sections exist (preserves manual values).
CREATE OR REPLACE FUNCTION recalc_area_progress() RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
DECLARE
  target_area_id uuid;
  avg_progress integer;
  section_count integer;
BEGIN
  target_area_id := COALESCE(NEW.area_id, OLD.area_id);
  SELECT COUNT(*), COALESCE(ROUND(AVG(progress)), 0)::integer
    INTO section_count, avg_progress
    FROM public.area_sections WHERE area_id = target_area_id;

  IF section_count > 0 THEN
    UPDATE public.areas SET progress = avg_progress WHERE id = target_area_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER area_sections_progress_trigger
AFTER INSERT OR UPDATE OR DELETE ON area_sections
FOR EACH ROW EXECUTE FUNCTION recalc_area_progress();

-- RLS: admins can write; any authenticated user can read.
ALTER TABLE area_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "area_sections read for authenticated"
  ON area_sections FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "area_sections admin insert"
  ON area_sections FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "area_sections admin update"
  ON area_sections FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "area_sections admin delete"
  ON area_sections FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- Seed 5 sections for Main Game at 0% progress.
INSERT INTO area_sections (area_id, name, progress, sort_order)
SELECT id, section_name, 0, section_order
FROM areas,
  (VALUES
    ('Map Design',  0),
    ('Programming', 1),
    ('UI/UX',       2),
    ('Animations',  3),
    ('SFX/VFX',     4)
  ) AS seed(section_name, section_order)
WHERE areas.name = 'Main Game';
