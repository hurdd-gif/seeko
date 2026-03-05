'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function InviteCodeForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });

    if (otpError) {
      setError('Invalid or expired invite code. Please check your email and try again.');
      setLoading(false);
      return;
    }

    // Initialise profile with pending invite metadata
    await fetch('/api/profile/init', { method: 'POST' });

    router.push('/set-password');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="invite-email" className="block text-xs font-medium text-muted-foreground mb-1.5">
          Email
        </label>
        <input
          id="invite-email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          placeholder="you@seeko.studio"
          className="w-full px-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-seeko-accent transition-colors"
        />
      </div>

      <div>
        <label htmlFor="invite-token" className="block text-xs font-medium text-muted-foreground mb-1.5">
          Invite code
        </label>
        <input
          id="invite-token"
          type="text"
          value={token}
          onChange={e => setToken(e.target.value.replace(/\D/g, '').slice(0, 8))}
          required
          placeholder="8-digit code from your email"
          inputMode="numeric"
          maxLength={8}
          className="w-full px-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-seeko-accent transition-colors font-mono tracking-widest"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || token.length < 8}
        className="w-full py-2 px-4 rounded-lg bg-seeko-accent text-primary-foreground font-semibold text-sm hover:bg-seeko-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Verifying…' : 'Continue'}
      </button>
    </form>
  );
}
