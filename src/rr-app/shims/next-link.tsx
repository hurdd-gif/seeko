// next/link shim — lets the rr-app render the ORIGINAL dashboard components
// (which import `next/link`) verbatim, so migrated pages stay pixel-faithful to
// the Next.js originals instead of drifting as hand-rebuilt copies.
//
// Maps Next's <Link href> onto react-router's <Link to>, dropping the Next-only
// props (prefetch/scroll/shallow/…) that react-router doesn't accept.
import { forwardRef } from 'react';
import {
  Link as RouterLink,
  useInRouterContext,
  type LinkProps as RouterLinkProps,
} from 'react-router';

// Drop `prefetch` from react-router's props before redeclaring it: RR types it
// as a string union ("intent" | "render" | …), so intersecting with Next's
// boolean form would collapse to `never`. The shim consumes (and discards) the
// Next-only props below, so they never reach the DOM either way.
type NextLinkProps = Omit<RouterLinkProps, 'to' | 'prefetch'> & {
  href: RouterLinkProps['to'];
  prefetch?: boolean | null;
  scroll?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  locale?: string | false;
  legacyBehavior?: boolean;
};

const Link = forwardRef<HTMLAnchorElement, NextLinkProps>(function Link(
  { href, prefetch, scroll, shallow, passHref, locale, legacyBehavior, ...rest },
  ref
) {
  // react-router's <Link> throws when rendered without a router (it reads the
  // navigation context). The real next/link renders a plain <a> anywhere, so
  // when there's no router — chiefly the legacy components' isolated unit tests —
  // degrade to an anchor instead of crashing. `to` only accepts a string/Partial
  // path; coerce that to an href string for the bare-anchor fallback.
  const inRouter = useInRouterContext();
  if (!inRouter) {
    const hrefStr =
      typeof href === 'string'
        ? href
        : `${href.pathname ?? ''}${href.search ?? ''}${href.hash ?? ''}`;
    return <a ref={ref} href={hrefStr} {...rest} />;
  }
  return <RouterLink ref={ref} to={href} {...rest} />;
});

export default Link;
