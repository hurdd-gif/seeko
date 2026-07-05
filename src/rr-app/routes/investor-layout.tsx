import { type ElementType, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Link,
  Outlet,
  redirect,
  useLoaderData,
  useLocation,
  type LoaderFunctionArgs,
} from 'react-router';
import {
  FileDown,
  Home,
  LogOut,
  Settings,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react';
import { toast } from 'sonner';
import { springs } from '@/lib/motion';
import type { InvestorOverviewData, InvestorProfile } from '@/lib/investor-index';

/* ─────────────────────────────────────────────────────────
 * Investor cluster chrome — Paper top-tab shell.
 *
 * Investors get the same visual grammar as the main dashboard: fixed Paper
 * canvas, top tabs, compact action cluster, and one scrolling content column.
 * The exposed tabs stay investor-specific: Dashboard, Documents, Payments.
 * ───────────────────────────────────────────────────────── */

type InvestorLayoutData =
  | { status: 'ready'; profile: InvestorProfile }
  | { status: 'forbidden' };

export async function investorLayoutLoader(
  _args: LoaderFunctionArgs,
): Promise<InvestorLayoutData | Response> {
  const response = await fetch('/api/investor-index');

  // Unauthenticated → the legacy middleware bounced to /login. Mirror that.
  if (response.status === 401) return redirect('/login');
  // Authenticated but not an investor/admin, or no profile → calm forbidden card.
  if (response.status === 403 || response.status === 404) return { status: 'forbidden' };
  if (!response.ok) {
    throw new Response('Unable to load investor panel', { status: response.status });
  }

  const index = (await response.json()) as InvestorOverviewData;
  return { status: 'ready', profile: index.profile };
}

export function InvestorLayout() {
  const data = useLoaderData() as InvestorLayoutData;

  if (data.status === 'forbidden') {
    return (
      <div className="overview-light flex min-h-screen items-center justify-center bg-white px-6 antialiased">
        <div className="rr-panel w-full max-w-md">
          <h1 className="m-0 text-xl font-semibold text-[#111]">Investor access required</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#505050]">
            This panel is available to investors and admins. If you think this is a
            mistake, ask a SEEKO admin to enable investor access on your profile.
          </p>
          <a
            href="/login"
            className="mt-4 inline-flex h-9 items-center rounded-full bg-[#111] px-4 text-sm font-medium text-white transition-colors hover:bg-[#000]"
          >
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <InvestorShell profile={data.profile}>
      <Outlet />
    </InvestorShell>
  );
}

function getInitials(name: string): string {
  return name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

/** One account-menu row — label left, icon right; matches the studio menu's
 * PopoverLink (dim-others-on-hover, x-nudge, staggered entrance). */
function InvestorMenuLink({
  to,
  icon: Icon,
  label,
  reduce,
  onClick,
}: {
  to: string;
  icon: ElementType;
  label: string;
  reduce: boolean | null;
  onClick: () => void;
}) {
  return (
    <motion.div variants={reduce ? undefined : MENU_ROW}>
      <motion.div whileHover={reduce ? undefined : { x: 2 }} transition={SNAPPY}>
        <Link
          to={to}
          role="menuitem"
          onClick={onClick}
          className="flex items-center justify-between rounded-2xl px-4 py-3 text-[14px] font-medium tracking-[-0.28px] text-[#0d0d0d] opacity-100 transition-[color,background-color,opacity] group-hover/menu:opacity-20 hover:bg-[#0000000a] hover:opacity-100!"
        >
          <span>{label}</span>
          <Icon className="size-5 text-[#808080]" />
        </Link>
      </motion.div>
    </motion.div>
  );
}

type NavItem = {
  to: string;
  label: string;
  isActive: (pathname: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  { to: '/investor', label: 'Dashboard', isActive: (p) => p === '/investor' },
  { to: '/investor/docs', label: 'Documents', isActive: (p) => p.startsWith('/investor/docs') },
  { to: '/investor/payments', label: 'Payments', isActive: (p) => p === '/investor/payments' },
];

const TAB_BASE =
  'flex h-[32px] items-center px-2 text-[13.5px] font-medium leading-[18px] transition-[color,transform] duration-150 ease-out motion-safe:active:scale-[0.97]';
const TAB_ACTIVE = 'text-[#3a3a3a]';
const TAB_INACTIVE = 'text-[#8a8a8a] hover:text-[#5a5a5a]';

/* ── Account menu motion — mirrors the studio header menu (StudioHeaderActions)
 * so the investor dropdown reads identically: a clip-path circle blooming from
 * the avatar (226px,-26px is the 36px avatar's centre over a 244px panel), rows
 * rising + staggering behind it, a confirm-to-sign-out toggle. Reduced-motion
 * collapses to a plain opacity fade. */
const SNAPPY = springs.snappy;
const MENU_ORIGIN = '226px -26px';
const MENU_R_OPEN = 720;
const MENU_R_CLOSED = 18;
const MENU_CIRCLE_SPRING = { type: 'spring' as const, visualDuration: 0.4, bounce: 0 };
const MENU_CIRCLE_EXIT = { duration: 0.2, ease: [0.4, 0, 1, 1] as const };
const MENU_LIST: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.045, delayChildren: 0.06 } },
};
const MENU_ROW: Variants = {
  hidden: { opacity: 0, y: 24 },
  shown: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 460, damping: 34 } },
};

