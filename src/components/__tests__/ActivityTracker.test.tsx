import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Pathname drives the single page_view event recorded on mount.
vi.mock('@/lib/react-router-adapters', () => ({ usePathname: () => '/tasks' }));

// Capture the bulk-insert calls so we can assert whether — and how — analytics
// are written. The component fire-and-forgets the insert, so a resolved promise
// is enough.
const mockInsert = vi.fn((_batch: unknown) => Promise.resolve({ error: null }));
const mockFrom = vi.fn(() => ({ insert: mockInsert }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

import { ActivityTracker } from '../ActivityTracker';

// A real-ish clock so the click debounce (now - lastClick) doesn't swallow the
// first click — fake timers otherwise start at epoch 0.
const NOW = new Date('2026-06-18T12:00:00.000Z');

describe('ActivityTracker — prod-only, batched analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('writes NOTHING outside production — no insert on mount, click, or flush', () => {
    vi.stubEnv('NODE_ENV', 'development');

    render(
      <>
        <ActivityTracker userId="u1" />
        <button>Save</button>
      </>,
    );

    // In prod this click would queue an event and the 5s interval would flush it.
    fireEvent.click(screen.getByText('Save'));
    act(() => vi.advanceTimersByTime(10_000));

    // The client may be constructed (memoised), but no row is ever written: the
    // listener isn't attached and the flush interval never starts.
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('batches page_view + click into ONE bulk insert after the flush interval', () => {
    vi.stubEnv('NODE_ENV', 'production');

    render(
      <>
        <ActivityTracker userId="u1" />
        <button>Save</button>
      </>,
    );

    // Mount queued a page_view; the click queues a second event. Nothing is
    // written until the buffer is flushed.
    fireEvent.click(screen.getByText('Save'));
    expect(mockInsert).not.toHaveBeenCalled();

    // The periodic flush drains the whole buffer in a single bulk insert.
    act(() => vi.advanceTimersByTime(5_000));

    expect(mockFrom).toHaveBeenCalledWith('user_events');
    expect(mockInsert).toHaveBeenCalledTimes(1);

    const batch = mockInsert.mock.calls[0][0] as unknown as Array<{
      user_id: string;
      event_type: string;
      page: string;
      target?: string;
    }>;
    expect(Array.isArray(batch)).toBe(true);
    expect(batch).toHaveLength(2);

    const pageView = batch.find((e) => e.event_type === 'page_view');
    const click = batch.find((e) => e.event_type === 'click');
    expect(pageView).toMatchObject({ user_id: 'u1', page: '/tasks' });
    expect(click).toMatchObject({ user_id: 'u1', event_type: 'click', target: 'Save' });
  });
});
