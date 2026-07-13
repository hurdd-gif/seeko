-- Every activity row gets a real actor.
--
-- The five `tasks` / `task_milestone` audit triggers stamp the actor with
-- auth.uid(). That was right when the browser wrote tasks directly under RLS. It
-- has been wrong since task writes moved behind the service-role API, because
-- under the service role there IS no session user and auth.uid() returns NULL.
-- The triggers dutifully record who did it, and record nobody. 33 of 135
-- activity_log rows are already actorless, and the newest of them are from today
-- — this is actively rotting, not a historical scar.
--
-- 20260713000001 fixed the same rot for comments by reading the actor off the
-- row (task_comments.user_id). That worked because a comment HAS an author: the
-- actor is a property of the row. A status change is not like that. "Who moved
-- this to Done" is a property of the ACTION, not of the task — the task has no
-- column that means it, and any column we invented would be a durable field
-- answering a per-statement question. The next service write that forgot to set
-- it would silently inherit the previous actor's name, and a WRONG actor is
-- worse than no actor: it is a false audit trail. (Deletes are worse still —
-- OLD can only ever tell you who touched the row *before* the person deleting
-- it.)
--
-- So the actor travels with the request, not with the row. PostgREST exposes
-- every request header to the transaction as `request.headers`, and the API's
-- service client now sends the acting user as `x-seeko-actor` (see
-- src/lib/supabase/service.ts → getServiceClientAs). current_actor_id() below
-- resolves it. Nothing to keep in sync, nothing that can go stale: a statement
-- either arrives with an actor or it doesn't.
--
-- Trust model, in precedence order:
--   1. auth.uid() ALWAYS wins. It is derived from a signed JWT and cannot be
--      forged, so a logged-in browser can never claim to be someone else by
--      setting a header.
--   2. Only the service role may name an actor at all. A request that is not
--      service-role asking to be attributed to a user id is exactly the request
--      we must refuse — and the service-role key never leaves the server.
--   3. An actor who is not a real profile is discarded. A garbage header would
--      otherwise raise an FK violation inside the trigger and take the whole
--      task write down with it. Falling back to NULL keeps the write alive and
--      degrades to the status quo.
-- At every step the failure mode is "no actor", never "the wrong actor".

create or replace function public.current_actor_id()
returns uuid
language plpgsql
stable
set search_path = public, pg_temp
as $function$
declare
  claimed uuid;
begin
  -- A real session always wins; see the trust model above.
  if auth.uid() is not null then
    return auth.uid();
  end if;

  if coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) is distinct from 'service_role' then
    return null;
  end if;

  -- Direct psql/migration sessions have no request.headers at all, so this stays
  -- NULL there rather than erroring — hence the missing_ok flag and the nullif
  -- (an empty GUC is not valid json).
  begin
    claimed := nullif(
      nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-seeko-actor',
      ''
    )::uuid;
  exception when others then
    return null;  -- malformed header: no actor beats a wrong actor
  end;

  if claimed is not null and not exists (select 1 from public.profiles where id = claimed) then
    return null;
  end if;

  return claimed;
end;
$function$;

comment on function public.current_actor_id() is
  'Who is performing the current statement: the JWT user if there is one, else the '
  'x-seeko-actor header when (and only when) the caller is the service role and the '
  'id names a real profile. Every audit trigger stamps this instead of auth.uid(), '
  'which is NULL behind the service-role API. Fails to NULL, never to a wrong actor.';

-- WHAT is performing it, alongside WHO. activity_log.source brands a row 'eko' when
-- the write came from the agent's executors rather than from someone's hands, and
-- the feed renders that badge. It is the same kind of fact as the actor — a property
-- of the request — so it travels the same way instead of being bolted on afterwards.
--
-- That matters because the old way was a race. eko-activity.ts committed the write,
-- then SELECTed "the newest activity row for this task" and UPDATEd source + user_id
-- onto whatever came back — a read-modify-write against a row it never saw created.
-- Two writes to one task in the same moment and the brand (and the actor!) lands on
-- the wrong event. Stamping both in the trigger, inside the same statement that
-- creates the row, makes that unrepresentable rather than unlikely.
create or replace function public.current_actor_source()
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $function$
declare
  claimed text;
begin
  begin
    claimed := nullif(
      nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-seeko-source',
      ''
    );
  exception when others then
    return 'human';
  end;

  -- Whitelist, not passthrough: an unknown value would silently create a badge
  -- nothing renders. Anything we don't recognise is a person until proven otherwise.
  if claimed = 'eko' then
    return 'eko';
  end if;
  return 'human';
end;
$function$;

comment on function public.current_actor_source() is
  'Whether the current statement is a human action or an EKO agent write, from the '
  'x-seeko-source header. Defaults to human. Audit triggers stamp activity_log.source '
  'with this so the brand lands on the row being written, not on a row guessed afterwards.';

