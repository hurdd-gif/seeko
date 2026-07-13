/* Route ids shared between the router config and the route modules.
 *
 * These live in their own module ON PURPOSE, and it must stay dependency-free.
 * routes.tsx needs the id at config time (eagerly, in the entry chunk), while
 * the route module that answers to it is lazy. Importing the id straight from
 * the route module would pull that module — and everything it touches, `motion`
 * included — back into the eager graph and undo the code-splitting.
 *
 * A bare literal on each side would work too, but a drifted id fails at
 * runtime: useRouteLoaderData() silently returns undefined and the child route
 * dies dereferencing it. One const, imported by both sides, makes that a
 * compile error instead. */

/** The investor cluster's layout route. Owns /api/investor-index for every
 *  child; children read it back with useRouteLoaderData(this id) rather than
 *  fetching it again. See routes/investor-layout.tsx. */
export const INVESTOR_LAYOUT_ROUTE_ID = 'investor-layout';
