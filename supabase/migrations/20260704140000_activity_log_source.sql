-- EKO attribution for activity_log.
--
-- Every activity row previously carried only `user_id` (the acting profile),
-- so a write the gated EKO agent executed on an admin's behalf was
-- indistinguishable from that admin doing it by hand — the feed showed a plain
-- "created this task" / "assigned to …" under the admin's avatar.
--
-- `source` names the actor that wrote the row:
--   'human' — manual UI actions and DB-trigger rows (the default, so every
--             existing row and every trigger-written row stays correct)
--   'eko'   — a write EKO's executors performed (create / status / assignee)
--
-- The activity feed renders EKO's own badge + name for source='eko' instead of
-- impersonating the admin who ran the agent.
alter table public.activity_log
  add column if not exists source text not null default 'human';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'activity_log_source_check'
  ) then
    alter table public.activity_log
      add constraint activity_log_source_check check (source in ('human', 'eko'));
  end if;
end $$;
