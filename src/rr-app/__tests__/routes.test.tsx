import { describe, expect, it } from 'vitest';
import { routeInventory } from '../routes';

describe('React Router route inventory', () => {
  it('tracks all app routes', () => {
    expect(routeInventory.map((route) => route.path)).toEqual([
      '/',
      '/login',
      '/set-password',
      '/onboarding',
      '/agreement',
      '/docs',
      '/tasks',
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

  it('marks token/auth utility routes outside primary nav', () => {
    const hiddenRoutes = routeInventory.filter((route) => route.showInNav === false);

    expect(hiddenRoutes.map((route) => route.path)).toEqual([
      '/login',
      '/set-password',
      '/onboarding',
      '/agreement',
      '/tasks/:id',
      '/investor-preview',
      '/invoice/:token',
      '/shared/:token',
      '/sign/:token',
      '/sign/qa',
      '*',
    ]);
  });

  it('registers a hidden catch-all not-found route', () => {
    const catchAll = routeInventory.find((route) => route.path === '*');

    expect(catchAll).toBeDefined();
    expect(catchAll && 'showInNav' in catchAll && catchAll.showInNav).toBe(false);
  });
});
