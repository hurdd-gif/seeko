import { render, screen } from '@testing-library/react';
import { NextMilestonePanel } from '../NextMilestonePanel';

const areas = [
  { id: 'a1', name: 'Coding', phase: 'build', progress: 60, status: 'active', deadline: '2026-06-01' },
  { id: 'a2', name: 'Visual', phase: 'build', progress: 30, status: 'active', deadline: '2026-06-15' },
] as any;

describe('NextMilestonePanel', () => {
  it('renders eyebrow + phase + milestone rows', () => {
    render(<NextMilestonePanel areas={areas} />);
    expect(screen.getByText('Next milestone')).toBeInTheDocument();
    expect(screen.getByText(/build/i)).toBeInTheDocument();
    expect(screen.getByText('Coding')).toBeInTheDocument();
  });
});
