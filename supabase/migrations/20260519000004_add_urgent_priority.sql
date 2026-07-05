-- Add 'Urgent' to the priority enum, positioned BEFORE 'High' so it sorts
-- at the top when ordering by priority. Postgres enums sort by declaration
-- order, so BEFORE 'High' places Urgent above all existing values.
--
-- ALTER TYPE … ADD VALUE is non-transactional in older PG versions, but
-- PG14+ (Supabase default) supports running this inside a migration tx
-- as long as the type isn't used in the same transaction. Safe here —
-- this migration only touches the enum.

ALTER TYPE public.priority ADD VALUE IF NOT EXISTS 'Urgent' BEFORE 'High';
