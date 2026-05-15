import { render, screen } from '@testing-library/react';
import { Clock } from 'lucide-react';
import { TileRow } from '../TileRow';
import { Tile } from '../Tile';

describe('TileRow', () => {
  it('renders eyebrow + tile children', () => {
    render(
      <TileRow icon={Clock} eyebrow="Recently visited">
        <Tile href="/x" title="A doc" subtitle="Mar 3" />
        <Tile href="/y" title="B doc" subtitle="Mar 4" />
      </TileRow>
    );
    expect(screen.getByText('Recently visited')).toBeInTheDocument();
    expect(screen.getByText('A doc')).toBeInTheDocument();
    expect(screen.getByText('B doc')).toBeInTheDocument();
  });
});
