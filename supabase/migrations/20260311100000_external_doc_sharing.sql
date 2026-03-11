-- Add doc sharing columns to external_signing_invites
ALTER TABLE external_signing_invites
  ADD COLUMN IF NOT EXISTS shared_doc_id uuid REFERENCES docs(id),
  ADD COLUMN IF NOT EXISTS session_token text,
  ADD COLUMN IF NOT EXISTS session_ip text,
  ADD COLUMN IF NOT EXISTS session_user_agent text,
  ADD COLUMN IF NOT EXISTS session_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS view_count int DEFAULT 0;
