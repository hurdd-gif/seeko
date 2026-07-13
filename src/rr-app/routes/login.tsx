import { useEffect, useRef, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSearchParams } from '@/lib/react-router-adapters';
import { usePublicViewTransition } from '@/lib/view-transitions';
import { PublicLink, TOUCH_TARGET } from '@/components/public/PublicLink';
import { LoginForm } from '@/components/auth/LoginForm';
import { HalftoneVeil } from '@/components/auth/HalftoneVeil';

/**
 * Login shell per the Paper reference (SK_DB frame 27P-0): centered card on the
 * light canvas, a quiet fixed top bar (wordmark left, Help & Support right),
 * and a legal footnote under the card. The form self-handles all three auth
 * methods via the browser Supabase client + passkey API (sign-in → /tasks,
 * invite → /set-password), so the route needs no loader. The one server signal
 * it surfaces is `?error=` from a failed OAuth callback redirect
 * (api-server/routes/auth.ts sends `auth_callback_failed`).
 */

const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  auth_callback_failed: 'Google sign-in didn’t complete. Please try again.',
};

/**
 * The three legal links under the card. They are inline text inside a wrapping
 * paragraph, so the press CANNOT be the house `scale(0.96)` — transforming an
 * inline box means making it `inline-block`, which stops it wrapping mid-phrase
 * and would leave "Developer Portal Terms of Service" hanging off the column.
 * Dimming is the press language for text; it costs no layout.
 *
 * Fast in, gentle out (60ms / 150ms). A press should land on the frame it's made
 * and release without snapping back. `data-[pending]` renders identically and is
 * held by PublicLink until the lazy /legal chunk actually arrives, so the
 * acknowledgement is one continuous gesture rather than a flicker followed by
 * dead air.
 */
/* UNDERLINED, always. These were distinguished from the sentence around them by
 * a `font-medium` that the remapped weight token rendered at 500 — i.e. nothing —
 * and one step on the ink ramp (#505050 link vs #686868 body, about 1.15:1 against
 * each other). Three links inside a wrapping paragraph, marked only by a grey a
 * shade darker than its neighbours: not identifiable as links, and colour-alone is
 * exactly what WCAG 1.4.1 rules out. The `contrast-more:underline` that was already
 * here is the admission — the right answer was sitting behind a preference almost
 * nobody sets. It's now unconditional, so the variant no longer needs to add it.
 *
 * from-font takes position and thickness from Inter's own metrics instead of the
 * browser's guess, and skip-ink lifts the line around the descenders in "Privacy
 * Policy" and "Developer". */
const FOOTNOTE_LINK = cn(
  'text-ink-body dark:text-ink',
  'underline decoration-from-font underline-offset-2 [text-decoration-skip-ink:auto]',
  'transition-[color,opacity] duration-150 ease-out hover:text-ink-title',
  'active:opacity-55 active:duration-[60ms] data-[pending]:opacity-55',
  'contrast-more:text-ink-title',
);

/* There used to be a "frost halo" here: three stacked backdrop-filter layers
 * behind the card, each pairing a blur with a canvas-colored tint, masked to an
 * ellipse. Its job was to fog the halftone dots where they ran under the card so
 * the field stopped competing with the form.
 *
 * It has no job left. Lowering the dot field (2026-07-11) dropped the veil's top
 * edge to ~76vh, and the halo bottoms out at ~74vh — they no longer overlap, so
 * every layer was blurring flat canvas. Measured: deleting it changed ZERO pixels
 * in light. In dark it changed 27% of them, because tinting a flat color with
 * itself is only a no-op in exact math — at 8 bits it loses a count or two, and
 * the mask's stops turned that rounding loss into visible concentric rings. The
 * opaque card hid the densest ones; they surfaced the moment it went frameless.
 *
 * So: three backdrop-filters of GPU cost, buying one artifact. Gone. If the dot
 * field is ever raised back under the card, this is the thing to reintroduce. */

export function LoginRoute() {
  return <LoginRouteContent />;
}

