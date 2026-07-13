import { useEffect, useRef, useState, type RefObject } from 'react';
import { CircleHelp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TOUCH_TARGET } from '@/components/public/PublicLink';

/**
 * The chrome bar shared by the routes a signed-OUT visitor can land on:
 * /login, /legal/*, and /404. Wordmark left, Help & Support right.
 *
 * It is the same bar on every one of them, and that is the feature. `/404` is
 * the screen where a user is most disoriented — a wrong link, a stale bookmark,
 * a typo — and it used to be the one screen in the product with no landmark
 * saying where they'd landed and no escape hatch that wasn't a guess. A visitor
 * who isn't signed in can't even use the in-app CTAs; this bar's mailto is the
 * only door they have.
 *
 * FIXED, not absolute — load-bearing, not cosmetic. /login's root reserves a
 * scrollbar gutter on both edges (so its card doesn't shift ~7px when the email
 * form overflows). A gutter insets the PADDING box, which is exactly what an
 * `absolute inset-x-0` child resolves against — so the bar rendered 15px in from
 * where its `sm:px-10` claimed, but only on classic-scrollbar machines (overlay
 * scrollbars reserve no gutter, so it silently agreed on a default Mac and
 * diverged elsewhere). `fixed` measures from the viewport and is immune.
 *
 * `scroller` opts into the scroll-edge material: pass the ref of the element
 * that actually scrolls and the bar grows a blur + hairline once content is
 * beneath it, instead of colliding with bare text. Routes with nothing to
 * scroll under it (the 404) omit it and the bar stays bare chrome on the canvas.
 */

export function PublicTopBar({ scroller }: { scroller?: RefObject<HTMLElement | null> }) {
  const [scrolledUnder, setScrolledUnder] = useState(false);
  const armed = useRef(Boolean(scroller));

  useEffect(() => {
    const el = scroller?.current;
    if (!el) return;
    const onScroll = () => setScrolledUnder(el.scrollTop > 8);
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [scroller]);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-6 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-10 sm:py-8',
        // Named for the view transition BETWEEN public routes: the bar is
        // pixel-identical on all of them, so the browser has nothing to
        // interpolate and it simply holds still while the page changes
        // underneath it. See globals.css.
        '[view-transition-name:public-chrome]',
        'transition-[background-color,box-shadow] duration-200 ease-out',
        armed.current && scrolledUnder
          ? 'bg-white/80 dark:bg-[#171717]/80 backdrop-blur-[20px] backdrop-saturate-150 shadow-seeko contrast-more:bg-white dark:contrast-more:bg-[#171717]'
          : 'bg-transparent',
      )}
    >
      <div className="flex items-center gap-2.5">
        {/* Refined gray mark (#6E6E6E) from the Paper reference header (27P-0).
            24px keeps it proportionate to the 16px label. brightness() multiplies
            the sRGB value directly: 110 × 1.35 ≈ 148 = #949494, landing the mark
            on the same tier as the labels beside it. */}
        <img src="/seeko-mark.svg" alt="SEEKO" className="size-6 dark:brightness-[1.35]" />
        {/* ink-faint in dark (#949494, 5.9:1) is the dimmest tier that still
            clears AA here. The Figma LOGIN/DARK pin (#3e3e3e) measured 1.68:1 —
            below the 3:1 floor for a graphic, let alone the 4.5:1 a 16px label
            needs. Quieter than light's mirror tier, but readable. */}
        <span className="text-base font-medium text-ink-muted-strong dark:text-ink-faint">Studio</span>
      </div>
      <a
        href="mailto:legal@seekostudios.com?subject=SEEKO%20Studio%20help"
        className={cn(
          'flex items-center gap-2 text-base text-ink-muted-strong dark:text-ink-faint',
          TOUCH_TARGET,
          'transition-colors duration-150 hover:text-ink active:text-ink-title',
        )}
      >
        <CircleHelp className="size-[18px]" strokeWidth={1.75} />
        Help &amp; Support
      </a>
    </header>
  );
}
