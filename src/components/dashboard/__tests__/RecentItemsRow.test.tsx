import { render, screen } from '@testing-library/react';
import { RecentItemsRow } from '../RecentItemsRow';

const NOW = new Date('2026-05-17T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

describe('RecentItemsRow timeAgo labels', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // The mockup's time slot is a fixed 35px column at 12px Inter — it only fits
  // single short tokens. "May 10"-style two-token dates wrap/overflow and break
  // pixel parity, so timeAgo must emit the mockup's relative buckets.
  it('emits single-token relative buckets that fit the 35px slot', () => {
    render(
      <RecentItemsRow
        items={[
          { id: '1', kind: 'task', title: 'Today item', updated_at: hoursAgo(6), href: '/a' },
          { id: '2', kind: 'task', title: 'Oneday item', updated_at: hoursAgo(30), href: '/b' },
          { id: '3', kind: 'task', title: 'Fourday item', updated_at: daysAgo(4), href: '/c' },
          { id: '4', kind: 'task', title: 'Week item', updated_at: daysAgo(11), href: '/d' },
          { id: '5', kind: 'task', title: 'Weeks item', updated_at: daysAgo(27), href: '/e' },
          { id: '6', kind: 'task', title: 'Old item', updated_at: daysAgo(100), href: '/f' },
        ]}
      />,
    );
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('1d')).toBeInTheDocument();
    expect(screen.getByText('4d')).toBeInTheDocument();
    expect(screen.getByText('1 week')).toBeInTheDocument();
    expect(screen.getByText('3 wk')).toBeInTheDocument();
    // 100 days before 2026-05-17 ≈ 2026-02-06 → bare month abbreviation
    expect(screen.getByText('Feb')).toBeInTheDocument();
    // the old long form must be gone
    expect(screen.queryByText(/\w+ \d{1,2}$/)).not.toBeInTheDocument();
  });
});

describe('RecentItemsRow', () => {
  it('renders eyebrow + tiles', () => {
    render(
      <RecentItemsRow
        items={[
          {
            id: '1',
            kind: 'task',
            title: 'Wire up auth',
            updated_at: '2026-05-13T10:00:00Z',
            href: '/tasks/1',
          },
          {
            id: '2',
            kind: 'task',
            title: 'Studio brief',
            updated_at: '2026-05-12T10:00:00Z',
            href: '/tasks/2',
          },
        ]}
      />,
    );
    expect(screen.getByText('Recently worked on')).toBeInTheDocument();
    expect(screen.getByText('Wire up auth')).toBeInTheDocument();
    expect(screen.getByText('Studio brief')).toBeInTheDocument();
  });
});
