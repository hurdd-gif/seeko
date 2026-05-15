import { render, screen } from '@testing-library/react';
import { QuickNotesRow } from '../QuickNotesRow';

const notes = [
  { id: 'n1', body: 'Mockup feedback for coding HUD', created_at: '2026-05-14T08:00:00Z' },
  { id: 'n2', body: 'Email Olla about residency', created_at: '2026-05-13T08:00:00Z' },
] as any;

describe('QuickNotesRow', () => {
  it('renders eyebrow + note tiles', () => {
    render(<QuickNotesRow notes={notes} />);
    expect(screen.getByText('Quick notes')).toBeInTheDocument();
    expect(screen.getByText(/Mockup feedback/)).toBeInTheDocument();
  });
});
