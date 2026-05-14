import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RailStudioProgress } from '../RailStudioProgress';
import type { Area } from '@/lib/types';

const a = (over: Partial<Area>): Area => ({
  id: 'x', name: 'X', status: 'Active', progress: 0, phase: 'Beta', ...over,
});

describe('RailStudioProgress', () => {
  it('shows avg progress and active count', () => {
    render(<RailStudioProgress areas={[a({ progress: 40 }), a({ id: 'y', progress: 60 })]} />);
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText(/2 active areas/i)).toBeInTheDocument();
  });

  it('rounds the average', () => {
    render(<RailStudioProgress areas={[a({ progress: 33 }), a({ id: 'y', progress: 34 })]} />);
    expect(screen.getByText('34%')).toBeInTheDocument();
  });

  it('only counts Active areas in the subline', () => {
    render(<RailStudioProgress areas={[a({ progress: 40 }), a({ id: 'y', progress: 60, status: 'Planned' })]} />);
    expect(screen.getByText(/1 active area/i)).toBeInTheDocument();
  });

  it('shows empty state when no areas', () => {
    render(<RailStudioProgress areas={[]} />);
    expect(screen.getByText(/No active areas/i)).toBeInTheDocument();
  });
});
