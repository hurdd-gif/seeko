// next/dynamic shim — maps Next's dynamic() onto React.lazy + Suspense so the
// ORIGINAL components' lazy-loaded children (notification bell, doc viewer, etc.)
// resolve in the rr-app. `ssr: false` is a no-op here (client-only already).
import { lazy, Suspense, type ComponentType, type JSX, type ReactNode } from 'react';

type DynamicOptions = {
  ssr?: boolean;
  loading?: () => ReactNode;
};

type Loaded<P> = { default: ComponentType<P> } | ComponentType<P>;

export default function dynamic<P extends object = Record<string, unknown>>(
  importFn: () => Promise<Loaded<P>>,
  options: DynamicOptions = {}
): ComponentType<P> {
  const Lazy = lazy(async () => {
    const mod = await importFn();
    const Comp = (mod as { default?: ComponentType<P> }).default ?? (mod as ComponentType<P>);
    return { default: Comp };
  });

  const Loading = options.loading;

  return function DynamicComponent(props: P) {
    return (
      <Suspense fallback={Loading ? <Loading /> : null}>
        <Lazy {...(props as P & JSX.IntrinsicAttributes)} />
      </Suspense>
    );
  };
}
