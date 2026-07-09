import React, { lazy, Suspense, type ComponentType, type ImgHTMLAttributes, type ReactNode } from 'react';
import { Link as RouterLink, UNSAFE_DataRouterContext, useInRouterContext, useLocation, useNavigate, useSearchParams as useRouterSearchParams } from 'react-router';

type LinkProps = Omit<React.ComponentProps<typeof RouterLink>, 'to'> & {
  href?: string;
  to?: React.ComponentProps<typeof RouterLink>['to'];
};

export function Link({ href, to, ...props }: LinkProps) {
  const inRouter = useInRouterContext();
  const destination = to ?? href ?? '#';

  if (!inRouter) {
    const anchorHref = typeof destination === 'string' ? destination : '#';
    return <a href={anchorHref} {...props} />;
  }

  return <RouterLink to={destination} {...props} />;
}

type ImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  priority?: boolean;
  fill?: boolean;
  unoptimized?: boolean;
};

export function Image({ priority: _priority, fill: _fill, unoptimized: _unoptimized, ...props }: ImageProps) {
  return <img {...props} />;
}

export function usePathname() {
  return useLocation().pathname;
}

export function useRouter() {
  const navigate = useNavigate();
  // useRevalidator() throws outside a data router (plain <MemoryRouter> in
  // tests), so reach the router through its context and no-op when absent.
  const dataRouter = React.useContext(UNSAFE_DataRouterContext);
  return {
    push: (to: string, options?: { replace?: boolean; scroll?: boolean }) => navigate(to, { replace: options?.replace }),
    replace: (to: string, _options?: { scroll?: boolean }) => navigate(to, { replace: true }),
    // Next's router.refresh() re-fetches server data in place; re-running the
    // active route's loaders is the data-router equivalent (no full reload).
    refresh: () => {
      void dataRouter?.router.revalidate();
    },
    back: () => navigate(-1),
  };
}

export function useSearchParams() {
  const [params] = useRouterSearchParams();
  return params;
}

type DynamicOptions = {
  ssr?: boolean;
  loading?: ComponentType | (() => ReactNode);
};

export function dynamic<P extends object = Record<string, unknown>>(
  loader: () => Promise<{ default: ComponentType<P> } | ComponentType<P>>,
  options: DynamicOptions = {}
) {
  const LazyComponent = lazy(async () => {
    const loaded = await loader();
    return typeof loaded === 'function' ? { default: loaded } : loaded;
  });
  const Loading = options.loading;

  return function DynamicComponent(props: P) {
    return (
      <Suspense fallback={Loading ? <Loading /> : null}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}
