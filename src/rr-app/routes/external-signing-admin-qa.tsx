import { ExternalSigningAdminRouteContent } from './external-signing-admin';

/* No-backend visual-QA preview for the External Signing admin, reachable at
 * /admin/external-signing/qa WITHOUT the loader's admin gate.
 *
 * The route now renders the ORIGINAL <ExternalSigningAdmin> composition verbatim
 * (full-bleed <LightShell> drill-in + the real <SendInviteForm> + <InviteTable>),
 * so it previews the true refreshed chrome and the live SendInviteForm. Note the
 * trade-off vs. the former scaffold: <InviteTable> self-fetches its rows from the
 * browser Supabase client, so WITHOUT a session it settles on its empty state
 * rather than the old fixed fixture spanning every custody phase. Exercise the
 * full amber/azure/green/grey/red status ladder against a real Supabase session
 * (or via InviteTable's own unit tests). NOT a migration target — deliberately
 * absent from routeInventory. */
export function ExternalSigningAdminQaRoute() {
  return <ExternalSigningAdminRouteContent data={{ status: 'ready' }} />;
}
