-- Close the last hole in the append-only guarantee on public.payment_adjustments.
--
-- The previous migration revoked UPDATE and DELETE, but Supabase's default grants
-- also hand `authenticated` TRUNCATE and TRIGGER. TRUNCATE is not a row operation:
-- RLS never sees it, so the admin policy cannot gate it, and one statement would
-- erase every superseded amount in the table. TRIGGER would let a caller attach a
-- trigger to the ledger. Neither is reachable through PostgREST today, but the
-- table is supposed to be append-only by GRANT, not by "no endpoint exposes it".
revoke truncate, trigger on public.payment_adjustments from authenticated;
