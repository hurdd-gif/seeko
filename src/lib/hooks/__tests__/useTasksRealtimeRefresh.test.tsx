import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emitEkoEvent } from '@/lib/eko-bus';
import { useTasksRealtimeRefresh } from '../useTasksRealtimeRefresh';

type ChangeHandler = (payload: unknown) => void;

const channelState: {
  handler: ChangeHandler | null;
  subscribed: boolean;
  removed: boolean;
} = { handler: null, subscribed: false, removed: false };

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const channel = {
      on: (_event: string, _filter: unknown, handler: ChangeHandler) => {
        channelState.handler = handler;
        return channel;
      },
      subscribe: () => {
        channelState.subscribed = true;
        return channel;
      },
    };
    return {
      channel: () => channel,
      removeChannel: () => {
        channelState.removed = true;
        return Promise.resolve('ok');
      },
      auth: {
        getSession: () => Promise.resolve({ data: { session: null } }),
      },
      realtime: { setAuth: () => {} },
    };
  },
}));

function Probe() {
  useTasksRealtimeRefresh();
  return <p>probe</p>;
}

async function renderWithDataRouter() {
  const router = createMemoryRouter([{ path: '/', element: <Probe /> }]);
  const revalidate = vi.spyOn(router, 'revalidate').mockResolvedValue();
  render(<RouterProvider router={router} />);
  expect(await screen.findByText('probe')).toBeInTheDocument();
  // Let the getSession() microtask chain finish so the channel subscribes.
  await act(async () => {});
  return revalidate;
}

beforeEach(() => {
  channelState.handler = null;
  channelState.subscribed = false;
  channelState.removed = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useTasksRealtimeRefresh', () => {
  it('revalidates once per debounced burst of realtime tasks changes', async () => {
    const revalidate = await renderWithDataRouter();
    expect(channelState.subscribed).toBe(true);

    // Fake timers only after mount — RouterProvider's initialization and
    // findByText's waitFor need real timers to settle.
    vi.useFakeTimers();

    // Three rapid row events (multi-row write) collapse into one refetch.
    act(() => {
      channelState.handler?.({ eventType: 'INSERT' });
      channelState.handler?.({ eventType: 'UPDATE' });
      channelState.handler?.({ eventType: 'DELETE' });
    });
    expect(revalidate).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(revalidate).toHaveBeenCalledTimes(1);
  });

  it('revalidates on an EKO write-executed bus event', async () => {
    const revalidate = await renderWithDataRouter();

    vi.useFakeTimers();
    act(() => {
      emitEkoEvent({ type: 'write-executed' });
      vi.advanceTimersByTime(300);
    });
    expect(revalidate).toHaveBeenCalledTimes(1);
  });

  it('ignores non-write bus events (spotlight is choreography, not data)', async () => {
    const revalidate = await renderWithDataRouter();

    vi.useFakeTimers();
    act(() => {
      emitEkoEvent({ type: 'spotlight', target: { name: 'X' } });
      vi.advanceTimersByTime(300);
    });
    expect(revalidate).not.toHaveBeenCalled();
  });

  it('revalidates when the window regains focus', async () => {
    const revalidate = await renderWithDataRouter();

    vi.useFakeTimers();
    act(() => {
      window.dispatchEvent(new Event('focus'));
      vi.advanceTimersByTime(300);
    });
    expect(revalidate).toHaveBeenCalledTimes(1);
  });

  it('mounts as a no-op outside a data router (plain MemoryRouter)', () => {
    render(
      <MemoryRouter>
        <Probe />
      </MemoryRouter>
    );

    expect(screen.getByText('probe')).toBeInTheDocument();
    expect(channelState.subscribed).toBe(false);
  });
});
