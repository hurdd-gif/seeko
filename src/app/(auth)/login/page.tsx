'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { useHaptics } from '@/components/HapticsProvider';
import { Button, Input, Tabs } from '@/components/seeko-ui';
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
          className="block font-sans text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-ink/55"
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
        <label
          htmlFor="password"
          className="block font-sans text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-ink/55"
        >
          Password
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
          className="font-sans text-[0.875rem] text-ink"
        >
          {error}
        </p>
      )}

      <div className="pt-2 flex justify-center">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={loading}
          className="min-w-[12rem]"
        >
          {loading ? 'Signing in…' : 'Continue'}
        </Button>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="bg-paper min-h-dvh flex flex-col">
      {/* Wordmark — top center, anchored */}
      <header className="pt-16 sm:pt-20 flex justify-center">
        <Image
          src="/branding/wordmark-light.png"
          alt="SEEKO"
          width={280}
          height={84}
          priority
          className="h-14 sm:h-16 w-auto object-contain dark:hidden"
        />
        <Image
          src="/branding/wordmark-dark.png"
          alt="SEEKO"
          width={280}
          height={84}
          priority
          className="h-14 sm:h-16 w-auto object-contain hidden dark:block"
        />
      </header>

      {/* Editorial center column */}
      <div className="flex-1 flex flex-col items-center justify-start px-6 pt-20 sm:pt-24 pb-16">
        <div className="w-full max-w-[26rem]">
          <h1
            className="text-[clamp(2.5rem,6vw,4rem)] leading-[1.05] tracking-[-0.02em] font-medium text-ink text-balance text-center mb-12"
          >
            Welcome back.
          </h1>

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

    </main>
  );
}
