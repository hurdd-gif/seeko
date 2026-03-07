'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, LayoutGroup, AnimatePresence } from 'motion/react';
import { LogOut, LayoutDashboard, FileDown, Settings, Home } from 'lucide-react';
import { toast } from 'sonner';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useHaptics } from '@/components/HapticsProvider';

const NAV_HIGHLIGHT = {
  spring: { type: 'spring' as const, stiffness: 380, damping: 30 },
};

/* ─────────────────────────────────────────────────────────
 * MOBILE PILL NAV STORYBOARD (matches main dashboard pill)
 *
 *   tap    tab scale 1 → 0.94 (spring), release → 1
 *   switch active pill background slides to new tab (layoutId spring)
 *   spacing from MOBILE_PILL for consistency with main nav
 * ───────────────────────────────────────────────────────── */

const MOBILE_PILL = {
  pillPaddingX: 4,
  pillPaddingY: 5,
  itemGap: 4,
  itemPaddingX: 8,
  itemPaddingY: 8,
  itemMinWidth: 44,
  iconLabelGap: 2,
  tapScale: 0.94,
  tapSpring: { type: 'spring' as const, stiffness: 450, damping: 28 },
  activeSlideSpring: { type: 'spring' as const, stiffness: 380, damping: 30 },
};

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

interface InvestorSidebarProps {
  email: string;
  displayName?: string;
  avatarUrl?: string;
  isAdmin?: boolean;
}

