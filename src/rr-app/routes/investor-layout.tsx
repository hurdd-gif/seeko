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
import { springs, shellEntrance, DROPDOWN } from '@/lib/motion';
import { AppearanceToggle } from '@/components/dashboard/AppearanceToggle';
import { performSignOutExit } from '@/lib/sign-out';
import type { InvestorOverviewData, InvestorProfile } from '@/lib/investor-index';

/* ─────────────────────────────────────────────────────────
 * Investor cluster chrome — Paper top-tab shell.
 *
 * Investors get the same visual grammar as the main dashboard: fixed Paper
 * canvas, top tabs, compact action cluster, and one scrolling content column.
 * The exposed tabs stay investor-specific: Dashboard, Documents, Payments.
 * ───────────────────────────────────────────────────────── */

/* This loader OWNS /api/investor-index for the whole investor cluster.
 *
 * It used to keep only `index.profile` and drop the rest — while the /investor
 * index route fetched the very same URL again, concurrently, for the rest of
 * it. React Router runs layout and child loaders in PARALLEL, so that was two
 * simultaneous hits per visit on an endpoint that reads the entire tasks table
 * unbounded (src/lib/investor-index.ts).
 *
 * The response was always right here in hand, so the fix is to stop throwing it
 * away: keep the whole index, and let the child read it back through
 * useRouteLoaderData('investor-layout') instead of re-fetching. React Router
 * does not re-run a parent loader when navigating between its children, so the
 * index is now fetched exactly once per entry into the cluster.
 *
 * Anything added here that needs the index must read THIS loader's data — do
 * not reintroduce a second fetch of /api/investor-index in a child route. */
type InvestorLayoutData =
  | { status: 'ready'; index: InvestorOverviewData }
  | { status: 'forbidden' };

/** Narrowed shape a child route can rely on: the layout renders <Outlet /> only
 *  in the 'ready' branch, so a mounted child cannot observe 'forbidden'. */
export type InvestorLayoutReady = Extract<InvestorLayoutData, { status: 'ready' }>;

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
  return { status: 'ready', index };
}

