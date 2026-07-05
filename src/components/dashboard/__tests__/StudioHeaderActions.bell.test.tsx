import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { StudioHeaderActions } from '../StudioHeaderActions';
import { LiveToastProvider } from '../notifications/LiveToastContext';

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
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => {
    const channel = {
      on: () => channel,
      subscribe: () => channel,
    } as Record<string, () => unknown>;
    return {
      channel: () => channel,
      removeChannel: () => {},
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

  it('morphs the global Create button into quick add', async () => {
    renderHeader({ email: 'ada@seeko.studio', initials: 'AL' });

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByPlaceholderText('Issue title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Status' })).toHaveTextContent('Todo');
    expect(screen.getByRole('button', { name: 'Priority' })).toHaveTextContent('Medium');
    expect(screen.getByRole('button', { name: 'Department' })).toHaveTextContent('Coding');
  });

  it('lets quick add metadata be changed inline', async () => {
    renderHeader({ email: 'ada@seeko.studio', initials: 'AL' });

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Status' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /In Progress/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Priority' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /High/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Department' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /UI\/UX/ }));

    expect(screen.getByRole('button', { name: 'Status' })).toHaveTextContent('In Progress');
    expect(screen.getByRole('button', { name: 'Priority' })).toHaveTextContent('High');
    expect(screen.getByRole('button', { name: 'Department' })).toHaveTextContent('UI/UX');
  });
});
