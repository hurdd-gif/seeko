CREATE TABLE task_handoffs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES profiles(id),
  to_user_id   uuid NOT NULL REFERENCES profiles(id),
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE task_handoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read task_handoffs"
  ON task_handoffs FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert own handoffs"
  ON task_handoffs FOR INSERT
  WITH CHECK (auth.uid() = from_user_id);