export function InvestorLayout() {
  const data = useLoaderData() as InvestorLayoutData;

  if (data.status === 'forbidden') {
    return (
      <div className="overview-light flex min-h-screen items-center justify-center bg-surface-1 px-6 antialiased">
        <div className="rr-panel w-full max-w-md">
          <h1 className="m-0 text-xl font-semibold text-ink-title">Investor access required</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-body">
            This panel is available to investors and admins. If you think this is a
            mistake, ask a SEEKO admin to enable investor access on your profile.
          </p>
          <a
            href="/login"
            className="mt-4 inline-flex h-9 items-center rounded-full bg-ink-title px-4 text-sm font-medium text-surface-1 transition-colors hover:bg-[#000] dark:hover:bg-white"
          >
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <InvestorShell profile={data.index.profile}>
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
          className="flex items-center justify-between rounded-2xl px-4 py-3 text-[14px] font-medium tracking-[-0.28px] text-ink-title opacity-100 transition-[color,background-color,opacity] group-hover/menu:opacity-20 hover:bg-wash-4 hover:opacity-100!"
        >
          <span>{label}</span>
          <Icon className="size-5 text-ink-muted" />
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
const TAB_ACTIVE = 'text-ink';
const TAB_INACTIVE = 'text-ink-muted hover:text-[#5a5a5a] dark:hover:text-ink-body';

/* ── Account menu motion — mirrors the studio header menu (StudioHeaderActions)
 * so the investor dropdown reads identically. Both now sit on the CANONICAL
 * dropdown entrance (`DROPDOWN` in @/lib/motion): shell unfurls from under the
 * avatar (origin top-right, scale .96→1, ~190ms), rows ride in 20ms behind it
 * on an 18ms stagger, exit accelerates out in 130ms. Reduced-motion collapses
 * to a plain opacity fade.
 *
 * Was a 400ms clip-path circle blooming from the avatar with rows rising 24px
 * behind it — dropped with the studio menu's: too much ceremony for a surface
 * you open constantly. If you change one of these two menus, change the other. */
const SNAPPY = springs.snappy;
const MENU_LIST: Variants = {
  hidden: {},
  shown: {
    transition: {
      staggerChildren: DROPDOWN.row.stagger,
      delayChildren: DROPDOWN.row.baseDelay,
    },
  },
};
const MENU_ROW: Variants = {
  hidden: DROPDOWN.row.initial,
  shown: { opacity: 1, y: 0, transition: DROPDOWN.row.spring },
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
    <div className="overview-light fixed inset-0 z-40 flex flex-col overflow-hidden bg-surface-1 text-ink-title antialiased">
      <header className="shrink-0 border-b border-wash-6 bg-surface-1">
        <div className="flex w-full items-center justify-between gap-3 px-6 pb-3 pt-6 md:px-[52px] md:pt-11">
          <div className="flex min-w-0 items-center gap-3 sm:gap-6">
            {/* The mark's ink fills only ~19.4/24 of its viewBox, so size-5
                puts the glyph at ~16px — 1.6× the wordmark's cap height,
                a balanced lockup (size-6 read double the type's size). */}
            <Link to="/investor" aria-label="Investor dashboard" className="flex shrink-0 items-center gap-2">
              <img src="/seeko-mark.svg" alt="" width={20} height={20} className="size-5 shrink-0" />
              <span className="hidden whitespace-nowrap text-[13.5px] font-semibold text-ink-title sm:inline">
                Investor
              </span>
            </Link>

            {/* min-w-0 + overflow-x lets the tabs scroll (native momentum +
                rubber-band on touch) instead of ever colliding with the
                actions cluster on narrow viewports. */}
            <nav
              aria-label="Investor sections"
              className="-ml-2 flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
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
              className="inline-flex size-9 items-center justify-center rounded-full bg-wash-4 text-[13px] font-medium text-[#545454] transition-[background-color,transform] duration-150 ease-out hover:bg-black/[0.07] active:scale-[0.97] disabled:opacity-50 dark:text-ink-muted dark:hover:bg-white/[0.09] sm:w-auto sm:gap-1.5 sm:pl-3 sm:pr-3.5"
            >
              <FileDown className="size-3.5" />
              <span className="hidden sm:inline">{pdfLoading ? 'Generating...' : 'Download PDF'}</span>
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
                <span className="flex size-9 items-center justify-center overflow-hidden rounded-full bg-[#262626] text-[11px] font-medium leading-[13px] text-[#f0f0f0] ring-[0.5px] ring-inset ring-[#0000001f] dark:ring-white/10">
                  {profile.avatarUrl ? (
                    <img src={profile.avatarUrl} alt="" className="size-full object-cover" />
                  ) : (
                    getInitials(label)
                  )}
                </span>
              </motion.button>

              <AnimatePresence>
                {profileOpen && (
                  <>
                  {/* Page recedes behind the menu — same scrim as the studio
                      header's account menu (see StudioHeaderActions for the
                      full reasoning). z-40 sits under the avatar (z-60), so the
                      thing you pressed stays lit. Exit is shorter than enter and
                      tracks the panel's 130ms out. */}
                  <motion.div
                    key="investor-menu-scrim"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.14, ease: 'easeInOut' } }}
                    transition={{ duration: 0.22, ease: 'easeInOut' }}
                    className="fixed inset-0 z-40 bg-scrim"
                    onPointerDown={() => {
                      // The scrim is INSIDE profileMenuRef, so the document
                      // pointerdown listener reads a click here as a click *on*
                      // the menu and won't dismiss. Hence the explicit close.
                      setProfileOpen(false);
                      setConfirmingSignOut(false);
                    }}
                    aria-hidden
                  />
                  <motion.div
                    {...shellEntrance(reduce)}
                    style={{ transformOrigin: DROPDOWN.shell.transformOrigin }}
                    role="menu"
                    className="group/menu absolute right-0 top-full z-[95] mt-2 flex w-[244px] flex-col overflow-hidden rounded-[20px] bg-overlay p-1 shadow-seeko-pop"
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
                          <p className="truncate text-[14px] font-medium tracking-[-0.28px] text-ink-title">
                            {profile.displayName ?? 'Investor'}
                          </p>
                          <p className="mt-0.5 truncate text-[13px] text-ink-muted">{profile.email}</p>
                        </div>
                      </motion.div>

                      <div className="mx-4 h-px bg-wash-5" />

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
                            // /issues, NOT "/": the root route is a bare
                            // redirect wrapped in placeholder chrome (hardcoded
                            // "SK" account stub in routes.tsx) that paints while
                            // the real page lazy-loads. Land on the destination
                            // directly and that stub never flashes.
                            to="/issues"
                            icon={Home}
                            label="Back to dashboard"
                            reduce={reduce}
                            onClick={() => setProfileOpen(false)}
                          />
                        )}
                        {/* Same control as the studio account menu — theme is
                            global, so an investor-side switch flips the whole
                            app, exactly like the studio side. */}
                        <AppearanceToggle reduce={reduce} />
                      </div>

                      <div className="mx-4 h-px bg-wash-5" />

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
                              <span className="text-[14px] font-medium tracking-[-0.28px] text-ink-muted">
                                Sign out?
                              </span>
                              <div className="flex items-center gap-3">
                                <form
                                  action="/auth/signout"
                                  method="post"
                                  onSubmit={(e) => {
                                    // Reduced motion: the native POST runs — instant, no choreography.
                                    if (reduce) return;
                                    e.preventDefault();
                                    void performSignOutExit(e.currentTarget, () => {
                                      setProfileOpen(false);
                                      setConfirmingSignOut(false);
                                    });
                                  }}
                                >
                                  <button
                                    type="submit"
                                    className="text-[14px] font-medium text-[#e5484d] dark:text-danger transition-colors hover:text-[#d33b40]"
                                  >
                                    Yes
                                  </button>
                                </form>
                                <button
                                  type="button"
                                  onClick={() => setConfirmingSignOut(false)}
                                  className="text-[14px] text-ink-muted transition-colors hover:text-ink-title"
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
                              className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-[14px] font-medium tracking-[-0.28px] text-ink-title transition-[color,background-color] hover:bg-[rgba(229,72,77,0.08)] hover:text-[#e5484d] dark:hover:text-danger"
                            >
                              <span>Sign out</span>
                              <LogOut className="size-5" />
                            </motion.button>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    </motion.div>
                  </motion.div>
                  </>
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
