import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTasksRoutes } from '../tasks';

const mocks = vi.hoisted(() => ({ getServiceClient: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: mocks.getServiceClient,
  getServiceClientAs: mocks.getServiceClient,
}));

// Real lowercase uuids, because the canonical-ordering rule IS a uuid comparison:
// TASK_A < TASK_B < TASK_C lexicographically, exactly as Postgres would order them.
const TASK_A = '11111111-1111-4111-8111-111111111111';
const TASK_B = '22222222-2222-4222-8222-222222222222';
const TASK_C = '33333333-3333-4333-8333-333333333333';
const MISSING = '99999999-9999-4999-8999-999999999999';

type TaskRow = { id: string; task_number: number | null; name: string; status: string };
type LinkRow = { task_a: string; task_b: string; created_by: string | null };

const TASKS: TaskRow[] = [
  { id: TASK_A, task_number: 1, name: 'Alpha', status: 'Todo' },
  { id: TASK_B, task_number: 2, name: 'Bravo', status: 'In Progress' },
  { id: TASK_C, task_number: 3, name: 'Charlie', status: 'Done' },
];

/**
 * Models public.task_links faithfully enough to catch the bug that matters: it
 * stores rows EXACTLY as written and enforces both the CHECK (task_a < task_b)
 * and the (task_a, task_b) primary key. So a handler that forgets to sort the
 * pair fails here the same way it would fail against Postgres — the insert trips
 * the check, and the delete silently matches nothing.
 */
function makeService(seed: [string, string][] = []) {
  const links: LinkRow[] = seed.map(([task_a, task_b]) => ({ task_a, task_b, created_by: 'seed' }));
  const task = (id: string) => TASKS.find((t) => t.id === id) ?? null;

  const service = {
    from: vi.fn((table: string) => {
      if (table === 'tasks') {
        return {
          select: () => ({
            in: async (_col: string, ids: string[]) => ({
              data: TASKS.filter((t) => ids.includes(t.id)).map((t) => ({ id: t.id })),
              error: null,
            }),
          }),
        };
      }

      if (table === 'task_links') {
        return {
          // fetchTaskLinks: .select(<embeds>).or('task_a.eq.<id>,task_b.eq.<id>')
          select: () => ({
            or: async (filter: string) => {
              const id = filter.split(',')[0].replace('task_a.eq.', '');
              return {
                data: links
                  .filter((row) => row.task_a === id || row.task_b === id)
                  .map((row) => ({ task_a: task(row.task_a), task_b: task(row.task_b) })),
                error: null,
              };
            },
          }),
          upsert: async (
            values: LinkRow,
            options?: { onConflict?: string; ignoreDuplicates?: boolean },
          ) => {
            if (!(values.task_a < values.task_b)) {
              return { error: { message: 'violates check constraint "task_links_canonical_order"' } };
            }
            const exists = links.some(
              (row) => row.task_a === values.task_a && row.task_b === values.task_b,
            );
            if (exists) {
              return options?.ignoreDuplicates
                ? { error: null }
                : { error: { message: 'duplicate key value violates unique constraint' } };
            }
            links.push(values);
            return { error: null };
          },
          delete: () => {
            const filters: [string, string][] = [];
            const chain = {
              eq: (column: string, value: string) => {
                filters.push([column, value]);
                if (filters.length < 2) return chain;
                // Both PK columns bound — this is the terminal, awaited call.
                return Promise.resolve(
                  (() => {
                    for (let i = links.length - 1; i >= 0; i -= 1) {
                      const row = links[i] as unknown as Record<string, string>;
                      if (filters.every(([col, val]) => row[col] === val)) links.splice(i, 1);
                    }
                    return { error: null };
                  })(),
                );
              },
            };
            return chain as unknown as { eq: (c: string, v: string) => typeof chain };
          },
        };
      }

      return {};
    }),
  };

  return { service, links };
}

function app(userId: string | null = 'user-1') {
  return new Hono().route(
    '/api',
    createTasksRoutes({
      authResolver: async () => (userId ? { id: userId, email: 'member@example.invalid' } : null),
    }),
  );
}

