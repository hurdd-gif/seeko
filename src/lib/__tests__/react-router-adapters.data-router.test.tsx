import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router';
import { useDataRouter } from '@/lib/react-router-adapters';

describe('useDataRouter', () => {
  it('returns null outside a data router', () => {
    const { result } = renderHook(() => useDataRouter(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    });
    expect(result.current).toBeNull();
  });

  it('returns the router inside a data router', () => {
    let captured: unknown = undefined;
    function Probe() {
      captured = useDataRouter();
      return null;
    }
    const router = createMemoryRouter([{ path: '/', element: <Probe /> }]);
    renderHook(() => null, {
      wrapper: () => <RouterProvider router={router} />,
    });
    expect(captured).not.toBeNull();
    expect(typeof (captured as { revalidate: unknown }).revalidate).toBe('function');
  });
});
