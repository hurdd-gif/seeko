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
    <div className="overview-light relative flex min-h-dvh flex-col bg-[var(--ov-bg)] px-4 antialiased pb-[env(safe-area-inset-bottom)]">
      {/* Top bar — wordmark left, help right */}
      <header className="absolute inset-x-0 top-0 flex items-center justify-between px-5 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8 sm:py-7">
        <div className="flex items-center gap-2.5">
          <img src="/seeko-logo.png" alt="SEEKO" className="size-7 rounded-md" />
          <span className="text-[15px] font-medium text-[#686868]">Studio</span>
        </div>
        <a
          href="mailto:ykartix@gmail.com?subject=SEEKO%20Studio%20sign-in%20help"
          className="flex items-center gap-1.5 text-[14px] text-[#808080] transition-colors hover:text-[#3a3a3a]"
        >
          <CircleHelp className="size-4" strokeWidth={1.75} />
          Help &amp; Support
        </a>
      </header>

      {/* my-auto (not justify-center) so a viewport shorter than the card
          scrolls from the top instead of hiding content under the header;
          py-24 keeps the card clear of the absolute top bar. */}
      <main className="mx-auto my-auto flex w-full max-w-[420px] flex-col items-center py-24">
        <LoginForm initialError={callbackError} />

        {/* Legal footnote */}
        <p className="mt-8 max-w-[300px] text-center text-[13px] leading-relaxed text-[#969696]">
          Access is invite-only. By signing in you agree to the SEEKO Studio NDA.
        </p>
      </main>
    </div>
  );
}
