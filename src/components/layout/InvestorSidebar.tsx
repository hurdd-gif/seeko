'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, LayoutGroup } from 'motion/react';
import { LogOut, LayoutDashboard, FileDown, Settings, Home, DollarSign, FileText } from 'lucide-react';
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

const BOTTOM_NAV = {
  tapSpring: { type: 'spring' as const, stiffness: 450, damping: 28 },
  tapScale: 0.92,
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
        {/* Subtle inner glow for depth */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/[0.02] via-transparent to-transparent" />
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center shrink-0 rounded-lg bg-white/[0.04]">
            <Image src="/seeko-s.png" alt="SEEKO" width={20} height={20} unoptimized />
          </div>
          <span className="font-semibold text-sm tracking-widest uppercase text-sidebar-foreground whitespace-nowrap">
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

        <nav className="flex flex-col gap-0.5 px-2 py-3 flex-1 mt-1">
          <LayoutGroup id="investor-sidebar-nav">
            {/* Dashboard (back to investor home) */}
            <Link
              href="/investor"
              className={[
                'relative flex items-center rounded-lg py-2 text-sm gap-3 px-3',
                pathname === '/investor'
                  ? 'text-seeko-accent font-medium'
                  : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-white/5 transition-colors',
              ].join(' ')}
            >
              {pathname === '/investor' && (
                <motion.div
                  layoutId="investor-nav-highlight"
                  className="absolute inset-0 rounded-lg bg-white/[0.06]"
                  transition={NAV_HIGHLIGHT.spring}
                />
              )}
              <span className="relative flex items-center justify-center size-7 shrink-0">
                <LayoutDashboard className={`h-4 w-4 ${pathname === '/investor' ? 'text-seeko-accent' : ''}`} />
              </span>
              <span className="relative whitespace-nowrap">Dashboard</span>
            </Link>

            {/* Documents */}
            <Link
              href="/investor/docs"
              className={[
                'relative flex items-center rounded-lg py-2 text-sm gap-3 px-3',
                pathname.startsWith('/investor/docs')
                  ? 'text-seeko-accent font-medium'
                  : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-white/5 transition-colors',
              ].join(' ')}
            >
              {pathname.startsWith('/investor/docs') && (
                <motion.div
                  layoutId="investor-nav-highlight"
                  className="absolute inset-0 rounded-lg bg-white/[0.06]"
                  transition={NAV_HIGHLIGHT.spring}
                />
              )}
              <span className="relative flex items-center justify-center size-7 shrink-0">
                <FileText className={`h-4 w-4 ${pathname.startsWith('/investor/docs') ? 'text-seeko-accent' : ''}`} />
              </span>
              <span className="relative whitespace-nowrap">Documents</span>
            </Link>

            {/* Payments */}
            <Link
              href="/investor/payments"
              className={[
                'relative flex items-center rounded-lg py-2 text-sm gap-3 px-3',
                pathname === '/investor/payments'
                  ? 'text-seeko-accent font-medium'
                  : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-white/5 transition-colors',
              ].join(' ')}
            >
              {pathname === '/investor/payments' && (
                <motion.div
                  layoutId="investor-nav-highlight"
                  className="absolute inset-0 rounded-lg bg-white/[0.06]"
                  transition={NAV_HIGHLIGHT.spring}
                />
              )}
              <span className="relative flex items-center justify-center size-7 shrink-0">
                <DollarSign className={`h-4 w-4 ${pathname === '/investor/payments' ? 'text-seeko-accent' : ''}`} />
              </span>
              <span className="relative whitespace-nowrap">Payments</span>
            </Link>

            {/* Back to main dashboard (admins only) */}
            {isAdmin && (
              <Link
                href="/"
                className={[
                  'relative flex items-center rounded-lg py-2 text-sm gap-3 px-3',
                  'text-muted-foreground hover:text-sidebar-foreground hover:bg-white/5 transition-colors',
                ].join(' ')}
              >
                <span className="relative flex items-center justify-center size-7 shrink-0">
                  <Home className="h-4 w-4" />
                </span>
                <span className="relative whitespace-nowrap">Back to dashboard</span>
              </Link>
            )}
          </LayoutGroup>
        </nav>

        <div className="flex-1" />

        {/* Download summary PDF */}
        <div className="px-2 pb-2">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-sidebar-foreground hover:bg-white/5 transition-colors disabled:opacity-50 w-full text-left"
          >
            <span className="flex items-center justify-center size-7 shrink-0">
              <FileDown className="h-4 w-4" />
            </span>
            {pdfLoading ? 'Generating…' : 'Download PDF'}
          </button>
        </div>

        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2.5 rounded-lg bg-white/[0.06] px-2.5 py-2 mb-2">
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
              'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
              pathname.startsWith('/investor/settings')
                ? 'text-seeko-accent font-medium bg-seeko-accent/[0.06]'
                : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-white/[0.03]',
            ].join(' ')}
          >
            <Settings className="h-3.5 w-3.5 shrink-0" />
            Settings
          </Link>

          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-[#f87171] hover:bg-red-500/[0.06] transition-colors w-full"
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
                className={`md:hidden flex items-center justify-between px-4 h-14 w-full shrink-0 border-b border-border ${!useHeaderSlot ? 'fixed top-0 left-0 right-0 z-40 mobile-fixed-layer' : ''}`}
                style={{
                  background: 'rgba(26, 26, 26, 0.80)',
                  backdropFilter: 'saturate(180%) blur(20px)',
                  WebkitBackdropFilter: 'saturate(180%) blur(20px)',
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
                className="md:hidden fixed bottom-0 left-0 right-0 z-50"
                style={{
                  background: 'rgba(26, 26, 26, 0.96)',
                  backdropFilter: 'saturate(180%) blur(16px)',
                  WebkitBackdropFilter: 'saturate(180%) blur(16px)',
                  paddingBottom: 'env(safe-area-inset-bottom)',
                }}
              >
                <LayoutGroup id="investor-mobile-nav">
                  <div className="flex items-stretch h-14">
                    <motion.div className="relative flex flex-1" whileTap={{ scale: BOTTOM_NAV.tapScale }} transition={BOTTOM_NAV.tapSpring}>
                      {pathname === '/investor' && (
                        <motion.div
                          layoutId="investor-mobile-indicator"
                          className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-seeko-accent"
                          transition={NAV_HIGHLIGHT.spring}
                        />
                      )}
                      <Link
                        href="/investor"
                        onClick={() => trigger('selection')}
                        className={[
                          'flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
                          pathname === '/investor' ? 'text-seeko-accent' : 'text-muted-foreground',
                        ].join(' ')}
                      >
                        <LayoutDashboard className="size-5" />
                        Dashboard
                      </Link>
                    </motion.div>
                    <motion.div className="relative flex flex-1" whileTap={{ scale: BOTTOM_NAV.tapScale }} transition={BOTTOM_NAV.tapSpring}>
                      {pathname.startsWith('/investor/docs') && (
                        <motion.div
                          layoutId="investor-mobile-indicator"
                          className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-seeko-accent"
                          transition={NAV_HIGHLIGHT.spring}
                        />
                      )}
                      <Link
                        href="/investor/docs"
                        onClick={() => trigger('selection')}
                        className={[
                          'flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
                          pathname.startsWith('/investor/docs') ? 'text-seeko-accent' : 'text-muted-foreground',
                        ].join(' ')}
                      >
                        <FileText className="size-5" />
                        Docs
                      </Link>
                    </motion.div>
                    <motion.div className="relative flex flex-1" whileTap={{ scale: BOTTOM_NAV.tapScale }} transition={BOTTOM_NAV.tapSpring}>
                      {pathname === '/investor/payments' && (
                        <motion.div
                          layoutId="investor-mobile-indicator"
                          className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-seeko-accent"
                          transition={NAV_HIGHLIGHT.spring}
                        />
                      )}
                      <Link
                        href="/investor/payments"
                        onClick={() => trigger('selection')}
                        className={[
                          'flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
                          pathname === '/investor/payments' ? 'text-seeko-accent' : 'text-muted-foreground',
                        ].join(' ')}
                      >
                        <DollarSign className="size-5" />
                        Payments
                      </Link>
                    </motion.div>
                    <motion.div className="relative flex flex-1" whileTap={{ scale: BOTTOM_NAV.tapScale }} transition={BOTTOM_NAV.tapSpring}>
                      <button
                        type="button"
                        onClick={(e) => { trigger('selection'); handleDownloadPdf(e); }}
                        disabled={pdfLoading}
                        className="flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors text-muted-foreground disabled:opacity-50"
                      >
                        <FileDown className="size-5" />
                        {pdfLoading ? '…' : 'PDF'}
                      </button>
                    </motion.div>
                    {isAdmin && (
                      <motion.div className="relative flex flex-1" whileTap={{ scale: BOTTOM_NAV.tapScale }} transition={BOTTOM_NAV.tapSpring}>
                        <Link
                          href="/"
                          onClick={() => trigger('selection')}
                          className={[
                            'flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
                            pathname === '/' ? 'text-seeko-accent' : 'text-muted-foreground',
                          ].join(' ')}
                        >
                          <Home className="size-5" />
                          Main
                        </Link>
                      </motion.div>
                    )}
                  </div>
                </LayoutGroup>
              </nav>,
              document.body
            )}
          </>
        );
      })()}
    </>
  );
}
