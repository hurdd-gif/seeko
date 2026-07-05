-- Harden read/write policies that previously allowed broad authenticated access.

CREATE OR REPLACE FUNCTION public.is_admin_for_rls(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT p.is_admin
    FROM public.profiles p
    WHERE p.id = p_user_id
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.can_read_doc_for_rls(
  p_restricted_departments text[],
  p_granted_user_ids uuid[],
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin_for_rls(p_user_id)
    OR COALESCE(cardinality(p_restricted_departments), 0) = 0
    OR p_user_id = ANY(COALESCE(p_granted_user_ids, ARRAY[]::uuid[]))
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = p_user_id
        AND p.department::text = ANY(COALESCE(p_restricted_departments, ARRAY[]::text[]))
    )
$$;

CREATE OR REPLACE FUNCTION public.can_read_doc_id_for_rls(p_doc_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT public.can_read_doc_for_rls(d.restricted_department, d.granted_user_ids, p_user_id)
    FROM public.docs d
    WHERE d.id = p_doc_id
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.can_read_task_for_rls(p_task_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin_for_rls(p_user_id)
    OR COALESCE((
      SELECT t.assignee_id = p_user_id
      FROM public.tasks t
      WHERE t.id = p_task_id
    ), false)
$$;

CREATE OR REPLACE FUNCTION public.can_read_task_comment_for_rls(p_comment_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT public.can_read_task_for_rls(tc.task_id, p_user_id)
    FROM public.task_comments tc
    WHERE tc.id = p_comment_id
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.can_read_task_path_for_rls(p_task_id_text text, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_uuid uuid;
BEGIN
  task_uuid := p_task_id_text::uuid;
  RETURN public.can_read_task_for_rls(task_uuid, p_user_id);
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN false;
END;
$$;

DROP POLICY IF EXISTS "Authenticated users can read docs" ON public.docs;
CREATE POLICY "Authorized users can read docs"
  ON public.docs FOR SELECT
  USING (public.can_read_doc_for_rls(restricted_department, granted_user_ids, auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read tasks" ON public.tasks;
CREATE POLICY "Authorized users can read tasks"
  ON public.tasks FOR SELECT
  USING (public.can_read_task_for_rls(id, auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read activity" ON public.activity_log;
CREATE POLICY "Authorized users can read activity"
  ON public.activity_log FOR SELECT
  USING (
    public.is_admin_for_rls(auth.uid())
    OR user_id = auth.uid()
    OR (task_id IS NOT NULL AND public.can_read_task_for_rls(task_id, auth.uid()))
    OR (doc_id IS NOT NULL AND public.can_read_doc_id_for_rls(doc_id, auth.uid()))
  );

DROP POLICY IF EXISTS "Authenticated users can read task_milestone" ON public.task_milestone;
CREATE POLICY "Authorized users can read task_milestone"
  ON public.task_milestone FOR SELECT
  USING (public.can_read_task_for_rls(task_id, auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read milestones" ON public.milestones;
CREATE POLICY "Authorized users can read milestones"
  ON public.milestones FOR SELECT
  USING (
    public.is_admin_for_rls(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.task_milestone tm
      WHERE tm.milestone_id = milestones.id
        AND public.can_read_task_for_rls(tm.task_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated can read comment attachments" ON public.task_comment_attachments;
CREATE POLICY "Authorized users can read comment attachments"
  ON public.task_comment_attachments FOR SELECT
  USING (public.can_read_task_comment_for_rls(comment_id, auth.uid()));

DROP POLICY IF EXISTS "Authenticated can insert comment attachments" ON public.task_comment_attachments;
CREATE POLICY "Authorized users can insert comment attachments"
  ON public.task_comment_attachments FOR INSERT
  WITH CHECK (public.can_read_task_comment_for_rls(comment_id, auth.uid()));

DROP POLICY IF EXISTS "Authenticated can upload chat attachments" ON storage.objects;
CREATE POLICY "Authorized users can upload chat attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND public.can_read_task_path_for_rls((storage.foldername(name))[1], auth.uid())
  );

DROP POLICY IF EXISTS "Authenticated can read chat attachments" ON storage.objects;
CREATE POLICY "Authorized users can read chat attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'chat-attachments'
    AND public.can_read_task_path_for_rls((storage.foldername(name))[1], auth.uid())
  );