export function InvestorSidebar({ email, displayName, avatarUrl, isAdmin = false }: InvestorSidebarProps) {
  const pathname = usePathname();
  const { trigger } = useHaptics();
  const label = displayName || email;
  const [pdfLoading, setPdfLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  async function handleDownloadPdf(e: React.MouseEvent) {
    e.preventDefault();
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const res = await fetch('/api/investor/export-summary', { credentials: 'same-origin' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error ?? 'Failed to generate PDF');
        trigger('error');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `seeko-investor-summary-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
      trigger('success');
    } catch {
      toast.error('Download failed. Try again.');
      trigger('error');
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────── */}
      <aside className="relative hidden md:flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar h-screen sticky top-0 w-[220px]">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-5">
          <div className="flex h-8 w-8 items-center justify-center shrink-0">
            <Image src="/seeko-s.png" alt="SEEKO" width={24} height={24} unoptimized />
          </div>
          <span className="font-semibold text-base tracking-tight text-sidebar-foreground whitespace-nowrap">
            SEEKO
          </span>
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Label */}
        <div className="px-4 pt-5 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Investor Panel
          </p>
        </div>

        <nav className="flex flex-col gap-0.5 p-2 flex-1 mt-1">
          <LayoutGroup id="investor-sidebar-nav">
            {/* Dashboard (back to investor home) */}
            <Link
              href="/investor"
              className={[
                'relative flex items-center rounded-md py-2.5 text-sm gap-3 px-3',
                pathname === '/investor'
                  ? 'text-seeko-accent font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors',
              ].join(' ')}
            >
              {pathname === '/investor' && (
                <motion.div
                  layoutId="investor-nav-highlight"
                  className="absolute inset-0 rounded-md bg-white/5"
                  transition={NAV_HIGHLIGHT.spring}
                />
              )}
              <LayoutDashboard className={`relative h-4 w-4 shrink-0 ${pathname === '/investor' ? 'text-seeko-accent' : ''}`} />
              <span className="whitespace-nowrap">Dashboard</span>
            </Link>

            {/* Back to main dashboard (admins only) */}
            {isAdmin && (
              <Link
                href="/"
                className={[
                  'relative flex items-center rounded-md py-2.5 text-sm gap-3 px-3',
                  'text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors',
                ].join(' ')}
              >
                <Home className="relative h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">Back to dashboard</span>
              </Link>
            )}
          </LayoutGroup>
        </nav>

        <div className="flex-1" />

        {/* Download summary PDF */}
        <div className="px-4 pb-2">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
            className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50 w-full text-left"
          >
            <FileDown className="h-4 w-4 shrink-0" />
            {pdfLoading ? 'Generating…' : 'Download summary (PDF)'}
          </button>
        </div>

        <div className="p-4 border-t border-sidebar-border space-y-3">
          <div className="flex items-center gap-2.5">
            <Avatar className="size-8 shrink-0">
              <AvatarImage src={avatarUrl} alt={label} />
              <AvatarFallback className="bg-secondary text-foreground text-[10px]">
                {getInitials(label)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              {displayName && (
                <p className="text-sm font-medium text-sidebar-foreground truncate">{displayName}</p>
              )}
              <p className="text-xs text-muted-foreground truncate">{email}</p>
            </div>
          </div>

          <Link
            href="/investor/settings"
            className={[
              'flex items-center gap-2 rounded-md px-0 py-1.5 text-xs transition-colors mb-1',
              pathname.startsWith('/investor/settings')
                ? 'text-seeko-accent font-medium'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            <Settings className="h-3.5 w-3.5 shrink-0" />
            Settings
          </Link>

          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex items-center gap-2 rounded-md px-0 py-1.5 text-xs text-muted-foreground hover:text-[#f87171] transition-colors w-full"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* ── Mobile: header in-flow (first thing you see, scrolls away); nav fixed at bottom ── */}
      {mounted && (() => {
        const headerSlot = typeof document !== 'undefined' ? document.getElementById('investor-mobile-header-slot') : null;
        const headerEl = headerSlot ?? document.body;
        const useHeaderSlot = Boolean(headerSlot);
        return (
          <>
            {createPortal(
              <header
                className={`md:hidden flex items-center justify-between px-4 h-14 w-full shrink-0 border-b border-border/30 ${!useHeaderSlot ? 'fixed top-0 left-0 right-0 z-40 mobile-fixed-layer' : ''}`}
                style={{
                  background: 'rgba(21, 21, 21, 0.85)',
                  ...(useHeaderSlot ? {} : {
                    backdropFilter: 'saturate(180%) blur(12px)',
                    WebkitBackdropFilter: 'saturate(180%) blur(12px)',
                  }),
                }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Image src="/seeko-s.png" alt="SEEKO" width={20} height={20} unoptimized />
                  <span className="font-semibold text-sm tracking-tight text-sidebar-foreground truncate">SEEKO</span>
                </div>
                <Link href="/investor/settings" className="shrink-0" onClick={() => trigger('selection')}>
                  <Avatar className="size-10">
                    <AvatarImage src={avatarUrl} alt={label} />
                    <AvatarFallback className="bg-secondary text-foreground text-[10px]">
                      {getInitials(label)}
                    </AvatarFallback>
                  </Avatar>
                </Link>
              </header>,
              headerEl
            )}
            {createPortal(
              <nav
                className="mobile-fixed-layer md:hidden fixed bottom-0 left-0 right-0 z-50 mx-auto w-max max-w-[calc(100vw-24px)] flex justify-center items-center"
                style={{ marginBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
              >
                <div
                  className="w-max flex items-center justify-center rounded-full border border-border/50 shadow-lg"
                  style={{
                    background: 'rgba(26, 26, 26, 0.94)',
                    backdropFilter: 'saturate(180%) blur(12px)',
                    WebkitBackdropFilter: 'saturate(180%) blur(12px)',
                    paddingLeft: MOBILE_PILL.pillPaddingX,
                    paddingRight: MOBILE_PILL.pillPaddingX,
                    paddingTop: MOBILE_PILL.pillPaddingY,
                    paddingBottom: MOBILE_PILL.pillPaddingY,
                    gap: MOBILE_PILL.itemGap,
                  }}
                >
                  <LayoutGroup id="investor-pill-nav">
                  <Link
                    href="/investor"
                    onClick={() => trigger('selection')}
                    className={[
                      'relative flex flex-col items-center justify-center rounded-full text-[11px] font-medium transition-colors',
                      pathname === '/investor' ? 'text-seeko-accent' : 'text-muted-foreground',
                    ].join(' ')}
                    style={{
                      paddingLeft: MOBILE_PILL.itemPaddingX,
                      paddingRight: MOBILE_PILL.itemPaddingX,
                      paddingTop: MOBILE_PILL.itemPaddingY,
                      paddingBottom: MOBILE_PILL.itemPaddingY,
                      minWidth: MOBILE_PILL.itemMinWidth,
                    }}
                  >
                    {pathname === '/investor' && (
                      <motion.div
                        layoutId="investor-pill-active"
                        className="absolute inset-0 rounded-full bg-white/8"
                        transition={MOBILE_PILL.activeSlideSpring}
                      />
                    )}
                    <motion.span
                      className="relative z-10 flex flex-col items-center justify-center"
                      style={{ gap: MOBILE_PILL.iconLabelGap }}
                      whileTap={{ scale: MOBILE_PILL.tapScale }}
                      transition={MOBILE_PILL.tapSpring}
                    >
                      <LayoutDashboard className={`h-5 w-5 ${pathname === '/investor' ? 'text-seeko-accent' : ''}`} />
                      Dashboard
                    </motion.span>
                  </Link>
                  <motion.span
                    className="flex flex-col items-center justify-center"
                    style={{
                      paddingLeft: MOBILE_PILL.itemPaddingX,
                      paddingRight: MOBILE_PILL.itemPaddingX,
                      paddingTop: MOBILE_PILL.itemPaddingY,
                      paddingBottom: MOBILE_PILL.itemPaddingY,
                      minWidth: MOBILE_PILL.itemMinWidth,
                      gap: MOBILE_PILL.iconLabelGap,
                    }}
                    whileTap={{ scale: MOBILE_PILL.tapScale }}
                    transition={MOBILE_PILL.tapSpring}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        trigger('selection');
                        handleDownloadPdf(e);
                      }}
                      disabled={pdfLoading}
                      className="flex flex-col items-center justify-center rounded-full text-[11px] font-medium transition-colors text-muted-foreground disabled:opacity-50"
                    >
                      <FileDown className="h-5 w-5" />
                      {pdfLoading ? '…' : 'PDF'}
                    </button>
                  </motion.span>
                  {isAdmin && (
                    <Link
                      href="/"
                      onClick={() => trigger('selection')}
                      className={[
                        'relative flex flex-col items-center justify-center rounded-full text-[11px] font-medium transition-colors',
                        pathname === '/' ? 'text-seeko-accent' : 'text-muted-foreground',
                      ].join(' ')}
                      style={{
                        paddingLeft: MOBILE_PILL.itemPaddingX,
                        paddingRight: MOBILE_PILL.itemPaddingX,
                        paddingTop: MOBILE_PILL.itemPaddingY,
                        paddingBottom: MOBILE_PILL.itemPaddingY,
                        minWidth: MOBILE_PILL.itemMinWidth,
                      }}
                    >
                      {pathname === '/' && (
                        <motion.div
                          layoutId="investor-pill-active"
                          className="absolute inset-0 rounded-full bg-white/8"
                          transition={MOBILE_PILL.activeSlideSpring}
                        />
                      )}
                      <motion.span
                        className="relative z-10 flex flex-col items-center justify-center"
                        style={{ gap: MOBILE_PILL.iconLabelGap }}
                        whileTap={{ scale: MOBILE_PILL.tapScale }}
                        transition={MOBILE_PILL.tapSpring}
                      >
                        <Home className={`h-5 w-5 ${pathname === '/' ? 'text-seeko-accent' : ''}`} />
                        Main
                      </motion.span>
                    </Link>
                  )}
                  </LayoutGroup>
                </div>
              </nav>,
              document.body
            )}
          </>
        );
      })()}
    </>
  );
}
