CREATE TABLE IF NOT EXISTS task_handoffs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES profiles(id),
  to_user_id   uuid NOT NULL REFERENCES profiles(id),
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE task_handoffs ENABLE ROW LEVEL SECURITY;

do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'Authenticated users can read task_handoffs' and tablename = 'task_handoffs'
  ) then
    CREATE POLICY "Authenticated users can read task_handoffs"
      ON task_handoffs FOR SELECT
      USING (auth.role() = 'authenticated');
  end if;
  if not exists (
    select 1 from pg_policies where policyname = 'Users can insert own handoffs' and tablename = 'task_handoffs'
  ) then
    CREATE POLICY "Users can insert own handoffs"
      ON task_handoffs FOR INSERT
      WITH CHECK (auth.uid() = from_user_id);
  end if;
end $$;
