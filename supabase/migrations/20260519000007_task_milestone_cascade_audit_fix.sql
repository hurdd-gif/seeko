-- Fix cascade audit: skip task_milestone unlink rows when the parent task is gone.
--
-- When an admin deletes a task, the FK CASCADE on task_milestone.task_id
-- removes its rows, firing task_milestone_audit_delete for each one. That
-- function looks up the task name (SELECT name FROM tasks WHERE id = OLD.task_id)
-- to populate activity_log.target — but the task is already gone, so t_name
-- comes back NULL and the INSERT fails the NOT NULL check on target.
--
-- The parent tasks_audit_delete trigger already records the deletion in
-- activity_log; the per-milestone unlink rows are cascade noise here. Skip
-- them when t_name is NULL (i.e. the task no longer exists). Manual unlinks
-- against a live task still produce an audit row.

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
  -- Parent task is gone → this DELETE is a CASCADE from tasks. Skip the
  -- audit row; tasks_audit_delete already logged the deletion.
  IF t_name IS NULL THEN
    RETURN OLD;
  END IF;

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
