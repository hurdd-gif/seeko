import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import './globals.css';
import './styles.css';
import { CookieNotice } from '@/components/CookieNotice';
import { LiveToastProvider } from '@/components/dashboard/notifications/LiveToastContext';
import { setAppNavigate } from '@/lib/app-navigate';
import { initScrollEdgeBlurDamper } from '@/lib/scroll-blur';
import { router } from './routes';

// Dims .scroll-edge-blur chrome while any container is scrolling (globals.css).
initScrollEdgeBlurDamper();

// Let code outside the Router context (e.g. rich toasts' "View issue" link)
// perform SPA navigation without importing the router directly.
setAppNavigate((to) => {
  void router.navigate(to);
});

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing root element');
}

// LiveToastProvider wraps the whole app so the realtime NotificationBell (mounted
// by StudioHeaderActions on every Paper page) can push live toasts — useLiveToast
// throws without it. Mirrors the legacy (dashboard)/layout.tsx provider.
createRoot(root).render(
  <StrictMode>
    <LiveToastProvider>
      <RouterProvider router={router} />
      {/* First-visit cookie notice — sits outside the router (it survives
          navigation and uses a plain <a> to reach /legal/privacy). Shows once,
          bottom-right, until acknowledged. Notice-only by legal review: the
          site sets solely strictly-necessary cookies, so there is no consent
          to collect. */}
      <CookieNotice />
      {/* Mirrors the legacy src/app/layout.tsx Toaster — without it every
          sonner toast (success + error feedback) silently vanishes. */}
      {/* No richColors — toasts follow the Delphi alert language (globals.css):
          success stays a neutral quiet card, only errors take the red tint. */}
      <Toaster
        position="top-center"
        // --width matches the rich toast + live toast cards (400px) so mixed
        // stacks share one width instead of stepping in by 22px per side.
        style={{ '--width': '400px' } as React.CSSProperties}
        toastOptions={{
          className: 'seeko-toast',
          duration: 4000,
        }}
      />
    </LiveToastProvider>
  </StrictMode>
);
