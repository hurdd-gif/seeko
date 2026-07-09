-- DocuSign-backed external signing.
-- The local row remains SEEKO's workflow ledger while DocuSign owns the signing ceremony.

ALTER TABLE public.external_signing_invites
  ADD COLUMN IF NOT EXISTS signing_provider text NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS docusign_envelope_id text,
  ADD COLUMN IF NOT EXISTS docusign_status text,
  ADD COLUMN IF NOT EXISTS docusign_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS docusign_last_event_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS external_signing_invites_docusign_envelope_id_key
  ON public.external_signing_invites(docusign_envelope_id)
  WHERE docusign_envelope_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_external_signing_docusign_status
  ON public.external_signing_invites(docusign_status)
  WHERE signing_provider = 'docusign';