function link(taskId: string, linkedTaskId: unknown) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ linkedTaskId }),
  };
}

describe('POST /tasks/:taskId/links', () => {
  beforeEach(() => mocks.getServiceClient.mockReset());

  it('401s an unauthenticated caller', async () => {
    mocks.getServiceClient.mockReturnValue(makeService().service);
    const res = await app(null).request(`/api/tasks/${TASK_A}/links`, link(TASK_A, TASK_B));
    expect(res.status).toBe(401);
  });

  it('lets a NON-ADMIN link (this is not an admin-gated route)', async () => {
    const { service, links } = makeService();
    mocks.getServiceClient.mockReturnValue(service);

    const res = await app('contractor-1').request(`/api/tasks/${TASK_A}/links`, link(TASK_A, TASK_B));

    expect(res.status).toBe(200);
    expect(links).toHaveLength(1);
    expect(links[0].created_by).toBe('contractor-1');
  });

  it('400s a self-link', async () => {
    mocks.getServiceClient.mockReturnValue(makeService().service);
    const res = await app().request(`/api/tasks/${TASK_A}/links`, link(TASK_A, TASK_A));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'cannot_link_to_self' });
  });

  it('400s a missing or non-string linkedTaskId', async () => {
    mocks.getServiceClient.mockReturnValue(makeService().service);
    const res = await app().request(`/api/tasks/${TASK_A}/links`, link(TASK_A, undefined));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_body' });
  });

  it('404s when the other task does not exist', async () => {
    mocks.getServiceClient.mockReturnValue(makeService().service);
    const res = await app().request(`/api/tasks/${TASK_A}/links`, link(TASK_A, MISSING));
    expect(res.status).toBe(404);
  });

  it('returns the full link list after the write', async () => {
    const { service } = makeService([[TASK_A, TASK_C]]);
    mocks.getServiceClient.mockReturnValue(service);

    const res = await app().request(`/api/tasks/${TASK_A}/links`, link(TASK_A, TASK_B));

    expect(res.status).toBe(200);
    const { links } = (await res.json()) as { links: { id: string; task_number: number }[] };
    // Both links, newest-first by task_number, each resolved to the OTHER task.
    expect(links.map((l) => l.id)).toEqual([TASK_C, TASK_B]);
    expect(links[0]).toEqual({ id: TASK_C, task_number: 3, name: 'Charlie', status: 'Done' });
  });

  it('is idempotent — double-linking the same pair does not 500 on the PK conflict', async () => {
    const { service, links } = makeService();
    mocks.getServiceClient.mockReturnValue(service);

    const first = await app().request(`/api/tasks/${TASK_A}/links`, link(TASK_A, TASK_B));
    const second = await app().request(`/api/tasks/${TASK_A}/links`, link(TASK_A, TASK_B));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(links).toHaveLength(1);
    const body = (await second.json()) as { links: { id: string }[] };
    expect(body.links.map((l) => l.id)).toEqual([TASK_B]);
  });

  it('is idempotent from the OTHER side too — (B,A) is the same pair as (A,B)', async () => {
    const { service, links } = makeService();
    mocks.getServiceClient.mockReturnValue(service);

    await app().request(`/api/tasks/${TASK_A}/links`, link(TASK_A, TASK_B));
    const mirrored = await app().request(`/api/tasks/${TASK_B}/links`, link(TASK_B, TASK_A));

    expect(mirrored.status).toBe(200);
    expect(links).toHaveLength(1);
  });

  it('stores the pair canonically (smaller uuid in task_a) even when linked from the high side', async () => {
    const { service, links } = makeService();
    mocks.getServiceClient.mockReturnValue(service);

    // Link initiated FROM TASK_B (the larger uuid) TO TASK_A.
    const res = await app().request(`/api/tasks/${TASK_B}/links`, link(TASK_B, TASK_A));

    expect(res.status).toBe(200);
    expect(links[0]).toMatchObject({ task_a: TASK_A, task_b: TASK_B });
  });

  it('reads symmetrically — the link is visible from both tasks', async () => {
    const { service } = makeService([[TASK_A, TASK_B]]);
    mocks.getServiceClient.mockReturnValue(service);

    const fromA = await app().request(`/api/tasks/${TASK_A}/links`, link(TASK_A, TASK_C));
    const fromB = await app().request(`/api/tasks/${TASK_B}/links`, link(TASK_B, TASK_C));

    const bodyA = (await fromA.json()) as { links: { id: string }[] };
    const bodyB = (await fromB.json()) as { links: { id: string }[] };
    expect(bodyA.links.map((l) => l.id).sort()).toEqual([TASK_B, TASK_C].sort());
    expect(bodyB.links.map((l) => l.id).sort()).toEqual([TASK_A, TASK_C].sort());
  });
});

