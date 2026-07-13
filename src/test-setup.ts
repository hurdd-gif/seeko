import '@testing-library/jest-dom';

// Original dashboard components (lib/supabase/client.ts, SettingsPanel, …) call
// createBrowserClient at RENDER time, reading the public Supabase URL + anon key
// off the Node env. jsdom/Node has no Supabase config loaded, and
// createBrowserClient throws on an empty URL — so seed syntactically-valid
// placeholders (no network is made; the values only satisfy URL/key validation).
//
// The service-role key is here for the same reason on the server side: the task
// routes build an actor-bound service client (getServiceClientAs) to name who
// performed a write, even when the repo function itself is injected, so a route
// test that never touches Supabase still constructs one.
{
  const proc = (globalThis as Record<string, unknown>)['process'] as
    | { env?: Record<string, string | undefined> }
    | undefined;
  const e = proc?.['env'];
  if (e) {
    e['NEXT_PUBLIC_SUPABASE_URL'] ||= 'https://placeholder.supabase.co';
    e['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ||= 'placeholder-anon-key';
    e['SUPABASE_SERVICE_ROLE_KEY'] ||= 'placeholder-service-role-key';
  }
}

// jsdom ships no matchMedia, but motion/react's useReducedMotion and our
// useIsDesktop probe it. Stub a non-matching query so hooks resolve to their
// safe defaults (reduced-motion OFF, viewport below the desktop breakpoint =
// mobile) instead of crashing.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// jsdom has no ResizeObserver, but DialKit's internals (mounted by the 404
// page's dev tuning panel) construct one at render time. A no-op stub keeps
// those components renderable in tests.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (typeof HTMLCanvasElement !== 'undefined') {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ({
    clearRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fillRect: () => {},
    drawImage: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
    createImageData: () => ({ data: new Uint8ClampedArray(4) }),
    setTransform: () => {},
    resetTransform: () => {},
    scale: () => {},
    save: () => {},
    restore: () => {},
    arc: () => {},
    fill: () => {},
    // @outpacelabs/avatars paints mesh-gradient avatar fallbacks with radial
    // gradients in a mount effect — the stub gradient just needs addColorStop.
    createRadialGradient: () => ({ addColorStop: () => {} }),
    }),
  });
}
