import { CircleHelp } from 'lucide-react';
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
    <div className="overview-light relative flex min-h-dvh flex-col bg-white px-4 antialiased pb-[env(safe-area-inset-bottom)]">
      {/* Top bar — reference geometry: 32px mark + 16px #686868 labels, 32/40 padding */}
      <header className="absolute inset-x-0 top-0 flex items-center justify-between px-6 py-6 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-10 sm:py-8">
        <div className="flex items-center gap-2.5">
          {/* Refined gray mark (#6E6E6E) exported from the Paper reference
              header (27P-0) — replaces the outdated heavy black PNG. Tight
              24×24 viewBox, so it sits square at the reference's 32px. */}
          <img src="/seeko-mark.svg" alt="SEEKO" className="size-8" />
          <span className="text-base font-medium text-[#686868]">Studio</span>
        </div>
        <a
          href="mailto:ykartix@gmail.com?subject=SEEKO%20Studio%20sign-in%20help"
          className="flex items-center gap-2 text-base text-[#686868] transition-colors duration-150 hover:text-[#3a3a3a] active:text-[#111]"
        >
          <CircleHelp className="size-[18px]" strokeWidth={1.75} />
          Help &amp; Support
        </a>
      </header>

      {/* Vertically centered. Safe now that the card's height change is a
          real animation (LoginForm pins + WAAPI-glides the container): the
          my-auto recentring rides that same curve instead of snapping. */}
      <main className="mx-auto my-auto flex w-full max-w-[420px] flex-col items-center py-24">
        <LoginForm initialError={callbackError} />

        {/* Legal footnote — reference: 14px #969696, max 300px, 32px below card.
            Document names sit a step darker, link-style; wire real hrefs when
            the terms/privacy pages exist. */}
        <p className="mt-8 max-w-[300px] text-pretty text-center text-sm leading-snug text-[#969696]">
          By creating an account, you agree to our{' '}
          <span className="font-medium text-[#6e6e6e]">Terms of Use</span>,{' '}
          <span className="font-medium text-[#6e6e6e]">Developer Portal Terms of Service</span> and{' '}
          <span className="font-medium text-[#6e6e6e]">Privacy Policy</span>
        </p>
      </main>
    </div>
  );
}
