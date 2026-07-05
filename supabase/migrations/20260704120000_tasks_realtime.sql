-- Broadcast tasks changes over Supabase Realtime so the Issues board can
-- revalidate live instead of requiring a manual refresh. Mirrors how
-- notifications joined the publication (20260305000004_notifications.sql).
-- Subscribers still pass through RLS: only authenticated users receive rows.
alter publication supabase_realtime add table public.tasks;
