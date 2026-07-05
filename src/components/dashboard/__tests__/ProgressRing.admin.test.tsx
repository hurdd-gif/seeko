import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProgressRing } from '../ProgressRing';
import type { Area } from '@/lib/types';

// Admin path mounts StudioProgressEditor, which calls useRouter().refresh().
vi.mock('@/lib/react-router-adapters', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  ) as unknown as typeof fetch;
});

const health = [
  { id: 'a1', name: 'Main Game', health: 'on_track' as const },
  { id: 'a2', name: 'Fighting Club', health: 'on_track' as const },
];
const editable: Area[] = [
  { id: 'a1', name: 'Main Game', status: 'Active', progress: 60, phase: 'Beta' },
  { id: 'a2', name: 'Fighting Club', status: 'Planned', progress: 0, phase: 'Alpha' },
];

describe('ProgressRing — admin edit affordance', () => {
  it('stays a pure stat (role=img, no button) when not admin', () => {
    render(<ProgressRing overall={30} areas={health} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('img', { name: /30%/ })).toBeInTheDocument();
  });

  it('exposes an "Edit studio progress" button (not a bare img) when admin', () => {
    render(<ProgressRing overall={30} areas={health} isAdmin editableAreas={editable} />);
    expect(
      screen.getByRole('button', { name: /edit studio progress/i }),
    ).toBeInTheDocument();
  });

  it('opens the Studio progress editor when an admin activates the ring', async () => {
    render(<ProgressRing overall={30} areas={health} isAdmin editableAreas={editable} />);
    expect(screen.queryByText('Studio progress')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /edit studio progress/i }));
    await waitFor(() => expect(screen.getByText('Studio progress')).toBeInTheDocument());
  });
});
