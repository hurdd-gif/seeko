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
    <form onSubmit={handleSubmit} className="space-y-5">
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
      {/* Wordmark — top-left, small, deliberate */}
      <header className="px-8 sm:px-12 lg:px-16 pt-8 sm:pt-10">
        <Image
          src="/branding/wordmark-light.png"
          alt="SEEKO"
          width={280}
          height={84}
          priority
          className="h-9 sm:h-10 w-auto object-contain object-left dark:hidden select-none"
          draggable={false}
        />
        <Image
          src="/branding/wordmark-dark.png"
          alt="SEEKO"
          width={280}
          height={84}
          priority
          className="h-9 sm:h-10 w-auto object-contain object-left hidden dark:block select-none"
          draggable={false}
        />
      </header>

      {/* Form column — constrained, sat in upper third */}
      <div className="flex-1 px-8 sm:px-12 lg:px-16 pt-24 sm:pt-32">
        <div className="max-w-[22rem]">
          <h1 className="font-sans font-medium text-ink text-[clamp(2.5rem,5.5vw,4rem)] leading-[1.05] tracking-[-0.02em] mb-12">
            {mode === 'signin' ? 'welcome back.' : 'join the team.'}
          </h1>

          {mode === 'signin' ? <SignInForm /> : <InviteCodeForm />}

          <div className="mt-8">
            <button
              type="button"
              onClick={() => setMode(mode === 'signin' ? 'invite' : 'signin')}
              className="font-sans text-[0.875rem] text-ink/55 hover:text-ink transition-[color] duration-150 ease-out"
            >
              {mode === 'signin'
                ? 'have an invite code?'
                : 'already a member?'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
