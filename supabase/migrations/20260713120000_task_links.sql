-- Symmetric, untyped "connected tasks" links between two tasks.
--
-- SYMMETRY IS STORED, NOT DERIVED. "A is connected to B" and "B is connected to A"
-- are THE SAME ROW — not two rows, and not a row plus a mirror. The mechanism is
-- the CHECK (task_a < task_b): the smaller uuid is ALWAYS task_a, so a pair has
-- exactly ONE canonical representation and the primary key (task_a, task_b) can
-- enforce uniqueness on it.
--
-- CONSEQUENCE FOR EVERY CALLER: sort the pair before you touch this table —
-- `const [a, b] = [taskId, linkedTaskId].sort()`. Skip the sort and an INSERT
-- violates the check constraint, while a DELETE silently matches ZERO rows: no
-- error, no unlink, no clue. See src/api-server/routes/tasks.ts.
--
-- Reads are symmetric too: "what is task X connected to?" is
-- `where task_a = X or task_b = X`, then take whichever column is NOT X.

create table public.task_links (
  task_a     uuid not null references public.tasks(id) on delete cascade,
  task_b     uuid not null references public.tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,

  primary key (task_a, task_b),

  -- THE canonical-ordering rule: the smaller uuid is always task_a. This is what
  -- collapses (A,B) and (B,A) into a single row and lets the PK dedupe the pair.
  constraint task_links_canonical_order check (task_a < task_b),
  -- Implied by the strict `<` above (nothing is < itself), but stated explicitly
  -- so a reader doesn't have to derive "no self-links" from the ordering rule.
  constraint task_links_no_self_link check (task_a <> task_b)
);

-- The PK already indexes task_a (its leading column). A symmetric read touches
-- BOTH columns (`task_a = X or task_b = X`), so task_b needs an index of its own
-- or that half of the OR degrades to a sequential scan.
create index task_links_task_b_idx on public.task_links (task_b);

alter table public.task_links enable row level security;

-- SELECT: any authenticated user. Link visibility follows task visibility, which
-- the server-side loaders already scope.
create policy "task_links_select_authenticated"
  on public.task_links for select
  to authenticated
  using (true);

-- INSERT / UPDATE / DELETE: no policy for `authenticated` — writes are
-- service-role (API) only, matching the newest tasks convention in
-- 20260710200000_tasks_api_only_writes.sql. ANY signed-in user MAY link/unlink
-- (same rule as POST/PATCH /api/tasks), but only through
-- POST/DELETE /api/tasks/:taskId/links, which authenticates the caller and then
-- writes with the RLS-bypassing service role.

comment on table public.task_links is
  'Symmetric, untyped connections between two tasks. (A,B) and (B,A) are the SAME row: CHECK (task_a < task_b) forces the smaller uuid into task_a so the PK dedupes the pair. Callers MUST sort the pair before every read/write — an unsorted DELETE silently matches nothing. Writes are service-role/API-only.';
