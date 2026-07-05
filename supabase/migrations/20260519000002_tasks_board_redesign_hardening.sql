-- Tighten trigger functions added in 20260519000001:
--   • Lock search_path on the BEFORE-UPDATE touch function.
--   • Revoke RPC executability on all new audit/touch trigger functions.
--     They only need to fire as triggers; the default PUBLIC grant exposes
--     them via PostgREST as /rest/v1/rpc/<name>, which is unwanted.

ALTER FUNCTION public.tasks_touch_updated_at() SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.tasks_touch_updated_at()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tasks_audit_insert()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tasks_audit_update()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tasks_audit_delete()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.task_milestone_audit_insert()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.task_milestone_audit_delete()   FROM PUBLIC, anon, authenticated;
