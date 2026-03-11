-- Extend external_signing_invites for invoice support
ALTER TABLE external_signing_invites ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'signing';
ALTER TABLE external_signing_invites ADD COLUMN IF NOT EXISTS prefilled_items jsonb;
ALTER TABLE external_signing_invites ADD COLUMN IF NOT EXISTS submitted_payment_id uuid REFERENCES payments(id);
ALTER TABLE external_signing_invites ADD COLUMN IF NOT EXISTS paypal_email text;

-- Extend payments for external invoices (no profile)
ALTER TABLE payments ALTER COLUMN recipient_id DROP NOT NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS recipient_email text;

-- Index for looking up invoice invites
CREATE INDEX IF NOT EXISTS idx_external_signing_purpose ON external_signing_invites(purpose) WHERE purpose = 'invoice';
