import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InvestorWhereWeAre } from '../InvestorWhereWeAre';
import type { Area } from '@/lib/types';

const mockAreas: Area[] = [
  { id: 'a1', name: 'Main Game', status: 'Active', progress: 62, phase: 'Beta' },
  { id: 'a2', name: 'Fighting Club', status: 'Active', progress: 34, phase: 'Alpha' },
];

// The component requires a per-area task map (keyed by area id); each row reads
// tasksPerArea[area.id] for its "X of Y tasks" context line. An empty map is a
// valid state the row handles defensively, so it satisfies the contract without
// introducing task-count text these assertions don't cover.
const noTasks: Record<string, { complete: number; total: number }> = {};

describe('InvestorWhereWeAre', () => {
  it('renders one row per area with name and progress', () => {
    render(<InvestorWhereWeAre areas={mockAreas} tasksPerArea={noTasks} />);
    expect(screen.getByText('Main Game')).toBeInTheDocument();
    expect(screen.getByText('Fighting Club')).toBeInTheDocument();
    expect(screen.getByText('62%')).toBeInTheDocument();
    expect(screen.getByText('34%')).toBeInTheDocument();
  });

  it('renders the "Where we are" section label', () => {
    render(<InvestorWhereWeAre areas={mockAreas} tasksPerArea={noTasks} />);
    expect(screen.getByText(/where we are/i)).toBeInTheDocument();
  });

  it('does NOT render the overall progress ring (lives in KPI strip now)', () => {
    render(<InvestorWhereWeAre areas={mockAreas} tasksPerArea={noTasks} />);
    // Overall progress would render as "48%" — the per-area rows should not
    // include that value as a separate display.
    expect(screen.queryByText('48%')).toBeNull();
  });

  it('renders an investor-only empty state when areas list is empty', () => {
    render(<InvestorWhereWeAre areas={[]} tasksPerArea={noTasks} />);
    expect(screen.getByText(/progress areas will appear here/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /add one in studio/i })).not.toBeInTheDocument();
  });
});
