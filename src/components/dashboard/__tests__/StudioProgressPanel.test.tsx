import { render, screen } from '@testing-library/react';
import { StudioProgressPanel } from '../StudioProgressPanel';

const areas = [
  { id: 'a1', name: 'Coding', progress: 72, status: 'active' },
  { id: 'a2', name: 'Visual', progress: 44, status: 'active' },
] as any;

describe('StudioProgressPanel', () => {
  it('renders eyebrow + area rows with progress', () => {
    render(<StudioProgressPanel areas={areas} />);
    expect(screen.getByText('Studio progress')).toBeInTheDocument();
    expect(screen.getAllByText('Coding').length).toBeGreaterThan(0);
    expect(screen.getByText('72%')).toBeInTheDocument();
  });
});
