-- Add task_id and doc_id to activity_log so "Open in Tasks/Documents" can deep-link.
alter table public.activity_log
  add column if not exists task_id uuid references public.tasks(id) on delete set null,
  add column if not exists doc_id uuid references public.docs(id) on delete set null;

comment on column public.activity_log.task_id is 'When set, link activity to this task (e.g. for /tasks?task=id).';
comment on column public.activity_log.doc_id is 'When set, link activity to this doc (e.g. for /docs?doc=id).';
