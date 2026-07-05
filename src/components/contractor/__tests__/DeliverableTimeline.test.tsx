// src/components/contractor/__tests__/DeliverableTimeline.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Bucket } from '@/lib/contractor-buckets';
import { DeliverableTimeline } from '../DeliverableTimeline';

const bucket = (over: Partial<Bucket>): Bucket => ({
  key: over.key ?? 'thisWeek',
  label: over.label ?? 'This week',
  items: over.items ?? [],
});

describe('DeliverableTimeline', () => {
  it('renders an empty state when there are no buckets', () => {
    render(<DeliverableTimeline buckets={[]} />);
    expect(screen.getByText(/no deliverables assigned yet/i)).toBeInTheDocument();
  });

  it('renders bucket labels and their deliverables', () => {
    const buckets: Bucket[] = [
      bucket({
        key: 'overdue',
        label: 'Overdue',
        items: [
          {
            id: 'a',
            name: 'SFX pass',
            department: 'Animation',
            status: 'In Review',
            priority: 'High',
            deadline: '2026-07-01',
            progress: 70,
            description: null,
          },
        ],
      }),
    ];
    render(<DeliverableTimeline buckets={buckets} />);
    expect(screen.getByRole('heading', { name: 'Overdue' })).toBeInTheDocument();
    expect(screen.getByText('SFX pass')).toBeInTheDocument();
  });
});
