import { render, screen } from '@testing-library/react';
import { ProgressRing } from '../ProgressRing';

const areas = [
  { id: 'a1', name: 'Main Game', health: 'at_risk' as const },
  { id: 'a2', name: 'Fighting Club', health: 'off_track' as const },
];

describe('ProgressRing', () => {
  it('renders the overall percent and the "Overall" label as the ring center', () => {
    render(<ProgressRing overall={30} areas={areas} />);
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByText('Overall')).toBeInTheDocument();
  });

  it('clamps an out-of-range percent for display (never shows >100% or <0%)', () => {
    const { rerender } = render(<ProgressRing overall={130} areas={areas} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
    rerender(<ProgressRing overall={-5} areas={areas} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('is a pure stat — exposes no link or button (Overview drops the Open-studio CTA)', () => {
    render(<ProgressRing overall={30} areas={areas} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/Open studio/)).toBeNull();
  });

  it('carries an accessible label describing the progress on the ring graphic', () => {
    render(<ProgressRing overall={30} areas={areas} />);
    expect(screen.getByRole('img', { name: /30%/ })).toBeInTheDocument();
  });

  it('lists per-area health (revealed on hover/focus) with the health badge labels', () => {
    render(<ProgressRing overall={30} areas={areas} />);
    // Tooltip content stays in the DOM (described-by target) but is visually
    // hidden until hover/focus — the per-area health is no longer always-visible.
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByText('Main Game')).toBeInTheDocument();
    expect(screen.getByText('Fighting Club')).toBeInTheDocument();
    expect(screen.getByText('At risk')).toBeInTheDocument();
    expect(screen.getByText('Off track')).toBeInTheDocument();
  });
});
