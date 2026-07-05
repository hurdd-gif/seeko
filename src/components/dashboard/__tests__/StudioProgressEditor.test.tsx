import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StudioProgressEditor } from '../StudioProgressEditor';
import type { Area } from '@/lib/types';

// The editor persists via PATCH /api/areas/[id] then router.refresh() — stub both.
const refresh = vi.fn();
vi.mock('@/lib/react-router-adapters', () => ({
  useRouter: () => ({ refresh }),
}));

const areas: Area[] = [
  { id: 'a1', name: 'Main Game', status: 'Active', progress: 60, phase: 'Beta', description: 'core loop', target_date: '2026-08-15' },
  { id: 'a2', name: 'Fighting Club', status: 'Planned', progress: 0, phase: 'Alpha', description: '', target_date: '' },
];

function okFetch() {
  return vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'a1' }) }),
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  refresh.mockClear();
  global.fetch = okFetch();
});

describe('StudioProgressEditor', () => {
  it('renders nothing when closed', () => {
    render(<StudioProgressEditor open={false} onOpenChange={() => {}} areas={areas} />);
    expect(screen.queryByText('Studio progress')).toBeNull();
  });

  it('renders one editor block per area, reflecting current progress', () => {
    render(<StudioProgressEditor open onOpenChange={() => {}} areas={areas} />);
    expect(screen.getByText('Studio progress')).toBeInTheDocument();
    expect(screen.getByText('Main Game')).toBeInTheDocument();
    expect(screen.getByText('Fighting Club')).toBeInTheDocument();
    expect((screen.getByLabelText('Progress for Main Game') as HTMLInputElement).value).toBe('60');
    expect((screen.getByLabelText('Progress for Fighting Club') as HTMLInputElement).value).toBe('0');
  });

  it('disables Save changes until a field is edited', () => {
    render(<StudioProgressEditor open onOpenChange={() => {}} areas={areas} />);
    const save = screen.getByRole('button', { name: /save changes/i });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Progress for Main Game'), { target: { value: '75' } });
    expect(save).toBeEnabled();
  });

  it('PATCHes only the changed area with a clamped progress, then refreshes + closes', async () => {
    const onOpenChange = vi.fn();
    render(<StudioProgressEditor open onOpenChange={onOpenChange} areas={areas} />);
    // Over-max value must be clamped to 100 in the request body.
    fireEvent.change(screen.getByLabelText('Progress for Main Game'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, opts] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/areas/a1');
    expect((opts as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((opts as RequestInit).body as string).progress).toBe(100);

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps the dialog open and surfaces an error when a save fails', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Forbidden' }) }),
    ) as unknown as typeof fetch;
    const onOpenChange = vi.fn();
    render(<StudioProgressEditor open onOpenChange={onOpenChange} areas={areas} />);
    fireEvent.change(screen.getByLabelText('Progress for Main Game'), { target: { value: '75' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(screen.getByText(/forbidden/i)).toBeInTheDocument());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(refresh).not.toHaveBeenCalled();
  });
});
