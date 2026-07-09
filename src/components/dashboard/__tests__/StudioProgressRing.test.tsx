import { render, screen } from '@testing-library/react';
import { StudioProgressRing } from '../StudioProgressRing';

const areas = [
  { id: 'a1', name: 'Main Game', phase: 'Alpha', progress: 60, status: 'Active', target_date: '2026-08-15' },
  { id: 'a2', name: 'Fighting Club', phase: 'Beta', progress: 0, status: 'Planned', target_date: '2026-11-01' },
] as any;

// Same phase→milestone health relay as StudioOverviewPanel: Main Game (Alpha) →
// ALPHA milestones (on_track + at_risk → At risk, worst-of); Fighting Club
// (Beta) → BETA (off_track → Off track).
const milestones = [
  { id: 'm1', name: 'ALPHA', sort_order: 0, created_at: '2026-01-01', health: 'on_track' },
  { id: 'm2', name: 'alpha', sort_order: 1, created_at: '2026-01-01', health: 'at_risk' },
  { id: 'm3', name: 'Beta', sort_order: 0, created_at: '2026-01-01', health: 'off_track' },
] as any;

describe('StudioProgressRing', () => {
  it('renders the rolled-up overall percent (mean of 60 and 0)', () => {
    render(<StudioProgressRing areas={areas} milestones={milestones} />);
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByText('Overall')).toBeInTheDocument();
  });

  it('relays each area worst-of milestone health into the hover detail', () => {
    render(<StudioProgressRing areas={areas} milestones={milestones} />);
    expect(screen.getByText('Main Game')).toBeInTheDocument();
    expect(screen.getByText('Fighting Club')).toBeInTheDocument();
    expect(screen.getByText('At risk')).toBeInTheDocument();
    expect(screen.getByText('Off track')).toBeInTheDocument();
  });

  it('renders a 0% ring for an empty studio without crashing', () => {
    render(<StudioProgressRing areas={[]} milestones={[]} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('Overall')).toBeInTheDocument();
  });

  it('is non-interactive — no Open-studio link', () => {
    render(<StudioProgressRing areas={areas} milestones={milestones} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText(/Open studio/)).toBeNull();
  });
});
