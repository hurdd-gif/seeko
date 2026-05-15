import { render, screen } from '@testing-library/react';
import { AreaTileRow } from '../AreaTileRow';

const areas = [
  { id: 'a1', name: 'Coding', progress: 72, status: 'active' },
  { id: 'a2', name: 'Visual Art', progress: 44, status: 'active' },
] as any;

describe('AreaTileRow', () => {
  it('renders eyebrow + area tiles', () => {
    render(<AreaTileRow areas={areas} />);
    expect(screen.getByText('Game areas')).toBeInTheDocument();
    expect(screen.getByText('Coding')).toBeInTheDocument();
    expect(screen.getByText('Visual Art')).toBeInTheDocument();
  });
});
