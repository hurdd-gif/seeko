-- Replace milestone link/unlink trigger functions to store the milestone NAME
-- (not the UUID) in activity_log.before_value/after_value, so the rail's
-- "linked to milestone {x}" copy reads as a name, not a uuid.
--
-- Backfills existing activity rows that already contain UUIDs by joining
-- against the current milestones table. Rows whose milestones have since
-- been deleted are left as-is (no name to recover).

-- ─── 1. Replace task_milestone_audit_insert ───
CREATE OR REPLACE FUNCTION public.task_milestone_audit_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t_name TEXT;
  m_name TEXT;
BEGIN
  SELECT name INTO t_name FROM public.tasks WHERE id = NEW.task_id;
  SELECT name INTO m_name FROM public.milestones WHERE id = NEW.milestone_id;
  INSERT INTO public.activity_log (user_id, action, target, task_id, kind, after_value)
  VALUES (
    auth.uid(),
    'task.milestone_linked',
    t_name,
    NEW.task_id,
    'milestone_linked',
    to_jsonb(COALESCE(m_name, NEW.milestone_id::text))
  );
  RETURN NEW;
END;
$$;

-- ─── 2. Replace task_milestone_audit_delete ───
CREATE OR REPLACE FUNCTION public.task_milestone_audit_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t_name TEXT;
  m_name TEXT;
BEGIN
  SELECT name INTO t_name FROM public.tasks WHERE id = OLD.task_id;
  SELECT name INTO m_name FROM public.milestones WHERE id = OLD.milestone_id;
  INSERT INTO public.activity_log (user_id, action, target, task_id, kind, before_value)
  VALUES (
    auth.uid(),
    'task.milestone_unlinked',
    t_name,
    OLD.task_id,
    'milestone_unlinked',
    to_jsonb(COALESCE(m_name, OLD.milestone_id::text))
  );
  RETURN OLD;
END;
$$;

-- ─── 3. Backfill existing activity rows that still hold UUIDs ───
-- after_value: link rows
UPDATE public.activity_log al
SET after_value = to_jsonb(m.name)
FROM public.milestones m
WHERE al.kind = 'milestone_linked'
  AND al.after_value IS NOT NULL
  AND m.id::text = trim(both '"' from al.after_value::text);

-- before_value: unlink rows
UPDATE public.activity_log al
SET before_value = to_jsonb(m.name)
FROM public.milestones m
WHERE al.kind = 'milestone_unlinked'
  AND al.before_value IS NOT NULL
  AND m.id::text = trim(both '"' from al.before_value::text);
