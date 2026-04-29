'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { useHaptics } from '@/components/HapticsProvider';
import { Button, Input, Tabs } from '@/components/seeko-ui';
import { InviteCodeForm } from '@/components/auth/InviteCodeForm';

/**
 * SEEKO sign-in — editorial masthead.
 *
 * Composition (1440 baseline):
 *   ┌───────────────────────────────────────────────────────────────┐
 *   │  [SEEKO]   N° 01 · TEAM SIGN-IN              APR 28 · 2026    │  masthead
 *   │ ─────────────────────────────────────────────────────────────  │  hairline
 *   │                                                                │
 *   │  A creative game           ┌──────────────────┐                │
 *   │  studio.                   │ Sign in · Invite │  <- tabs       │
 *   │                            ├──────────────────┤                │
 *   │  Tools, briefs, and        │ EMAIL            │                │
 *   │  builds for the SEEKO      │ [____________]   │                │
 *   │  team — keep going.        │ PASSWORD         │                │
 *   │                            │ [____________]   │                │
 *   │  · Internal · Invite-only  │ ⟶ Continue       │                │
 *   │                            │ Forgot password? │                │
 *   │                                                                │
 *   │ ─────────────────────────────────────────────────────────────  │  hairline
 *   │  © 2026 SEEKO STUDIO        BUILD 0.1.0       PHILADELPHIA, PA │  colophon
 *   └───────────────────────────────────────────────────────────────┘
 *
 * Wordmark lives in the masthead chrome (where mastheads carry the brand) so
 * the editorial headline can do its job. Left column carries the page weight:
 * display-scale headline, a single supporting line, and a quiet provenance
 * tag at the column's bottom edge. Right column is a tight, single-purpose
 * form column with no redundant section labels.
 *
 * Motion: top rule sweeps in, masthead chrome and title block fade-up with a
 * 60ms stagger. No motion on form chrome (high-cognitive-load region).
 * Guarded by prefers-reduced-motion.
 */

function SignInForm() {
  const router = useRouter();
  const { trigger } = useHaptics();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      trigger('error');
      return;
    }

    trigger('success');
    router.push('/');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <label
          htmlFor="email"
          className="block font-sans text-[0.6875rem] font-medium uppercase tracking-[0.16em] text-ink/55"
        >
          Email
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@seeko.studio"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <label
            htmlFor="password"
            className="font-sans text-[0.6875rem] font-medium uppercase tracking-[0.16em] text-ink/55"
          >
            Password
          </label>
          <a
            href="/forgot-password"
            className="font-sans text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-ink/45 hover:text-ink transition-[color] duration-150 ease-out"
          >
            Forgot?
          </a>
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="font-sans text-[0.875rem] leading-relaxed text-ink"
        >
          {error}
        </p>
      )}

      <div className="pt-2">
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={loading}
          className="w-full"
        >
          {loading ? 'Signing in…' : 'Continue'}
        </Button>
      </div>
    </form>
  );
}

