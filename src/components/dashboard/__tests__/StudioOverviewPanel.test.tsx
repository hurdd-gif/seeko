import { render, screen } from '@testing-library/react';
import { StudioOverviewPanel } from '../StudioOverviewPanel';

const areas = [
  {
    id: 'a1',
    name: 'Main Game',
    phase: 'Alpha',
    progress: 60,
    status: 'Active',
    target_date: '2026-08-15',
  },
  {
    id: 'a2',
    name: 'Fighting Club',
    phase: 'Beta',
    progress: 0,
    status: 'Planned',
    target_date: '2026-11-01',
  },
] as any;

// Milestones relayed from the issues tab. Areas aren't linked to milestones;
// they match by phase name. Main Game (phase Alpha) -> the ALPHA milestones
// (on_track + at_risk -> At risk, worst-of); Fighting Club (phase Beta) -> the
// single BETA milestone (off_track -> Off track). Casing differs on purpose to
// exercise the case-insensitive match.
const milestones = [
  { id: 'm1', name: 'ALPHA', sort_order: 0, created_at: '2026-01-01', health: 'on_track' },
  { id: 'm2', name: 'alpha', sort_order: 1, created_at: '2026-01-01', health: 'at_risk' },
  { id: 'm3', name: 'Beta', sort_order: 0, created_at: '2026-01-01', health: 'off_track' },
] as any;

describe('StudioOverviewPanel', () => {
  it('shows a single rollup headline and one action, without the areas-tracked line', () => {
    render(<StudioOverviewPanel areas={areas} milestones={milestones} />);

    expect(screen.getAllByText('Progress')).toHaveLength(1);

    // focal metric = mean of 60 and 0, promoted as a single headline node
    expect(screen.getByText('30% Overall')).toBeInTheDocument();

    // the redesign drops the "N areas tracked" secondary line entirely
    expect(screen.queryByText(/areas tracked/)).not.toBeInTheDocument();

    expect(screen.getAllByText(/Open studio/)).toHaveLength(1);
  });

  it('relays each area worst-of milestone health from the issues tab, with the badge label', () => {
    render(<StudioOverviewPanel areas={areas} milestones={milestones} />);

    expect(screen.getByText('Main Game')).toBeInTheDocument();
    expect(screen.getByText('Fighting Club')).toBeInTheDocument();

    // a1 = on_track + at_risk -> At risk; a2 = off_track -> Off track
    expect(screen.getByText('At risk')).toBeInTheDocument();
    expect(screen.getByText('Off track')).toBeInTheDocument();
  });

  it('no longer surfaces phase labels or gate dates (replaced by health relay)', () => {
    render(<StudioOverviewPanel areas={areas} milestones={milestones} />);

    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    expect(screen.queryByText('Planned')).not.toBeInTheDocument();
    expect(screen.queryByText(/Aug 15/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nov 1/)).not.toBeInTheDocument();
  });

  it('renders no health badge when an area has no milestone health signal', () => {
    render(<StudioOverviewPanel areas={areas} milestones={[]} />);
    expect(screen.getByText('Main Game')).toBeInTheDocument();
    expect(screen.queryByText('On track')).not.toBeInTheDocument();
    expect(screen.queryByText('At risk')).not.toBeInTheDocument();
    expect(screen.queryByText('Off track')).not.toBeInTheDocument();
  });

  it('does not duplicate the per-area completion percentages owned by Game areas', () => {
    render(<StudioOverviewPanel areas={areas} milestones={milestones} />);
    expect(screen.queryByText('60%')).not.toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('renders an empty state when there are no areas', () => {
    render(<StudioOverviewPanel areas={[]} milestones={[]} />);
    expect(screen.getByText('Progress')).toBeInTheDocument();
    expect(screen.getByText(/No areas tracked yet/)).toBeInTheDocument();
  });
});
