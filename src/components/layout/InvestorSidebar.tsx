'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { LogOut, LayoutDashboard, FileDown, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

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
  const label = displayName || email;
  const [pdfLoading, setPdfLoading] = useState(false);

  async function handleDownloadPdf(e: React.MouseEvent) {
    e.preventDefault();
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const res = await fetch('/api/investor/export-summary', { credentials: 'same-origin' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error ?? 'Failed to generate PDF');
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
    } catch {
      toast.error('Download failed. Try again.');
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
            <Image src="/seeko-s.png" alt="SEEKO" width={24} height={24} />
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

        <div className="flex-1" />

        {/* Download summary PDF */}
        <div className="px-4 pb-2">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50 w-full text-left"
          >
            <FileDown className="h-3.5 w-3.5 shrink-0" />
            {pdfLoading ? 'Generating…' : 'Download summary (PDF)'}
          </button>
        </div>

        {/* Back to dashboard (admins only) */}
        {isAdmin && (
          <div className="px-4 pb-2">
            <Link
              href="/"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            >
              <LayoutDashboard className="h-3.5 w-3.5 shrink-0" />
              Back to dashboard
            </Link>
          </div>
        )}

        {/* User + settings + sign out */}
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
            className="flex items-center gap-2 rounded-md px-0 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
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

      {/* ── Mobile top header ─────────────────────────────── */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-14 bg-sidebar border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <Image src="/seeko-s.png" alt="SEEKO" width={20} height={20} />
          <span className="font-semibold text-sm tracking-tight text-sidebar-foreground">SEEKO</span>
          <span className="text-xs text-muted-foreground/60">· Investor Panel</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/investor/settings"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
            Settings
          </Link>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <FileDown className="h-3.5 w-3.5" />
            {pdfLoading ? '…' : 'PDF'}
          </button>
          {isAdmin && (
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard
            </Link>
          )}
          <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-[#f87171] transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </form>
        </div>
      </header>
    </>
  );
}
