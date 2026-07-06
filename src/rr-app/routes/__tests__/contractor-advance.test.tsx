import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContractorStepDeliverable } from '@/lib/contractor-steps';
import { ContractorRouteContent } from '../contractor';

const NOW = new Date('2026-07-05T09:00:00');

const deliverable: ContractorStepDeliverable = {
  id: 'task-1',
  name: 'Combat HUD',
  department: 'Animation',
  status: 'In Progress',
  priority: 'High',
  deadline: '2026-07-25',
  progress: 20,
  description: null,
  steps: [{ id: 's1', name: 'HUD integration', deadline: '2026-07-25', state: 'pending', sort_order: 0 }],
};

afterEach(() => vi.restoreAllMocks());

describe('ContractorRouteContent advance wiring', () => {
  it('PATCHes the advance route when the focal step is submitted', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <ContractorRouteContent
          now={NOW}
          data={{
            status: 'ready',
            index: {
              profile: { id: 'u1', displayName: 'Dana', email: null, avatarUrl: null, isAdmin: false, isContractor: true },
              deliverables: [deliverable],
            },
          }}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /submit hud integration for review/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/tasks/task-1/steps/s1', expect.objectContaining({ method: 'PATCH' })),
    );
  });
});
