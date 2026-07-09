-- Fix task delete: activity_log.task_id FK + tasks_audit_delete trigger.
--
-- Two bugs surfaced when an admin deletes a task from the rail:
--
-- 1. The `tasks_audit_delete` trigger fires AFTER DELETE and tries to
--    INSERT an activity_log row with task_id = OLD.id — but the task is
--    already gone, so the FK check on the new row fails. Fix: write
--    task_id = NULL on delete rows (the action is still recorded; we
--    just can't link it back to a row that no longer exists).
--
-- 2. The existing activity_log → tasks FK had no ON DELETE action, so
--    historical rows would also block the delete. Switching to ON DELETE
--    SET NULL preserves the history (action + target text) without
--    keeping a dangling pointer.

-- ─── 1. Replace tasks_audit_delete to skip task_id on the deleted row ───
CREATE OR REPLACE FUNCTION public.tasks_audit_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- task_id intentionally NULL — the task no longer exists, so the FK
  -- has nothing to point at.
  INSERT INTO public.activity_log (user_id, action, target, task_id)
  VALUES (auth.uid(), 'Deleted', 'task: ' || OLD.name, NULL);
  RETURN OLD;
END;
$$;

-- ─── 2. Re-create the activity_log FK with ON DELETE SET NULL ───
ALTER TABLE public.activity_log
  DROP CONSTRAINT IF EXISTS activity_log_task_id_fkey;

ALTER TABLE public.activity_log
  ADD CONSTRAINT activity_log_task_id_fkey
  FOREIGN KEY (task_id)
  REFERENCES public.tasks(id)
  ON DELETE SET NULL;
