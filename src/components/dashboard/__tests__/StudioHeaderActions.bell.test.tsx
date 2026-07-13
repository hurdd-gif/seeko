import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { StudioHeaderActions } from '../StudioHeaderActions';
import { LiveToastProvider } from '../notifications/LiveToastContext';
import {
  claimPendingCreateIssue,
  clearPendingCreateIssue,
  subscribeCreateIssue,
  type CreateIssueRequest,
} from '@/lib/create-issue-bus';

/**
 * The "missing inbox": the migrated header should mount the LIVE realtime
 * NotificationBell — not the static Inbox glyph — once the Paper loaders carry
 * `account.userId` (see shell-account-userid.test.ts). This file does NOT mock
 * next/dynamic, so the real lazy bell loads, and wraps in <LiveToastProvider>
 * (the bell's useLiveToast() throws without it — which is exactly why main.tsx
 * now mounts the provider app-wide) and a router (its useRouter shim → navigate).
 */

// Stub the browser Supabase client so the bell's realtime channel doesn't open a
// real socket — we only assert that the live bell mounts vs. the static glyph.
// Shape matches SupabaseLike (src/lib/realtime.ts): subscribeToTable calls
// auth.getSession() before subscribing, so the stub must carry it.
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => {
    const channel = {
      on: () => channel,
      subscribe: () => channel,
    } as Record<string, () => unknown>;
    return {
      channel: () => channel,
      removeChannel: () => {},
      realtime: { setAuth: () => {} },
      auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
      from: () => ({
        update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      }),
    };
  },
}));

function renderHeader(props: React.ComponentProps<typeof StudioHeaderActions>) {
  return render(
    <MemoryRouter>
      <LiveToastProvider>
        <StudioHeaderActions {...props} />
      </LiveToastProvider>
    </MemoryRouter>,
  );
}

describe('StudioHeaderActions — live inbox bell', () => {
  // The create-issue bus is a module singleton (it has to be — it outlives the
  // navigation it exists to survive), so a request parked by one test would
  // otherwise be claimed by the next.
  beforeEach(() => clearPendingCreateIssue());

  it('mounts the realtime NotificationBell when account carries a userId', async () => {
    renderHeader({
      email: 'ada@seeko.studio',
      initials: 'AL',
      userId: 'user-1',
      unreadCount: 2,
      notifications: [],
    });
    // next/dynamic → React.lazy, so the bell resolves asynchronously.
    expect(await screen.findByRole('button', { name: 'Open inbox' })).toBeInTheDocument();
  });

  it('falls back to the static Inbox glyph (no live bell) without a userId', () => {
    renderHeader({ email: 'ada@seeko.studio', initials: 'AL' });
    // The header itself renders synchronously…
    expect(screen.getByRole('button', { name: /Create/ })).toBeInTheDocument();
    // …but there is no inbox trigger — the glyph is decorative (aria-hidden).
    expect(screen.queryByRole('button', { name: 'Open inbox' })).not.toBeInTheDocument();
  });

  /**
   * Create used to morph the pill into an inline quick-add form. It now summons
   * the full New-issue composer, which lives on the board — so the header's job
   * is only to ASK for it. These two tests pin both halves of that contract,
   * because the header renders on pages that have no board to answer.
   */
  it('asks the board for the New-issue composer when one is listening', () => {
    const heard: CreateIssueRequest[] = [];
    const unsubscribe = subscribeCreateIssue((request) => heard.push(request));

    renderHeader({ email: 'ada@seeko.studio', initials: 'AL' });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(heard).toHaveLength(1);
    // No status: the header's Create is unscoped, so the composer opens on its
    // own default. Only a column's "+" pre-selects a bucket.
    expect(heard[0].status).toBeUndefined();
    // Delivered live — nothing is left parked for a later board to claim.
    expect(claimPendingCreateIssue()).toBeNull();

    unsubscribe();
  });

  it('parks the request for the board to claim when no board is mounted', () => {
    // /docs, /activity: the pill is still there, and must still work.
    renderHeader({ email: 'ada@seeko.studio', initials: 'AL' });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(claimPendingCreateIssue()).toEqual({});
    // Claimed once, and only once — a stale request must not re-open the
    // composer on some unrelated later visit to the board.
    expect(claimPendingCreateIssue()).toBeNull();
  });
});