-- ── The five audit functions ────────────────────────────────────────────────
-- Bodies are otherwise unchanged: auth.uid() → current_actor_id(), and every insert
-- now also stamps `source` (it previously fell to its 'human' default and was patched
-- after the fact for EKO writes). Both are read ONCE per statement into locals — a
-- single event must not be able to disagree with itself about who caused it.

create or replace function public.tasks_audit_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  actor_id      uuid;
  actor_source  text;
  assignee_name text;
begin
  actor_id := public.current_actor_id();
  actor_source := public.current_actor_source();
  insert into public.activity_log (user_id, action, target, task_id, kind, after_value, source)
  values (
    actor_id, 'task.created', new.name, new.id, 'created',
    jsonb_build_object(
      'status', new.status::text,
      'assignee_id', new.assignee_id,
      'progress', new.progress
    ),
    actor_source
  );
  if new.assignee_id is not null then
    select display_name into assignee_name from public.profiles where id = new.assignee_id;
    insert into public.activity_log (user_id, action, target, task_id, source)
    values (actor_id, 'Assigned', 'task: ' || new.name || ' → ' || coalesce(assignee_name, 'someone'), new.id, actor_source);
  end if;
  return new;
end;
$function$;

create or replace function public.tasks_audit_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  actor_id      uuid;
  actor_source  text;
  assignee_name text;
begin
  actor_id := public.current_actor_id();
  actor_source := public.current_actor_source();
  if old.status is distinct from new.status then
    insert into public.activity_log (user_id, action, target, task_id, kind, before_value, after_value, source)
    values (actor_id, 'task.status_changed', new.name, new.id, 'status_changed',
            to_jsonb(old.status::text), to_jsonb(new.status::text), actor_source);
  end if;
  if old.assignee_id is distinct from new.assignee_id then
    insert into public.activity_log (user_id, action, target, task_id, kind, before_value, after_value, source)
    values (actor_id, 'task.assignee_changed', new.name, new.id, 'assignee_changed',
            to_jsonb(old.assignee_id), to_jsonb(new.assignee_id), actor_source);
    if new.assignee_id is not null then
      select display_name into assignee_name from public.profiles where id = new.assignee_id;
      insert into public.activity_log (user_id, action, target, task_id, source)
      values (actor_id, 'Assigned', 'task: ' || new.name || ' → ' || coalesce(assignee_name, 'someone'), new.id, actor_source);
    end if;
  end if;
  if old.progress is distinct from new.progress then
    insert into public.activity_log (user_id, action, target, task_id, kind, before_value, after_value, source)
    values (actor_id, 'task.progress_changed', new.name, new.id, 'progress_changed',
            to_jsonb(old.progress), to_jsonb(new.progress), actor_source);
  end if;
  if old.priority is distinct from new.priority then
    insert into public.activity_log (user_id, action, target, task_id, source)
    values (actor_id, 'Changed priority', 'task: ' || new.name || ' → ' || new.priority::text, new.id, actor_source);
  end if;
  if old.department is distinct from new.department then
    insert into public.activity_log (user_id, action, target, task_id, source)
    values (actor_id, 'Changed department', 'task: ' || new.name || ' → ' || coalesce(new.department::text, 'none'), new.id, actor_source);
  end if;
  return new;
end;
$function$;

create or replace function public.tasks_audit_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into public.activity_log (user_id, action, target, task_id, source)
  values (public.current_actor_id(), 'Deleted', 'task: ' || old.name, null, public.current_actor_source());
  return old;
end;
$function$;

create or replace function public.task_milestone_audit_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  t_name text;
  m_name text;
begin
  select name into t_name from public.tasks where id = new.task_id;
  select name into m_name from public.milestones where id = new.milestone_id;
  insert into public.activity_log (user_id, action, target, task_id, kind, after_value, source)
  values (
    public.current_actor_id(),
    'task.milestone_linked',
    t_name,
    new.task_id,
    'milestone_linked',
    to_jsonb(coalesce(m_name, new.milestone_id::text)),
    public.current_actor_source()
  );
  return new;
end;
$function$;

create or replace function public.task_milestone_audit_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  t_name text;
  m_name text;
begin
  select name into t_name from public.tasks where id = old.task_id;
  if t_name is null then
    return old;
  end if;

  select name into m_name from public.milestones where id = old.milestone_id;
  insert into public.activity_log (user_id, action, target, task_id, kind, before_value, source)
  values (
    public.current_actor_id(),
    'task.milestone_unlinked',
    t_name,
    old.task_id,
    'milestone_unlinked',
    to_jsonb(coalesce(m_name, old.milestone_id::text)),
    public.current_actor_source()
  );
  return old;
end;
$function$;
