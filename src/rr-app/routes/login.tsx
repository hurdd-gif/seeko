import { CircleHelp } from 'lucide-react';
import { Link } from 'react-router';
import { useSearchParams } from '@/lib/react-router-adapters';
import { LoginForm } from '@/components/auth/LoginForm';

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
    <div className="overview-light relative flex h-dvh flex-col overflow-y-auto bg-white px-4 antialiased pb-[env(safe-area-inset-bottom)] [scrollbar-gutter:stable_both-edges]">
      {/* Top bar — reference geometry: 32px mark + 16px #686868 labels, 32/40 padding */}
      <header className="absolute inset-x-0 top-0 flex items-center justify-between px-6 py-6 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-10 sm:py-8">
        <div className="flex items-center gap-2.5">
          {/* Refined gray mark (#6E6E6E) exported from the Paper reference
              header (27P-0) — replaces the outdated heavy black PNG. 24px
              keeps it proportionate to the 16px label (glyph sits inside
              the box with padding, so 32px read oversized). */}
          <img src="/seeko-mark.svg" alt="SEEKO" className="size-6" />
          <span className="text-base font-medium text-[#686868]">Studio</span>
        </div>
        <a
          href="mailto:legal@seekostudios.com?subject=SEEKO%20Studio%20sign-in%20help"
          className="flex items-center gap-2 text-base text-[#686868] transition-colors duration-150 hover:text-[#3a3a3a] active:text-[#111]"
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
      <main className="mx-auto my-auto flex w-full max-w-[420px] flex-col items-center py-[clamp(1.5rem,calc((100dvh-780px)/2),6rem)]">
        <LoginForm initialError={callbackError} />

        {/* Legal footnote — reference: 14px #969696, max 300px, 32px below card.
            Document names sit a step darker and link to /legal/:slug. */}
        <p className="mt-8 max-w-[300px] text-pretty text-center text-sm leading-snug text-[#969696]">
          By creating an account, you agree to our{' '}
          <Link to="/legal/terms" className="font-medium text-[#6e6e6e] transition-colors duration-150 hover:text-[#111]">
            Terms of Use
          </Link>
          ,{' '}
          <Link to="/legal/developer-terms" className="font-medium text-[#6e6e6e] transition-colors duration-150 hover:text-[#111]">
            Developer Portal Terms of Service
          </Link>{' '}
          and{' '}
          <Link to="/legal/privacy" className="font-medium text-[#6e6e6e] transition-colors duration-150 hover:text-[#111]">
            Privacy Policy
          </Link>
        </p>
      </main>
    </div>
  );
}
