import { describe, expect, it } from 'vitest';
import { routeInventory, router } from '../routes';

describe('React Router migration route inventory', () => {
  it('starts with public token routes before dashboard and auth routes', () => {
    const publicTokenRoutes = routeInventory.filter((route) => route.migrationOrder === 1);

    expect(publicTokenRoutes.map((route) => route.path)).toEqual([
      '/invoice/:token',
      '/shared/:token',
      '/sign/:token',
    ]);
  });

  it('keeps a source Next file for every route target', () => {
    expect(routeInventory.every((route) => route.nextFile.startsWith('src/app/'))).toBe(true);
  });

  it('gives every standalone loader route a Paper error boundary', () => {
    // Standalone routes render OUTSIDE RootLayout, so the root ErrorBoundary
    // can't catch their loader failures. Without their own boundary, an API-down
    // loader throw drops the user onto React Router's raw developer error page —
    // off-brand. Each standalone route with a loader must carry a boundary.
    const standaloneLoaderPaths = [
      '/onboarding',
      '/agreement',
      '/invoice/:token',
      '/shared/:token',
      '/sign/:token',
    ];

    for (const path of standaloneLoaderPaths) {
      const route = router.routes.find((entry) => entry.path === path);
      expect(route, `route ${path} should exist`).toBeDefined();
      expect(route?.hasErrorBoundary, `route ${path} should have an error boundary`).toBe(true);
    }
  });

  it('tracks all planned migration routes', () => {
    expect(routeInventory.map((route) => route.path)).toEqual([
      '/',
      '/login',
      '/set-password',
      '/onboarding',
      '/agreement',
      '/docs',
      '/issues',
      '/tasks/:id',
      '/team',
      '/payments',
      '/activity',
      '/notifications',
      '/progress',
      '/settings',
      '/admin/external-signing',
      '/investor',
      '/investor/docs',
      '/investor/payments',
      '/investor/settings',
      '/investor-preview',
      '/invoice/:token',
      '/shared/:token',
      '/sign/:token',
      '/sign/qa',
      '*',
    ]);
  });
});
