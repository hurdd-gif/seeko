// src/components/contractor/__tests__/CompletedTimeline.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ContractorDeliverable } from '@/lib/contractor-index';
import type { TimelineMonth } from '@/lib/contractor-buckets';
import { CompletedTimeline } from '../CompletedTimeline';

function done(id: string, name: string, deadline: string | null): ContractorDeliverable {
  return {
    id,
    name,
    department: 'Coding',
    status: 'Done',
    priority: 'Low',
    deadline,
    progress: 100,
    description: null,
  };
}

const month = (key: string, label: string, items: ContractorDeliverable[]): TimelineMonth => ({
  key,
  label,
  items,
});

describe('CompletedTimeline', () => {
  it('renders nothing when the timeline is empty', () => {
    const { container } = render(<CompletedTimeline timeline={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a month label, a completed entry, and its short date', () => {
    render(
      <CompletedTimeline
        timeline={[month('2026-05', 'May 2026', [done('a', 'Combat SFX pack', '2026-05-20')])]}
      />,
    );
    expect(screen.getByText('May 2026')).toBeInTheDocument();
    expect(screen.getByText('Combat SFX pack')).toBeInTheDocument();
    expect(screen.getByText('May 20')).toBeInTheDocument();
  });

  it('collapses entries beyond the initial count behind a "Show N earlier" toggle', () => {
    const items = [
      done('e1', 'Entry one', '2026-05-26'),
      done('e2', 'Entry two', '2026-05-24'),
      done('e3', 'Entry three', '2026-05-22'),
      done('e4', 'Entry four', '2026-05-20'),
      done('e5', 'Entry five', '2026-05-18'),
      done('e6', 'Entry six', '2026-05-16'),
    ];
    render(<CompletedTimeline timeline={[month('2026-05', 'May 2026', items)]} />);

    // first 4 shown, last 2 hidden
    expect(screen.getByText('Entry four')).toBeInTheDocument();
    expect(screen.queryByText('Entry five')).not.toBeInTheDocument();
    expect(screen.queryByText('Entry six')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show 2 earlier/i }));

    expect(screen.getByText('Entry five')).toBeInTheDocument();
    expect(screen.getByText('Entry six')).toBeInTheDocument();
    // toggle is gone once everything is shown
    expect(screen.queryByRole('button', { name: /earlier/i })).not.toBeInTheDocument();
  });
});
