-- Add payment-related notification kinds
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'payment_request';
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'payment_approved';
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'payment_denied';
