-- Add missing values to notification_kind enum
-- task_completed and deliverable_uploaded were missing, causing 500 on /api/notify/admins

ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'task_completed';
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'deliverable_uploaded';