describe('DELETE /tasks/:taskId/links/:linkedId', () => {
  beforeEach(() => mocks.getServiceClient.mockReset());

  it('401s an unauthenticated caller', async () => {
    mocks.getServiceClient.mockReturnValue(makeService([[TASK_A, TASK_B]]).service);
    const res = await app(null).request(`/api/tasks/${TASK_A}/links/${TASK_B}`, { method: 'DELETE' });
    expect(res.status).toBe(401);
  });

  it('400s an attempt to unlink a task from itself', async () => {
    mocks.getServiceClient.mockReturnValue(makeService().service);
    const res = await app().request(`/api/tasks/${TASK_A}/links/${TASK_A}`, { method: 'DELETE' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'cannot_link_to_self' });
  });

  it('unlinks from the LOW side of the pair', async () => {
    const { service, links } = makeService([[TASK_A, TASK_B]]);
    mocks.getServiceClient.mockReturnValue(service);

    const res = await app().request(`/api/tasks/${TASK_A}/links/${TASK_B}`, { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(links).toHaveLength(0);
    expect(await res.json()).toEqual({ links: [] });
  });

  // THE canonical-ordering regression test. Without the sort in the handler, this
  // DELETE would issue `task_a = TASK_B and task_b = TASK_A`, match zero rows, and
  // report success while the link stubbornly remained.
  it('unlinks from the HIGH side of the pair too — order of creation is irrelevant', async () => {
    const { service, links } = makeService([[TASK_A, TASK_B]]);
    mocks.getServiceClient.mockReturnValue(service);

    const res = await app().request(`/api/tasks/${TASK_B}/links/${TASK_A}`, { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(links).toHaveLength(0);
    expect(await res.json()).toEqual({ links: [] });
  });

  it('unlinks a pair that was CREATED from the high side', async () => {
    const { service, links } = makeService();
    mocks.getServiceClient.mockReturnValue(service);

    await app().request(`/api/tasks/${TASK_B}/links`, link(TASK_B, TASK_A));
    expect(links).toHaveLength(1);

    const res = await app().request(`/api/tasks/${TASK_A}/links/${TASK_B}`, { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(links).toHaveLength(0);
  });

  it('leaves the task\'s other links intact and returns them', async () => {
    const { service, links } = makeService([[TASK_A, TASK_B], [TASK_A, TASK_C]]);
    mocks.getServiceClient.mockReturnValue(service);

    const res = await app().request(`/api/tasks/${TASK_A}/links/${TASK_B}`, { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(links).toHaveLength(1);
    const body = (await res.json()) as { links: { id: string }[] };
    expect(body.links.map((l) => l.id)).toEqual([TASK_C]);
  });

  it('404s an unknown task id', async () => {
    mocks.getServiceClient.mockReturnValue(makeService().service);
    const res = await app().request(`/api/tasks/${TASK_A}/links/${MISSING}`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('lets a NON-ADMIN unlink', async () => {
    const { service, links } = makeService([[TASK_A, TASK_B]]);
    mocks.getServiceClient.mockReturnValue(service);

    const res = await app('contractor-2').request(`/api/tasks/${TASK_A}/links/${TASK_B}`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    expect(links).toHaveLength(0);
  });
});
