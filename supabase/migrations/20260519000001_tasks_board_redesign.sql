-- Tasks board redesign: status enum expansion, task_number sequence, progress,
-- milestones + task_milestone, activity_log extension, audit triggers.
-- See docs/plans/2026-05-19-tasks-board-redesign.md (Phase A)

-- ─── 0. Drop legacy task audit triggers (they reference the old enum and
--        block the rename). Replaced by tasks_audit_* below. ───
DROP TRIGGER IF EXISTS task_activity_insert ON public.tasks;
DROP TRIGGER IF EXISTS task_activity_update ON public.tasks;
DROP TRIGGER IF EXISTS task_activity_delete ON public.tasks;
DROP FUNCTION IF EXISTS public.log_task_activity();

-- ─── 1. Status enum: Complete/Blocked → Done/Backlog, expand to Linear-7 ───
ALTER TYPE public.task_status RENAME TO task_status_old;

CREATE TYPE public.task_status AS ENUM (
  'Backlog', 'Todo', 'In Progress', 'In Review', 'Done', 'Canceled', 'Duplicate'
);

ALTER TABLE public.tasks ADD COLUMN status_new public.task_status;

UPDATE public.tasks
SET status_new = CASE
  WHEN status::text = 'Complete'    THEN 'Done'::public.task_status
  WHEN status::text = 'Blocked'     THEN 'Backlog'::public.task_status
  WHEN status::text = 'In Progress' THEN 'In Progress'::public.task_status
  WHEN status::text = 'In Review'   THEN 'In Review'::public.task_status
  ELSE 'Backlog'::public.task_status
END;

ALTER TABLE public.tasks DROP COLUMN status;
ALTER TABLE public.tasks RENAME COLUMN status_new TO status;
ALTER TABLE public.tasks ALTER COLUMN status SET DEFAULT 'Backlog';
ALTER TABLE public.tasks ALTER COLUMN status SET NOT NULL;

DROP TYPE public.task_status_old;

-- ─── 2. task_number sequence (for DIH-<n> display) ───
CREATE SEQUENCE IF NOT EXISTS public.task_number_seq;

ALTER TABLE public.tasks ADD COLUMN task_number BIGINT;
UPDATE public.tasks SET task_number = nextval('public.task_number_seq');
ALTER TABLE public.tasks
  ALTER COLUMN task_number SET DEFAULT nextval('public.task_number_seq'),
  ALTER COLUMN task_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tasks_task_number_idx ON public.tasks (task_number);

-- ─── 3. progress (0-100) ───
ALTER TABLE public.tasks
  ADD COLUMN progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100);

-- ─── 4. updated_at ───
ALTER TABLE public.tasks
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.tasks_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_touch_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_touch_updated_at();

-- ─── 5. Milestones + task_milestone ───
CREATE TABLE public.milestones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  target_date DATE,
  area_id     UUID REFERENCES public.areas(id) ON DELETE SET NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.task_milestone (
  task_id      UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  milestone_id UUID NOT NULL REFERENCES public.milestones(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, milestone_id)
);

CREATE INDEX milestones_area_id_idx ON public.milestones (area_id);
CREATE INDEX task_milestone_milestone_id_idx ON public.task_milestone (milestone_id);

ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_milestone ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read milestones"
  ON public.milestones FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can modify milestones"
  ON public.milestones FOR ALL
  USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true)
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);

CREATE POLICY "Authenticated users can read task_milestone"
  ON public.task_milestone FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can modify task_milestone"
  ON public.task_milestone FOR ALL
  USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true)
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);

-- ─── 6. Extend activity_log for typed task events ───
-- (Reuses existing activity_log table; legacy rows keep kind=NULL.)
CREATE TYPE public.task_activity_kind AS ENUM (
  'created', 'status_changed', 'assignee_changed',
  'milestone_linked', 'milestone_unlinked', 'progress_changed'
);

ALTER TABLE public.activity_log
  ADD COLUMN kind         public.task_activity_kind,
  ADD COLUMN before_value JSONB,
  ADD COLUMN after_value  JSONB;

CREATE INDEX IF NOT EXISTS activity_log_task_id_created_at_idx
  ON public.activity_log (task_id, created_at DESC)
  WHERE task_id IS NOT NULL;

-- ─── 7. Audit triggers: tasks → activity_log ───
-- INSERT: one typed 'created' row + (if assigned at creation) one untyped 'Assigned' row
CREATE OR REPLACE FUNCTION public.tasks_audit_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id      UUID;
  assignee_name TEXT;
