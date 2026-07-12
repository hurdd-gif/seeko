import { CircleHelp } from 'lucide-react';
import { Link } from 'react-router';
import { useSearchParams } from '@/lib/react-router-adapters';
import { LoginForm } from '@/components/auth/LoginForm';
import { HalftoneVeil } from '@/components/auth/HalftoneVeil';

/**
 * Login shell per the Paper reference (SK_DB frame 27P-0): centered card on the
 * light canvas, a quiet absolute top bar (wordmark left, Help & Support right),
 * and a legal footnote under the card. The form self-handles all three auth
 * methods via the browser Supabase client + passkey API (sign-in → /tasks,
 * invite → /set-password), so the route needs no loader. The one server signal
 * it surfaces is `?error=` from a failed OAuth callback redirect
 * (api-server/routes/auth.ts sends `auth_callback_failed`).
 */

const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  auth_callback_failed: "Google sign-in didn't complete. Please try again.",
};

/** Progressive frost halo over the halftone veil, centered on the card:
 *  three stacked backdrop layers with tightening radial masks, each pairing
 *  blur with a canvas-colored tint — blur alone softens the dots but keeps
 *  their luminance, so the field still competed with the card; the tint is
 *  what actually clears it. Both fall off with distance, and the bloom's
 *  dense core at the bottom edge stays fully crisp. The tint color rides the
 *  `--halo` variable set on the route root (white in light, #171717 in dark)
 *  so the fog always reads as the page's own air, never a white wash. */
const BLUR_HALO = [
  { blur: 3, tint: 0.1, mask: 'radial-gradient(ellipse 50% 50% at center, black 30%, transparent 96%)' },
  { blur: 8, tint: 0.18, mask: 'radial-gradient(ellipse 50% 50% at center, black 25%, transparent 84%)' },
  { blur: 16, tint: 0.3, mask: 'radial-gradient(ellipse 50% 50% at center, black 20%, transparent 68%)' },
];

export function LoginRoute() {
  return <LoginRouteContent />;
}

export function LoginRouteContent() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get('error');
  const callbackError = errorCode ? CALLBACK_ERROR_MESSAGES[errorCode] ?? 'Sign-in failed. Please try again.' : null;

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
    <div className="overview-light relative flex h-dvh flex-col overflow-y-auto bg-white dark:bg-[#171717] px-4 antialiased pb-[env(safe-area-inset-bottom)] [scrollbar-gutter:stable_both-edges] [color-scheme:light] dark:[color-scheme:dark] [--halo:255,255,255] dark:[--halo:23,23,23]">
      {/* Fixed (not absolute) so the field holds the bottom edge of the
          viewport even when the expanded email view scrolls; fixed elements
          paint above static siblings, hence the z-[1] on main. */}
      <HalftoneVeil />

      {/* Frost halo between the veil and the content: sized (not just masked)
          so the backdrop-filter cost stays bounded to the card's neighborhood.
          Height capped at 60vh so the bottom edge (≤74vh down) clears the
          lowered dot field (top ≈76vh) — if the layers overlapped the canvas,
          every lens repaint would force three backdrop re-filters. */}
      <div
        aria-hidden
        className="pointer-events-none fixed left-1/2 top-[44%] h-[min(820px,60vh)] w-[min(1120px,96vw)] -translate-x-1/2 -translate-y-1/2 print:hidden contrast-more:hidden"
      >
        {BLUR_HALO.map(({ blur, tint, mask }) => (
          <div
            key={blur}
            className="absolute inset-0"
            style={{
              backgroundColor: `rgba(var(--halo),${tint})`,
              backdropFilter: `blur(${blur}px)`,
              WebkitBackdropFilter: `blur(${blur}px)`,
              maskImage: mask,
              WebkitMaskImage: mask,
            }}
          />
        ))}
      </div>

      {/* Top bar — reference geometry: 32px mark + 16px #686868 labels, 32/40 padding */}
      <header className="absolute inset-x-0 top-0 flex items-center justify-between px-6 py-6 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-10 sm:py-8">
        <div className="flex items-center gap-2.5">
          {/* Refined gray mark (#6E6E6E) exported from the Paper reference
              header (27P-0) — replaces the outdated heavy black PNG. 24px
              keeps it proportionate to the 16px label (glyph sits inside
              the box with padding, so 32px read oversized). Dark dims it to
              ≈#3f3f3f (brightness .57) to sit with the #3e3e3e labels. */}
          <img src="/seeko-mark.svg" alt="SEEKO" className="size-6 dark:brightness-[.57]" />
          {/* Dark header labels: Figma LOGIN/DARK pins these to #3e3e3e —
              deliberately recessive chrome; hover still brightens via tokens. */}
          <span className="text-base font-medium text-ink-muted-strong dark:text-[#3e3e3e]">Studio</span>
        </div>
        <a
          href="mailto:legal@seekostudios.com?subject=SEEKO%20Studio%20sign-in%20help"
          className="flex items-center gap-2 text-base text-ink-muted-strong dark:text-[#3e3e3e] transition-colors duration-150 hover:text-ink active:text-ink-title"
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
      <main className="relative z-[1] mx-auto my-auto flex w-full max-w-[420px] flex-col items-center py-[clamp(1.5rem,calc((100dvh-780px)/2),6rem)]">
        <LoginForm initialError={callbackError} />

        {/* Legal footnote — reference geometry (14px, max 300px, 32px below
            card) but lifted off the reference's #969696: 14px body text needs
            ≥4.5:1 on white, so the body sits at #767676 (4.5:1) and the
            document links a step darker. prefers-contrast pushes both further.
            No scrim behind it (user call): the text sits directly on the dot
            field — the dots here are mid-density pastels, not the dense core. */}
        <div className="relative mt-8">
          <p className="relative max-w-[300px] text-pretty text-center text-sm leading-snug text-[#767676] contrast-more:text-ink">
          By creating an account, you agree to our{' '}
          <Link to="/legal/terms" className="font-medium text-[#5c5c5c] transition-colors duration-150 hover:text-ink-title contrast-more:text-ink-title contrast-more:underline">
            Terms of Use
          </Link>
          ,{' '}
          <Link to="/legal/developer-terms" className="font-medium text-[#5c5c5c] transition-colors duration-150 hover:text-ink-title contrast-more:text-ink-title contrast-more:underline">
            Developer Portal Terms of Service
          </Link>{' '}
          and{' '}
          <Link to="/legal/privacy" className="font-medium text-[#5c5c5c] transition-colors duration-150 hover:text-ink-title contrast-more:text-ink-title contrast-more:underline">
            Privacy Policy
          </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
