import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emitEkoEvent } from '@/lib/eko-bus';
import { GlobalEkoAgent } from '../GlobalEkoAgent';

vi.mock('../AgentCompanion', () => ({
  AgentCompanion: ({ userKey }: { userKey?: string }) => (
    <div data-testid="eko-agent">EKO {userKey}</div>
  ),
}));

function mockProfile(profile: {
  id: string;
  isAdmin?: boolean;
  isInvestor?: boolean;
} | null) {
  globalThis.fetch = vi.fn(async () => {
    if (!profile) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    return Response.json({
      profile: {
        id: profile.id,
        email: 'person@example.invalid',
        displayName: 'Person Example',
        isAdmin: Boolean(profile.isAdmin),
        isInvestor: Boolean(profile.isInvestor),
      },
    });
  }) as unknown as typeof fetch;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GlobalEkoAgent', () => {
  it('mounts EKO for admins', async () => {
    mockProfile({ id: 'admin-1', isAdmin: true });

    render(<GlobalEkoAgent />);

    expect(await screen.findByTestId('eko-agent')).toHaveTextContent('admin-1');
  });

  it('mounts EKO for investors', async () => {
    mockProfile({ id: 'investor-1', isInvestor: true });

    render(<GlobalEkoAgent />);

    expect(await screen.findByTestId('eko-agent')).toHaveTextContent('investor-1');
  });

  it('does not mount EKO for regular members or logged-out users', async () => {
    mockProfile({ id: 'member-1' });
    const { unmount } = render(<GlobalEkoAgent />);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith('/api/profile', { credentials: 'same-origin' }));
    expect(screen.queryByTestId('eko-agent')).not.toBeInTheDocument();

    unmount();
    mockProfile(null);
    render(<GlobalEkoAgent />);

    await waitFor(() => expect(screen.queryByTestId('eko-agent')).not.toBeInTheDocument());
  });

  it('bridges EKO navigation events through the app router callback', async () => {
    mockProfile({ id: 'admin-1', isAdmin: true });
    const onNavigate = vi.fn();
    render(<GlobalEkoAgent onNavigate={onNavigate} />);
    await screen.findByTestId('eko-agent');

    emitEkoEvent({ type: 'navigate', path: '/issues' });

    expect(onNavigate).toHaveBeenCalledWith('/issues');
  });
});