export function InvestorShell({
  profile,
  children,
}: {
  profile: InvestorProfile;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const label = profile.displayName || profile.email || 'Investor';
  const [pdfLoading, setPdfLoading] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!profileOpen) return;
    function close() {
      setProfileOpen(false);
      setConfirmingSignOut(false);
    }
    function handlePointerDown(event: PointerEvent) {
      if (!profileMenuRef.current?.contains(event.target as Node)) close();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [profileOpen]);

  // Clip-path circle reveal from the avatar (or a plain fade under reduced-motion).
  const panelMotion = reduce
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0, transition: { duration: 0.11 } },
        transition: { duration: 0.11 },
      }
    : {
        initial: { clipPath: `circle(${MENU_R_CLOSED}px at ${MENU_ORIGIN})`, opacity: 0 },
        animate: { clipPath: `circle(${MENU_R_OPEN}px at ${MENU_ORIGIN})`, opacity: 1 },
        exit: {
          clipPath: `circle(${MENU_R_CLOSED}px at ${MENU_ORIGIN})`,
          opacity: 0,
          transition: { clipPath: MENU_CIRCLE_EXIT, opacity: { duration: 0.12 } },
        },
        transition: { clipPath: MENU_CIRCLE_SPRING, opacity: { duration: 0.16 } },
      };

  async function handleDownloadPdf() {
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
      a.download = 'seeko-investor-summary.pdf';
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
    <div className="overview-light fixed inset-0 z-40 flex flex-col overflow-hidden bg-white text-[#111] antialiased">
      <header className="shrink-0 border-b border-black/[0.06] bg-white">
        <div className="flex w-full items-center justify-between gap-3 px-6 pb-3 pt-6 md:px-[52px] md:pt-11">
          <div className="flex min-w-0 items-center gap-6">
            <Link to="/investor" aria-label="Investor dashboard" className="flex min-w-0 items-center gap-2.5">
              <img src="/seeko-logo.png" alt="" width={24} height={24} className="size-6 shrink-0" />
              <span className="hidden whitespace-nowrap text-[13.5px] font-semibold text-[#111] sm:inline">
                Investor
              </span>
            </Link>

            <nav aria-label="Investor sections" className="-ml-2 flex items-center gap-1">
              {NAV_ITEMS.map(({ to, label: navLabel, isActive }) => {
                const active = isActive(pathname);
                return (
                  <Link
                    key={to}
                    to={to}
                    data-testid={`${navLabel} tab`}
                    aria-current={active ? 'page' : undefined}
                    className={`${TAB_BASE} ${active ? TAB_ACTIVE : TAB_INACTIVE}`}
                  >
                    {navLabel}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={pdfLoading}
              aria-label="Download PDF"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-black/[0.04] pl-3 pr-3.5 text-[13px] font-medium text-[#545454] transition-[background-color,transform] duration-150 ease-out hover:bg-black/[0.07] active:scale-[0.97] disabled:opacity-50"
            >
              <FileDown className="size-3.5" />
              <span className="hidden sm:inline">{pdfLoading ? 'Generating...' : 'Download PDF'}</span>
              <span className="sm:hidden">{pdfLoading ? '...' : 'PDF'}</span>
            </button>
            <div ref={profileMenuRef} className="relative">
              <motion.button
                type="button"
                onClick={() => setProfileOpen((open) => !open)}
                aria-label="Account menu"
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                whileHover={reduce ? undefined : { scale: 1.05 }}
                whileTap={reduce ? undefined : { scale: 0.95 }}
                transition={SNAPPY}
                className="relative z-[60] rounded-full"
              >
                <span className="flex size-9 items-center justify-center overflow-hidden rounded-full bg-[#262626] text-[11px] font-medium leading-[13px] text-[#f0f0f0] ring-[0.5px] ring-inset ring-[#0000001f]">
                  {profile.avatarUrl ? (
                    <img src={profile.avatarUrl} alt="" className="size-full object-cover" />
                  ) : (
                    getInitials(label)
                  )}
                </span>
              </motion.button>

              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    {...panelMotion}
                    role="menu"
                    className="group/menu absolute right-0 top-full z-[95] mt-2 flex w-[244px] flex-col overflow-hidden rounded-[20px] bg-white p-1 shadow-seeko-pop"
                  >
                    <motion.div
                      variants={reduce ? undefined : MENU_LIST}
                      initial={reduce ? undefined : 'hidden'}
                      animate={reduce ? undefined : 'shown'}
                      className="flex flex-col gap-1"
                    >
                      {/* Identity — name + email (no avatar, matches studio menu) */}
                      <motion.div variants={reduce ? undefined : MENU_ROW} className="flex items-center px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-medium tracking-[-0.28px] text-[#0d0d0d]">
                            {profile.displayName ?? 'Investor'}
                          </p>
                          <p className="mt-0.5 truncate text-[13px] text-[#808080]">{profile.email}</p>
                        </div>
                      </motion.div>

                      <div className="mx-4 h-px bg-[#0000000d]" />

                      <div className="flex flex-col">
                        <InvestorMenuLink
                          to="/investor/settings"
                          icon={Settings}
                          label="Settings"
                          reduce={reduce}
                          onClick={() => setProfileOpen(false)}
                        />
                        {profile.isAdmin && (
                          <InvestorMenuLink
                            to="/"
                            icon={Home}
                            label="Back to dashboard"
                            reduce={reduce}
                            onClick={() => setProfileOpen(false)}
                          />
                        )}
                      </div>

                      <div className="mx-4 h-px bg-[#0000000d]" />

                      {/* Sign out — destructive, confirm toggle (matches studio menu) */}
                      <motion.div variants={reduce ? undefined : MENU_ROW} className="flex flex-col overflow-hidden">
                        <AnimatePresence mode="wait" initial={false}>
                          {confirmingSignOut ? (
                            <motion.div
                              key="confirm"
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -8 }}
                              transition={{ ...SNAPPY, opacity: { duration: 0.12 } }}
                              className="flex items-center justify-between rounded-2xl px-4 py-3"
                            >
                              <span className="text-[14px] font-medium tracking-[-0.28px] text-[#808080]">
                                Sign out?
                              </span>
                              <div className="flex items-center gap-3">
                                <form action="/auth/signout" method="post">
                                  <button
                                    type="submit"
                                    className="text-[14px] font-medium text-[#e5484d] transition-colors hover:text-[#d33b40]"
                                  >
                                    Yes
                                  </button>
                                </form>
                                <button
                                  type="button"
                                  onClick={() => setConfirmingSignOut(false)}
                                  className="text-[14px] text-[#808080] transition-colors hover:text-[#0d0d0d]"
                                >
                                  Cancel
                                </button>
                              </div>
                            </motion.div>
                          ) : (
                            <motion.button
                              key="signout"
                              type="button"
                              initial={{ opacity: 0, y: -8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 8 }}
                              transition={{ ...SNAPPY, opacity: { duration: 0.12 } }}
                              onClick={() => setConfirmingSignOut(true)}
                              className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-[14px] font-medium tracking-[-0.28px] text-[#0d0d0d] transition-[color,background-color] hover:bg-[rgba(229,72,77,0.08)] hover:text-[#e5484d]"
                            >
                              <span>Sign out</span>
                              <LogOut className="size-5" />
                            </motion.button>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      <main className="scrollbar-paper min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-6 py-8 pb-24 md:px-[52px]">
          {children}
        </div>
      </main>
    </div>
  );
}