export function LoginRouteContent() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get('error');
  const callbackError = errorCode ? CALLBACK_ERROR_MESSAGES[errorCode] ?? 'Sign-in failed. Please try again.' : null;

  /* True when we got here from /legal (or the back button out of it) and the
     browser is mid-transition. The transition IS the entrance in that case. */
  const arrivedViaTransition = usePublicViewTransition();

  /* Scroll-edge signal for the fixed top bar — the same seam /legal uses, and
     for the same reason: a fixed bar is only safe if content passing beneath it
     gets separated from it. Here the root IS the scroller (h-dvh + overflow-y-auto),
     so the listener hangs off it rather than an inner element. Login only scrolls
     on short viewports with the email view open, so this stays false most of the
     time and the bar reads as bare chrome on the canvas, as before. */
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrolledUnder, setScrolledUnder] = useState(false);
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onScroll = () => setScrolledUnder(scroller.scrollTop > 8);
    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, []);

  return (
    // The route owns its scrolling (h-dvh + overflow-y-auto) with a gutter
    // reserved on BOTH edges: when the email form expands past the viewport,
    // the document scrollbar used to pop in and nudge the whole page ~7px
    // left. Symmetric gutters keep the card centered in either state.
    // color-scheme: the app body declares dark — override on this white
    // canvas or the scrollbar (visible whenever the email form expands past
    // the viewport) renders as a dark track on the light page. In dark the
    // canvas deepens to the Figma LOGIN/DARK near-black (#171717, below the
    // app's 0.240 ramp by design — reference-scoped, not a ramp change) and
    // the scrollbar follows the scheme.
    <div
      ref={scrollerRef}
      className="overview-light relative flex h-dvh flex-col overflow-y-auto bg-white dark:bg-[#171717] px-4 antialiased pb-[env(safe-area-inset-bottom)] [scrollbar-gutter:stable_both-edges] [color-scheme:light] dark:[color-scheme:dark]"
    >
      {/* Fixed (not absolute) so the field holds the bottom edge of the
          viewport even when the expanded email view scrolls; fixed elements
          paint above static siblings, hence the z-[1] on main. */}
      <HalftoneVeil />

      {/* Top bar — reference geometry: 24px mark + 16px labels, 32/40 padding.
          Structurally identical to /legal's, deliberately: same geometry, same
          tokens, same scroll-edge material, same `fixed`.

          FIXED, not absolute — and that is load-bearing, not cosmetic. This root
          reserves a scrollbar gutter on both edges (`scrollbar-gutter: stable`,
          so the card doesn't shift ~7px when the email form overflows). A gutter
          insets the PADDING box, which is exactly what an `absolute inset-x-0`
          child resolves against — so the bar rendered 15px in from where its own
          `sm:px-10` said it would, i.e. 55px, while /legal's viewport-relative
          fixed bar sat at the spec'd 40px. Identical CSS, 15px apart on screen,
          and only on classic-scrollbar machines (overlay scrollbars reserve no
          gutter, so it silently agreed on a default Mac and diverged elsewhere).
          `fixed` measures from the viewport and is immune to the gutter, so the
          two bars now land on 40px on every platform.

          The material is what makes `fixed` safe: content passing under the bar
          gets a blur + hairline to separate from, instead of colliding with bare
          text. Only appears once something is actually beneath it. */}
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-6 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-10 sm:py-8',
          // Named for the view transition into /legal: the bar is pixel-identical
          // on both pages, so the browser has nothing to interpolate and it simply
          // holds still while the page changes underneath it. See globals.css.
          '[view-transition-name:public-chrome]',
          'transition-[background-color,box-shadow] duration-200 ease-out',
          scrolledUnder
            ? 'bg-white/80 dark:bg-[#171717]/80 backdrop-blur-[20px] backdrop-saturate-150 shadow-seeko contrast-more:bg-white dark:contrast-more:bg-[#171717]'
            : 'bg-transparent',
        )}
      >
        <div className="flex items-center gap-2.5">
          {/* Refined gray mark (#6E6E6E) exported from the Paper reference
              header (27P-0) — replaces the outdated heavy black PNG. 24px
              keeps it proportionate to the 16px label (glyph sits inside
              the box with padding, so 32px read oversized). brightness()
              multiplies the sRGB value directly: 110 × 1.35 ≈ 148 = #949494,
              which lands the mark on the same tier as the labels beside it. */}
          <img src="/seeko-mark.svg" alt="SEEKO" className="size-6 dark:brightness-[1.35]" />
          {/* Dark header labels were pinned to #3e3e3e from Figma LOGIN/DARK as
              "recessive chrome". Measured on the #171717 canvas that is 1.68:1 —
              below WCAG's 3:1 floor for a *graphic*, let alone the 4.5:1 a 16px
              label needs. "Help & Support" is the page's only escape hatch: the
              thing you reach for precisely when you can't get in. It cannot be
              the least legible element on the screen.

              The light half already used the token (`ink-muted-strong`, which the
              light ramp itself annotates as its AA floor), so the pin was only
              ever on the dark half — someone carried a LIGHT lightness into dark.
              `ink-faint` is the dimmest dark tier that still clears AA here
              (#949494, 5.9:1), so the Figma intent survives: quieter than the
              light side's mirror tier, but readable. */}
          <span className="text-base font-medium text-ink-muted-strong dark:text-ink-faint">Studio</span>
        </div>
        <a
          href="mailto:legal@seekostudios.com?subject=SEEKO%20Studio%20sign-in%20help"
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

      {/* Vertically centered. Safe now that the card's height change is a
          real animation (LoginForm pins + WAAPI-glides the container): the
          my-auto recentring rides that same curve instead of snapping.
          Vertical padding is viewport-aware slack, not geometry: the email
          view's content is ~753px, so a fixed py-24 (192px total) made any
          window under 945px sprout a scrollbar the moment the email form
          opened — and lose it on collapse. The clamp keeps the full 96px on
          tall screens and compresses toward 24px as the window shrinks, so
          the email view fits without scrolling down to ~800px-tall windows;
          below that, scrolling is genuine (content taller than viewport). */}
      <main className="relative z-[1] mx-auto my-auto flex w-full max-w-[420px] flex-col items-center py-[clamp(1.5rem,calc((100dvh-780px)/2),6rem)] [view-transition-name:auth-panel]">
        {/* skipEntrance: a view transition snapshots the arriving page at its
            FIRST frame, so a storyboard that starts at opacity 0 would be
            captured — and played — as an empty column. When the browser is
            animating the arrival, it owns the entrance; the storyboard stands
            down and the form renders at rest. See lib/view-transitions.ts. */}
        <LoginForm initialError={callbackError} skipEntrance={arrivedViaTransition} />

        {/* Legal footnote — reference geometry (14px, max 300px, 32px below
            card), lifted off the reference's #969696 (2.7:1, unreadable at 14px).
            Body and links were then hand-picked as #767676 / #5c5c5c: the right
            RELATIONSHIP (links darker = more emphasis) built out of two hexes
            that aren't on the ramp. Both now resolve through it — ink-muted-strong
            body, ink-body links — which holds the same 0.08 L emphasis gap while
            keeping the tagline directly above and this paragraph on ONE tier
            instead of two neighbouring greys that differ by just enough to look
            like a mistake. No scrim behind it (user call): the text sits directly
            on the dot field — mid-density pastels here, not the dense core.

            Dark INVERTS the emphasis. Links darker than body is correct on white
            and backwards on black, where it would make the links the DIMMEST
            thing in the paragraph. Dark puts the body on ink-muted and lifts the
            links a tier ABOVE it, to text-ink. */}
        <div className="relative mt-8">
          {/* leading-normal (1.5), not leading-snug (1.375): this is three lines
              of real reading copy at 14px, not a tagline. Body copy wants 1.5–1.6,
              and the extra leading is also what keeps the new underlines from
              crowding the line beneath them. */}
          <p className="relative max-w-[300px] text-pretty text-center text-sm leading-normal text-ink-muted-strong dark:text-ink-muted contrast-more:text-ink">
          By creating an account, you agree to our{' '}
          <PublicLink to="/legal/terms" className={FOOTNOTE_LINK}>
            Terms of Use
          </PublicLink>
          ,{' '}
          <PublicLink to="/legal/developer-terms" className={FOOTNOTE_LINK}>
            Developer Portal Terms of Service
          </PublicLink>{' '}
          and{' '}
          <PublicLink to="/legal/privacy" className={FOOTNOTE_LINK}>
            Privacy Policy
          </PublicLink>
          </p>
        </div>
      </main>
    </div>
  );
}
