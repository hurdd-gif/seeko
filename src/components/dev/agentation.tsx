import { lazy, Suspense } from 'react';

/** Agentation: click any element in the running app to annotate it; the overlay
 *  emits the selector, source path and component hierarchy as structured
 *  context for a coding agent (it also speaks MCP, see .mcp.json).
 *
 *  This is the Vite port of the pre-migration wrapper, which used Next's
 *  `dynamic(..., { ssr: false })` — there is no SSR here, so the job of the
 *  lazy import is different: keeping the dev-only toolbar out of the shipped
 *  bundle.
 *
 *  The `import.meta.env.DEV` check sits on the CONST, not just inside the
 *  component. Vite substitutes it with a literal `false` in a production build,
 *  so the whole `lazy(() => import('agentation'))` branch is dead code and
 *  Rollup drops the dynamic import with it — no agentation chunk is emitted.
 *  Guarding only inside the component body would still emit the chunk (it would
 *  just never be fetched). */
const Agentation = import.meta.env.DEV
  ? lazy(() => import('agentation').then((mod) => ({ default: mod.Agentation })))
  : null;

export function DevAgentation() {
  if (!Agentation) return null;

  return (
    <Suspense fallback={null}>
      <Agentation />
    </Suspense>
  );
}
