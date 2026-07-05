// next/navigation shim — backs the ORIGINAL dashboard components' router calls
// with react-router equivalents so they run unchanged inside the rr-app.
import { useContext } from 'react';
import {
  useNavigate,
  useLocation,
  UNSAFE_DataRouterContext,
  useSearchParams as useRouterSearchParams,
  redirect as routerRedirect,
} from 'react-router';

export interface NextRouter {
  push: (href: string) => void;
  replace: (href: string) => void;
  back: () => void;
  forward: () => void;
  refresh: () => void;
  prefetch: (href: string) => void;
}

export function useRouter(): NextRouter {
  const navigate = useNavigate();
  // useRevalidator() throws outside a data router (plain <MemoryRouter> in
  // tests), so reach the router through its context and no-op when absent.
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  return {
    push: (href) => navigate(href),
    replace: (href) => navigate(href, { replace: true }),
    back: () => navigate(-1),
    forward: () => navigate(1),
    // Next's router.refresh() re-fetches server data for the current route.
    // Re-running the active route's loaders is the data-router equivalent —
    // navigate(0) would history.go(0) into a full document reload.
    refresh: () => {
      void dataRouter?.router.revalidate();
    },
    prefetch: () => {},
  };
}

export function usePathname(): string {
  return useLocation().pathname;
}

export function useSearchParams(): URLSearchParams {
  const [params] = useRouterSearchParams();
  return params;
}

export function redirect(url: string): never {
  throw routerRedirect(url);
}

export function notFound(): never {
  throw new Response('Not Found', { status: 404 });
}
