'use client';

/* ──────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Login page entrance
 *
 * Read top-to-bottom. Each value is ms after page mount.
 *
 *    0ms   page mounts — card hidden (opacity 0, y +20)
 *  150ms   card fades in, slides up to rest
 *  300ms   logo mark + wordmark fade in from y +8
 *  420ms   subtitle fades in
 *  540ms   tab bar fades in
 *  660ms   first form field slides in
 *  760ms   second form field slides in (staggered 100ms)
 *  880ms   submit button fades in
 * ────────────────────────────────────────────────────────── */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';
import { createClient } from '@/lib/supabase/client';
import { InviteCodeForm } from '@/components/auth/InviteCodeForm';
import { useHaptics } from '@/components/HapticsProvider';

/* ─── Timing (ms after mount) ───────────────────────────── */
const TIMING = {
  card:     150,   // outer card slides up
  logo:     300,   // wordmark + mark fade in
  subtitle: 420,   // tagline fades in
  tabs:     540,   // tab switcher fades in
  field1:   660,   // first form field
  field2:   760,   // second form field (staggered)
  button:   880,   // submit button
};

/* ─── Element configs ────────────────────────────────────── */
const CARD = {
  offsetY:  20,    // px card starts below resting position
  spring:   { type: 'spring' as const, stiffness: 320, damping: 28 },
};

const LOGO = {
  offsetY:  8,     // px logo starts below resting position
  spring:   { type: 'spring' as const, stiffness: 400, damping: 30 },
};

const FIELD = {
  offsetY:  10,    // px each field slides up from
  spring:   { type: 'spring' as const, stiffness: 350, damping: 28 },
};

const FADE = {
  spring: { type: 'spring' as const, stiffness: 300, damping: 30 },
};

export default function LoginPage() {
  const router = useRouter();
  const { trigger } = useHaptics();
  const [tab, setTab] = useState<'signin' | 'invite'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setStage(1), TIMING.card));
    timers.push(setTimeout(() => setStage(2), TIMING.logo));
    timers.push(setTimeout(() => setStage(3), TIMING.subtitle));
    timers.push(setTimeout(() => setStage(4), TIMING.tabs));
    timers.push(setTimeout(() => setStage(5), TIMING.field1));
    timers.push(setTimeout(() => setStage(6), TIMING.field2));
    timers.push(setTimeout(() => setStage(7), TIMING.button));
    return () => timers.forEach(clearTimeout);
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      trigger('error');
      return;
    }

    trigger('success');
    router.push('/');
    router.refresh();
  }

  return (
    <div className="relative w-full max-w-sm">

      {/* Card */}
      <motion.div
        className="relative rounded-2xl border border-transparent bg-transparent p-8"
        initial={{ opacity: 0, y: CARD.offsetY }}
        animate={{ opacity: stage >= 1 ? 1 : 0, y: stage >= 1 ? 0 : CARD.offsetY }}
        transition={CARD.spring}
      >
        {/* Logo */}
        <motion.div
          className="mb-8 flex flex-col items-center gap-2"
          initial={{ opacity: 0, y: LOGO.offsetY }}
          animate={{ opacity: stage >= 2 ? 1 : 0, y: stage >= 2 ? 0 : LOGO.offsetY }}
          transition={LOGO.spring}
        >
          {/* Logo mark */}
          <Image
            src="/seeko-s.png"
            alt="SEEKO"
            width={40}
            height={40}
            className="size-10 object-contain"
          />
          <h1 className="text-xl font-bold tracking-tight text-foreground">SEEKO Studio</h1>
        </motion.div>

        {/* Subtitle — crossfade between tab labels */}
        <motion.div
          className="mb-6 text-center text-sm text-muted-foreground relative h-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: stage >= 3 ? 1 : 0 }}
          transition={FADE.spring}
        >
          <AnimatePresence mode="wait">
            <motion.p
              key={tab}
              className="absolute inset-0"
              initial={{ opacity: 0, filter: 'blur(4px)', y: 2 }}
              animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
              exit={{ opacity: 0, filter: 'blur(4px)', y: -2 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {tab === 'signin' ? 'Sign in to your workspace' : 'Join the team!'}
            </motion.p>
          </AnimatePresence>
        </motion.div>

        {/* Tabs */}
        <motion.div
          className="relative mb-6 flex rounded-lg border border-border bg-background p-1 gap-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: stage >= 4 ? 1 : 0 }}
          transition={FADE.spring}
        >
          {(['signin', 'invite'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setError(null); }}
              className="relative flex-1 py-1.5 text-sm font-medium rounded-md z-10 transition-colors"
              style={{ color: tab === t ? '#1a1a1a' : undefined }}
            >
              {tab === t && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-0 rounded-md bg-seeko-accent"
                  style={{ zIndex: -1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className={tab === t ? 'text-[#1a1a1a] font-semibold' : 'text-muted-foreground'}>
                {t === 'signin' ? 'Sign in' : 'Invite code'}
              </span>
            </button>
          ))}
        </motion.div>

        {/* Forms */}
        <AnimatePresence mode="wait">
          {tab === 'signin' ? (
            <motion.form
              key="signin"
              onSubmit={handleLogin}
              className="space-y-4"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            >
              {/* Email field */}
              <motion.div
                initial={{ opacity: 0, y: FIELD.offsetY }}
                animate={{ opacity: stage >= 5 ? 1 : 0, y: stage >= 5 ? 0 : FIELD.offsetY }}
                transition={FIELD.spring}
              >
                <label htmlFor="email" className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-seeko-accent transition-colors"
                  placeholder="you@seeko.studio"
                />
              </motion.div>

              {/* Password field */}
              <motion.div
                initial={{ opacity: 0, y: FIELD.offsetY }}
                animate={{ opacity: stage >= 6 ? 1 : 0, y: stage >= 6 ? 0 : FIELD.offsetY }}
                transition={FIELD.spring}
              >
                <label htmlFor="password" className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:border-seeko-accent transition-colors"
                />
              </motion.div>

              {error && (
                <motion.p
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg"
                >
                  {error}
                </motion.p>
              )}

              {/* Submit button */}
              <motion.button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 rounded-lg bg-seeko-accent text-[#1a1a1a] font-semibold text-sm hover:bg-seeko-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                initial={{ opacity: 0, y: FIELD.offsetY }}
                animate={{ opacity: stage >= 7 ? 1 : 0, y: stage >= 7 ? 0 : FIELD.offsetY }}
                transition={FIELD.spring}
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </motion.button>
            </motion.form>
          ) : (
            <motion.div
              key="invite"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            >
              <InviteCodeForm />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
