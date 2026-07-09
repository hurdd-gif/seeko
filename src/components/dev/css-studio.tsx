"use client";

import { useEffect } from "react";

/**
 * Dev-only CSS Studio initializer.
 *
 * CSS Studio (https://www.npmjs.com/package/cssstudio) is a visual CSS editor
 * that pairs an in-app GUI with an agent skill + MCP (`/studio`). It must only
 * run in development and must never ship to end users.
 *
 * The import is dynamic and gated behind `NODE_ENV` so the package (and its
 * vite/esbuild deps) is dead-code-eliminated from the production bundle and
 * never ships to end users.
 */
export function DevCssStudio() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    let cancelled = false;
    import("cssstudio")
      .then(({ startStudio }) => {
        if (!cancelled) startStudio();
      })
      .catch(() => {
        // CSS Studio is a dev-only convenience; never block the app if it fails to load.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
