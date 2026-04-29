'use client';

/**
 * SEEKO sign-in — Joby register, minimal.
 *
 * Wordmark top-left at brand-mark size. Form sits in a constrained
 * single column. Lowercase headline. Text CTA (no fill). Switch between
 * sign-in and invite via a quiet text link, not chromed tabs.
 *
 * Less is more. No masthead. No edition. No supporting copy. No motion.
 *
 * Reference: docs/visual-overhaul/joby-reference.md
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { useHaptics } from '@/components/HapticsProvider';
import { Button, Input } from '@/components/seeko-ui';
import { InviteCodeForm } from '@/components/auth/InviteCodeForm';

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
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <label
          htmlFor="email"
          className="block font-sans text-[0.875rem] font-medium text-ink/65"
        >
          email
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
        <label
          htmlFor="password"
          className="block font-sans text-[0.875rem] font-medium text-ink/65"
        >
          password
        </label>
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
        <Button type="submit" variant="link" size="lg" disabled={loading}>
          {loading ? 'signing in…' : 'continue'}
        </Button>
      </div>
    </form>
  );
}

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'invite'>('signin');

  return (
    <main className="bg-paper text-ink min-h-dvh flex flex-col">
      {/* Wordmark — top-left, sized to anchor the page without shouting */}
      <header className="px-8 sm:px-12 lg:px-16 pt-8 sm:pt-10">
        <Image
          src="/branding/wordmark-light.png"
          alt="SEEKO"
          width={384}
          height={239}
          priority
          className="h-16 sm:h-20 w-auto object-contain object-left dark:hidden select-none"
          draggable={false}
        />
        <Image
          src="/branding/wordmark-dark.png"
          alt="SEEKO"
          width={384}
          height={239}
          priority
          className="h-16 sm:h-20 w-auto object-contain object-left hidden dark:block select-none"
          draggable={false}
        />
      </header>

      {/* Form column — flush-left to share the wordmark's axis; the spine of the page */}
      <div className="flex-1 px-8 sm:px-12 lg:px-16 pt-20 sm:pt-24">
        <div className="w-full max-w-[26rem]">
          <h1
            className="font-sans font-medium text-ink text-[clamp(2.25rem,4.5vw,3rem)] leading-[1.05] tracking-[-0.02em] mb-10"
            style={{ textIndent: '-0.02em' }}
          >
            {mode === 'signin' ? 'welcome back.' : 'join the team.'}
          </h1>

          {mode === 'signin' ? <SignInForm /> : <InviteCodeForm />}

          <p className="mt-10 font-sans text-[0.875rem] text-ink/50">
            {mode === 'signin' ? 'new here? ' : 'returning? '}
            <button
              type="button"
              onClick={() => setMode(mode === 'signin' ? 'invite' : 'signin')}
              className="font-sans text-ink underline underline-offset-[5px] decoration-ink/30 hover:decoration-ink decoration-[1px] transition-[text-decoration-color] duration-150 ease-out"
            >
              {mode === 'signin'
                ? 'enter an invite code'
                : 'sign in instead'}
            </button>
          </p>
        </div>
      </div>

    </main>
  );
}
