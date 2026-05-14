import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RailNextMilestone } from '../RailNextMilestone';
import type { Area } from '@/lib/types';

const base: Omit<Area, 'id' | 'name' | 'target_date'> = {
  status: 'Active',
  progress: 50,
  phase: 'Beta',
};

describe('RailNextMilestone', () => {
  it('renders the area name, phase, and months-out', () => {
    const areas: Area[] = [{ ...base, id: 'a', name: 'Main Game', target_date: '2026-09-13' }];
    render(<RailNextMilestone areas={areas} now={new Date('2026-05-13')} />);
    expect(screen.getByText(/Main Game/)).toBeInTheDocument();
    expect(screen.getByText(/Beta/)).toBeInTheDocument();
    expect(screen.getByText(/4\s*mo/i)).toBeInTheDocument();
  });

  it('renders the formatted target date', () => {
    const areas: Area[] = [{ ...base, id: 'a', name: 'Main Game', target_date: '2026-09-15' }];
    render(<RailNextMilestone areas={areas} now={new Date('2026-05-13')} />);
    expect(screen.getByText('Sep 15')).toBeInTheDocument();
  });

  it('renders an empty state when no areas have target_date', () => {
    const areas: Area[] = [{ ...base, id: 'a', name: 'Main Game' }];
    render(<RailNextMilestone areas={areas} now={new Date('2026-05-13')} />);
    expect(screen.getByText(/No target dates set/i)).toBeInTheDocument();
  });
});
