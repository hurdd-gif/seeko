'use client';

import { InterfaceKit } from 'interface-kit/react';

/**
 * Renders the InterfaceKit visual editor in development only.
 * Loads via 'use client' to avoid SSR; the package itself is
 * dev-only — no runtime cost in production builds.
 */
export function InterfaceKitProvider() {
  if (process.env.NODE_ENV !== 'development') return null;
  return <InterfaceKit />;
}
