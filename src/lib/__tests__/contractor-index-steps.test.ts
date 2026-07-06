import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getServiceClient: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({ getServiceClient: mocks.getServiceClient }));

import { loadContractorOverview } from '../contractor-index';

const PROFILE = {
  id: 'user-1',
  display_name: 'Dana',
  email: 'dana@example.invalid',
  avatar_url: null,
  is_admin: false,
  is_contractor: true,
};

const TASKS = [
  { id: 'task-1', name: 'Main menu', department: 'UI/UX', status: 'In Progress', priority: 'High', deadline: '2026-07-18', progress: 40, description: null },
];

const STEPS = [
  { id: 's2', task_id: 'task-1', name: 'High-fi', deadline: '2026-07-18', state: 'pending', sort_order: 1 },
  { id: 's1', task_id: 'task-1', name: 'Low-fi', deadline: '2026-06-30', state: 'done', sort_order: 0 },
];

function serviceMock() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: PROFILE, error: null }) }) }) };
      }
      if (table === 'tasks') {
        const q: Record<string, unknown> = {};
        q.select = () => q;
        q.eq = () => q;
        q.order = () => q;
        q.overrideTypes = async () => ({ data: TASKS, error: null });
        return q;
      }
      if (table === 'task_steps') {
        return { select: () => ({ in: () => ({ order: async () => ({ data: STEPS, error: null }) }) }) };
      }
      if (table === 'deadline_extensions') return { select: () => ({ in: () => ({ order: async () => ({ data: [], error: null }) }) }) };
      return {};
    }),
  };
}

describe('loadContractorOverview with steps', () => {
  beforeEach(() => mocks.getServiceClient.mockReturnValue(serviceMock()));

  it('attaches each task its steps, ordered by sort_order', async () => {
    const data = await loadContractorOverview({ id: 'user-1' });
    expect(data.deliverables).toHaveLength(1);
    expect(data.deliverables[0].steps.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(data.deliverables[0].steps[0]).toEqual({
      id: 's1',
      name: 'Low-fi',
      deadline: '2026-06-30',
      state: 'done',
      sort_order: 0,
    });
  });

  it('returns an empty steps array for a task with no steps', async () => {
    mocks.getServiceClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'profiles') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: PROFILE, error: null }) }) }) };
        if (table === 'tasks') {
          const q: Record<string, unknown> = {};
          q.select = () => q; q.eq = () => q; q.order = () => q;
          q.overrideTypes = async () => ({ data: TASKS, error: null });
          return q;
        }
        if (table === 'task_steps') return { select: () => ({ in: () => ({ order: async () => ({ data: [], error: null }) }) }) };
        if (table === 'deadline_extensions') return { select: () => ({ in: () => ({ order: async () => ({ data: [], error: null }) }) }) };
        return {};
      }),
    });
    const data = await loadContractorOverview({ id: 'user-1' });
    expect(data.deliverables[0].steps).toEqual([]);
  });
});

describe('loadContractorOverview with extensions', () => {
  function mockWithExtensions(extRows: Array<Record<string, unknown>>) {
    return {
      from: vi.fn((table: string) => {
        if (table === 'profiles') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: PROFILE, error: null }) }) }) };
        if (table === 'tasks') {
          const q: Record<string, unknown> = {};
          q.select = () => q; q.eq = () => q; q.order = () => q;
          q.overrideTypes = async () => ({ data: TASKS, error: null });
          return q;
        }
        if (table === 'task_steps') return { select: () => ({ in: () => ({ order: async () => ({ data: [], error: null }) }) }) };
        if (table === 'deadline_extensions') return { select: () => ({ in: () => ({ order: async () => ({ data: extRows, error: null }) }) }) };
        return {};
      }),
    };
  }

  it('attaches the newest extension row per task as latestExtension', async () => {
    // Ordered newest-first by the query; loader takes the first row per task_id.
    mocks.getServiceClient.mockReturnValue(mockWithExtensions([
      { id: 'ext-2', task_id: 'task-1', status: 'denied', requested_deadline: '2026-07-30', reason: 'crunch', denial_reason: 'too far', created_at: '2026-07-02T00:00:00Z' },
      { id: 'ext-1', task_id: 'task-1', status: 'approved', requested_deadline: '2026-07-22', reason: null, denial_reason: null, created_at: '2026-07-01T00:00:00Z' },
    ]));
    const data = await loadContractorOverview({ id: 'user-1' });
    expect(data.deliverables[0].latestExtension).toEqual({
      id: 'ext-2', status: 'denied', requested_deadline: '2026-07-30', reason: 'crunch', denial_reason: 'too far',
    });
  });

  it('sets latestExtension to null when a task has no extension rows', async () => {
    mocks.getServiceClient.mockReturnValue(mockWithExtensions([]));
    const data = await loadContractorOverview({ id: 'user-1' });
    expect(data.deliverables[0].latestExtension).toBeNull();
  });
});
