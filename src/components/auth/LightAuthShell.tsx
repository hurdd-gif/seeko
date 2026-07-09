'use client';

import type { ReactNode } from 'react';
import { FadeScale, FadeRise } from '@/components/motion';
import { cn } from '@/lib/utils';

/**
 * Shared light "Paper" shell for the standalone auth flow (set-password,
 * onboarding, agreement). Mirrors the legacy centered auth layout — logo →
 * heading → subtitle → content — re-skinned from the dark `bg-background`
 * surface to the light `--ov-bg` canvas with the #111 / #808080 text ladder,
 * so the auth pages read as the SAME material as the rest of the light app
 * (and the already-light signer ceremony). The entrance choreography is
 * preserved verbatim: FadeScale on the mark, staggered FadeRise on the copy
 * (0.15s / 0.25s) and the content (0.4s, larger rise).
 */
export function LightAuthShell({
  title,
  subtitle,
  maxWidth = 'max-w-sm',
  children,
}: {
  title: string;
  subtitle: string;
  /** Tailwind max-width utility for the column (forms vs. wider agreements). */
  maxWidth?: string;
  /** Optional content below the copy. Omitted for bare title/subtitle states. */
  children?: ReactNode;
}) {
  return (
    <div className="overview-light flex min-h-dvh items-center justify-center bg-[var(--ov-bg)] px-4 antialiased pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className={cn('w-full space-y-8', maxWidth)}>
        <div className="text-center">
          <FadeScale className="mx-auto flex size-16 items-center justify-center">
            {/* Dark S-mark (seeko-logo.png) — the white seeko-s.png used on the
                legacy dark auth canvas is invisible on the light --ov-bg. */}
            <img src="/seeko-logo.png" alt="SEEKO" className="size-14" />
          </FadeScale>
          <FadeRise delay={0.15}>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[#111] text-balance">
              {title}
            </h1>
          </FadeRise>
          <FadeRise delay={0.25}>
            <p className="mt-2 text-sm text-[#808080] text-pretty">{subtitle}</p>
          </FadeRise>
        </div>
        {children ? (
          <FadeRise delay={0.4} y={24}>
            {children}
          </FadeRise>
        ) : null}
      </div>
    </div>
  );
}