export default function LoginPage() {
  const titleRef = useRef<HTMLDivElement>(null);
  const ruleTopRef = useRef<HTMLDivElement>(null);
  const mastheadRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let cancelled = false;
    let ctx: { revert: () => void } | null = null;

    (async () => {
      const { gsap } = await import('@/lib/gsap');
      if (cancelled) return;

      ctx = gsap.context(() => {
        // Top hairline sweeps in from left — masthead reveal.
        gsap.from(ruleTopRef.current, {
          scaleX: 0,
          transformOrigin: 'left center',
          duration: 0.9,
          ease: 'power3.out',
        });

        // Masthead metadata fades up beneath the rule.
        gsap.from(mastheadRef.current?.children ?? [], {
          opacity: 0,
          y: 6,
          duration: 0.5,
          ease: 'power2.out',
          stagger: 0.06,
          delay: 0.2,
        });

        // Title block — display headline + supporting copy + tag.
        gsap.from(titleRef.current?.children ?? [], {
          opacity: 0,
          y: 16,
          duration: 0.7,
          ease: 'power2.out',
          stagger: 0.08,
          delay: 0.35,
        });

        // Form column eases in as a unit. Form FIELDS themselves are NOT
        // animated — entrance motion on inputs distracts during the
        // high-cognitive-load act of typing credentials.
        gsap.from(formRef.current, {
          opacity: 0,
          y: 12,
          duration: 0.6,
          ease: 'power2.out',
          delay: 0.5,
        });
      });
    })();

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);

  // Editorial date in masthead — month + year, tabular.
  const editionDate = new Date()
    .toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    })
    .toUpperCase();

  return (
    <main className="bg-paper text-ink min-h-dvh flex flex-col">
      {/* Masthead — wordmark + edition metadata above a hairline */}
      <header className="px-8 sm:px-12 lg:px-16 pt-6 sm:pt-8">
        <div
          ref={mastheadRef}
          className="flex items-center justify-between gap-6 pb-4"
        >
          <div className="flex items-center">
            {/* Wordmark sits in the masthead at brand-mark size. The hand-
                lettered mark gets to be itself — no outline, no apology. */}
            <Image
              src="/branding/wordmark-light.png"
              alt="SEEKO"
              width={280}
              height={84}
              priority
              className="h-7 sm:h-8 w-auto object-contain object-left dark:hidden select-none"
              draggable={false}
            />
            <Image
              src="/branding/wordmark-dark.png"
              alt="SEEKO"
              width={280}
              height={84}
              priority
              className="h-7 sm:h-8 w-auto object-contain object-left hidden dark:block select-none"
              draggable={false}
            />
          </div>
          <span className="font-sans text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-ink/45 tabular-nums">
            {editionDate}
          </span>
        </div>
        <div
          ref={ruleTopRef}
          aria-hidden
          className="h-px w-full bg-border"
        />
      </header>

      {/* Body — asymmetric two-column composition */}
      <div className="flex-1 px-8 sm:px-12 lg:px-16 pt-16 sm:pt-20 lg:pt-24 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-y-14 lg:gap-x-12">
          {/* Left column — editorial title block */}
          <div
            ref={titleRef}
            className="lg:col-span-7 xl:col-span-7 flex flex-col"
          >
            {/* Section eyebrow — small enough to read as ledger, not headline */}
            <span className="font-sans text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-ink/45">
              The studio
            </span>

            {/* Display-scale headline — this is what carries the page weight */}
            <h1 className="mt-5 font-sans font-medium text-ink text-[clamp(2.5rem,5.4vw,4rem)] leading-[1.02] tracking-[-0.02em] max-w-[14ch] text-balance">
              A creative game
              <br className="hidden sm:block" />
              <span className="text-ink/55"> studio.</span>
            </h1>

            {/* Supporting line — earns the column's vertical space */}
            <p className="mt-7 font-sans text-[1.0625rem] leading-[1.55] text-ink/70 max-w-[36ch] text-pretty">
              Tools, briefs, and builds for the SEEKO team. Sign in to pick
              up where you left off.
            </p>

            {/* Provenance tag — pinned to the bottom of the left column to
                anchor the composition against the form's vertical mass */}
            <div className="mt-12 lg:mt-auto lg:pt-16 flex items-center gap-2.5">
              <span
                className="h-1 w-1 rounded-full bg-ink/40"
                aria-hidden
              />
              <span className="font-sans text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-ink/45">
                Internal &middot; Invite-only
              </span>
            </div>
          </div>

          {/* Right column — form */}
          <div
            ref={formRef}
            className="lg:col-span-5 lg:col-start-8 xl:col-span-4 xl:col-start-9"
          >
            <div className="max-w-[24rem] lg:ml-auto">
              <Tabs
                items={[
                  { key: 'signin', label: 'Sign in', content: <SignInForm /> },
                  {
                    key: 'invite',
                    label: 'Invite code',
                    content: <InviteCodeForm />,
                  },
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Footer hairline — colophon */}
      <footer className="px-8 sm:px-12 lg:px-16 pb-8">
        <div className="h-px w-full bg-border mb-3" aria-hidden />
        <div className="flex items-baseline justify-between gap-6">
          <span className="font-sans text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-ink/45 tabular-nums">
            &copy; 2026 Seeko Studio
          </span>
          <span className="hidden sm:inline font-sans text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-ink/45 tabular-nums">
            Build 0.1.0
          </span>
          <span className="font-sans text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-ink/45">
            Philadelphia, PA
          </span>
        </div>
      </footer>
    </main>
  );
}
