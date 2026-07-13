-- log_comment_activity stamped the actor with auth.uid(). That was correct while
-- comments were inserted from the browser under RLS. Comment writes now go
-- through the service-role API route (POST /api/tasks/:id/comments), and under
-- the service role auth.uid() is NULL — so every comment logged since that move
-- produced an actorless activity row: no name, no avatar, generic icon in the
-- board rail's "Recent activity". (The oldest surviving 'Commented on' row, from
-- March, still carries a user_id — that's the client-write era.)
--
-- The author is already on the row being inserted: task_comments.user_id is NOT
-- NULL. Read it from NEW instead of from the session. That's correct no matter
-- who performs the insert — browser, service role, or EKO — so this can't rot
-- the same way again the next time a write moves behind a seam.
--
-- task_id is deliberately still left NULL. The task detail page renders comments
-- as their own cards and filters activity_log by task_id; stamping it here would
-- make every comment show up twice on that page. Comment activity rows are for
-- the project-level feed only.
--
-- Also pins search_path: this is SECURITY DEFINER, and a mutable search_path on
-- a definer function is a privilege-escalation vector (Supabase lints it as
-- function_search_path_mutable).

create or replace function public.log_comment_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  task_name text;
begin
  select name into task_name from public.tasks where id = new.task_id;
  insert into public.activity_log (user_id, action, target)
  values (new.user_id, 'Commented on', 'task: ' || coalesce(task_name, 'unknown'));
  return new;
end;
$function$;
