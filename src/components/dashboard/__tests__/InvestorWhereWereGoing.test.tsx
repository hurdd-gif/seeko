import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InvestorWhereWereGoing } from '../InvestorWhereWereGoing';

const tasksPerArea = { a1: { complete: 8, total: 12 }, a2: { complete: 2, total: 5 } };

describe('InvestorWhereWereGoing', () => {
  it('renders three phase headers (Alpha, Beta, Launch)', () => {
    render(<InvestorWhereWereGoing areas={[]} tasksPerArea={tasksPerArea} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Launch')).toBeInTheDocument();
  });

  it('pins area cards to their phase column', () => {
    render(<InvestorWhereWereGoing
      areas={[
        { id: 'a1', name: 'Main Game', status: 'Active', progress: 60, phase: 'Beta', target_date: '2026-06-15' },
        { id: 'a2', name: 'Fighting Club', status: 'Active', progress: 30, phase: 'Alpha', target_date: '2026-08-01' },
      ]}
      tasksPerArea={tasksPerArea}
    />);
    expect(screen.getByText('Main Game').closest('[data-phase]')?.getAttribute('data-phase')).toBe('Beta');
    expect(screen.getByText('Fighting Club').closest('[data-phase]')?.getAttribute('data-phase')).toBe('Alpha');
  });

  it('pins the soonest-date marker to the correct phase column', () => {
    render(<InvestorWhereWereGoing
      areas={[
        { id: 'a1', name: 'A', status: 'Active', progress: 0, phase: 'Beta', target_date: '2026-09-01' },
        { id: 'a2', name: 'B', status: 'Active', progress: 0, phase: 'Alpha', target_date: '2026-06-01' },
      ]}
      tasksPerArea={tasksPerArea}
    />);
    const marker = screen.getByTestId('timeline-marker');
    expect(marker.getAttribute('data-marker-phase')).toBe('Alpha');
  });

  it('renders no marker when all target_dates are null', () => {
    render(<InvestorWhereWereGoing
      areas={[
        { id: 'a1', name: 'A', status: 'Active', progress: 0, phase: 'Alpha' },
        { id: 'a2', name: 'B', status: 'Active', progress: 0, phase: 'Beta' },
      ]}
      tasksPerArea={tasksPerArea}
    />);
    expect(screen.queryByTestId('timeline-marker')).toBeNull();
    expect(screen.getByText(/no ship dates set/i)).toBeInTheDocument();
  });

  it('renders the "Where we\'re going" section label', () => {
    render(<InvestorWhereWereGoing areas={[]} tasksPerArea={tasksPerArea} />);
    expect(screen.getByText(/where we're going/i)).toBeInTheDocument();
  });

  it('does NOT render the "Next ship in X months" header (lives in KPI strip now)', () => {
    render(<InvestorWhereWereGoing
      areas={[
        { id: 'a1', name: 'Main Game', status: 'Active', progress: 60, phase: 'Beta', target_date: '2026-06-15' },
      ]}
      tasksPerArea={tasksPerArea}
    />);
    expect(screen.queryByText(/next ship:/i)).toBeNull();
  });

  it('renders a connector stroke across all three headers', () => {
    render(<InvestorWhereWereGoing areas={[]} tasksPerArea={tasksPerArea} />);
    expect(screen.getByTestId('phase-connector')).toBeInTheDocument();
  });
});