BEGIN
  actor_id := auth.uid();

  INSERT INTO public.activity_log (user_id, action, target, task_id, kind, after_value)
  VALUES (
    actor_id,
    'task.created',
    NEW.name,
    NEW.id,
    'created',
    jsonb_build_object(
      'status', NEW.status::text,
      'assignee_id', NEW.assignee_id,
      'progress', NEW.progress
    )
  );

  IF NEW.assignee_id IS NOT NULL THEN
    SELECT display_name INTO assignee_name FROM public.profiles WHERE id = NEW.assignee_id;
    INSERT INTO public.activity_log (user_id, action, target, task_id)
    VALUES (actor_id, 'Assigned', 'task: ' || NEW.name || ' → ' || COALESCE(assignee_name, 'someone'), NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_audit_insert
  AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_audit_insert();

-- UPDATE: typed rows for status/assignee/progress; untyped rows for priority/department (parity with legacy)
CREATE OR REPLACE FUNCTION public.tasks_audit_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id      UUID;
  assignee_name TEXT;
BEGIN
  actor_id := auth.uid();

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.activity_log (user_id, action, target, task_id, kind, before_value, after_value)
    VALUES (actor_id, 'task.status_changed', NEW.name, NEW.id, 'status_changed',
            to_jsonb(OLD.status::text), to_jsonb(NEW.status::text));
  END IF;

  IF OLD.assignee_id IS DISTINCT FROM NEW.assignee_id THEN
    INSERT INTO public.activity_log (user_id, action, target, task_id, kind, before_value, after_value)
    VALUES (actor_id, 'task.assignee_changed', NEW.name, NEW.id, 'assignee_changed',
            to_jsonb(OLD.assignee_id), to_jsonb(NEW.assignee_id));

    IF NEW.assignee_id IS NOT NULL THEN
      SELECT display_name INTO assignee_name FROM public.profiles WHERE id = NEW.assignee_id;
      INSERT INTO public.activity_log (user_id, action, target, task_id)
      VALUES (actor_id, 'Assigned', 'task: ' || NEW.name || ' → ' || COALESCE(assignee_name, 'someone'), NEW.id);
    END IF;
  END IF;

  IF OLD.progress IS DISTINCT FROM NEW.progress THEN
    INSERT INTO public.activity_log (user_id, action, target, task_id, kind, before_value, after_value)
    VALUES (actor_id, 'task.progress_changed', NEW.name, NEW.id, 'progress_changed',
            to_jsonb(OLD.progress), to_jsonb(NEW.progress));
  END IF;

  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO public.activity_log (user_id, action, target, task_id)
    VALUES (actor_id, 'Changed priority', 'task: ' || NEW.name || ' → ' || NEW.priority::text, NEW.id);
  END IF;

  IF OLD.department IS DISTINCT FROM NEW.department THEN
    INSERT INTO public.activity_log (user_id, action, target, task_id)
    VALUES (actor_id, 'Changed department', 'task: ' || NEW.name || ' → ' || COALESCE(NEW.department::text, 'none'), NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_audit_update
  AFTER UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_audit_update();

-- DELETE: untyped row (parity with legacy)
CREATE OR REPLACE FUNCTION public.tasks_audit_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.activity_log (user_id, action, target, task_id)
  VALUES (auth.uid(), 'Deleted', 'task: ' || OLD.name, OLD.id);
  RETURN OLD;
END;
$$;

CREATE TRIGGER tasks_audit_delete
  AFTER DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_audit_delete();

-- ─── 8. Audit triggers: task_milestone → activity_log ───
CREATE OR REPLACE FUNCTION public.task_milestone_audit_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t_name TEXT;
BEGIN
  SELECT name INTO t_name FROM public.tasks WHERE id = NEW.task_id;
  INSERT INTO public.activity_log (user_id, action, target, task_id, kind, after_value)
  VALUES (auth.uid(), 'task.milestone_linked', t_name, NEW.task_id, 'milestone_linked',
          to_jsonb(NEW.milestone_id));
  RETURN NEW;
END;
$$;

CREATE TRIGGER task_milestone_audit_insert
  AFTER INSERT ON public.task_milestone
  FOR EACH ROW EXECUTE FUNCTION public.task_milestone_audit_insert();

CREATE OR REPLACE FUNCTION public.task_milestone_audit_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t_name TEXT;
BEGIN
  SELECT name INTO t_name FROM public.tasks WHERE id = OLD.task_id;
  INSERT INTO public.activity_log (user_id, action, target, task_id, kind, before_value)
  VALUES (auth.uid(), 'task.milestone_unlinked', t_name, OLD.task_id, 'milestone_unlinked',
          to_jsonb(OLD.milestone_id));
  RETURN OLD;
END;
$$;

CREATE TRIGGER task_milestone_audit_delete
  AFTER DELETE ON public.task_milestone
  FOR EACH ROW EXECUTE FUNCTION public.task_milestone_audit_delete();
