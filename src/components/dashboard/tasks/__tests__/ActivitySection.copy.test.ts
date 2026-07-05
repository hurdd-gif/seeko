import { describe, it, expect } from 'vitest';
import { renderCopy } from '../ActivitySection';
import type { TaskActivity } from '@/lib/types';

const base = (over: Partial<TaskActivity>): TaskActivity =>
  ({
    id: 'a1',
    task_id: 't1',
    action: '',
    target: '',
    kind: undefined,
    before_value: null,
    after_value: null,
    created_at: '2026-06-18T00:00:00Z',
    ...over,
  }) as TaskActivity;

// Mirrors the leaking row from the board screenshot.
const YOUNGAN = '7887ae1d-2b5a-42e8-8a30-96696eec3d99';
const resolve = (id: string): string | undefined =>
  ({ [YOUNGAN]: 'Youngan' } as Record<string, string>)[id];

describe('ActivitySection renderCopy — assignee name resolution', () => {
  it('resolves an assignee UUID to its display name', () => {
    const a = base({ kind: 'assignee_changed', after_value: YOUNGAN });
    expect(renderCopy(a, resolve)).toBe('assigned to Youngan');
  });

  it('never leaks a raw UUID when it cannot be resolved', () => {
    const uuid = '00000000-0000-4000-8000-000000000000';
    const copy = renderCopy(base({ kind: 'assignee_changed', after_value: uuid }), resolve);
    expect(copy).not.toContain(uuid);
    expect(copy).toBe('assigned to a teammate');
  });

  it('keeps a legacy human-readable assignee value as-is', () => {
    const a = base({ kind: 'assignee_changed', after_value: 'Sam Rivera' });
    expect(renderCopy(a, resolve)).toBe('assigned to Sam Rivera');
  });

  it('renders "unassigned" when there is no after value', () => {
    expect(renderCopy(base({ kind: 'assignee_changed', after_value: null }), resolve)).toBe(
      'unassigned',
    );
  });

  it('leaves non-assignee copy unchanged', () => {
    expect(renderCopy(base({ kind: 'created' }), resolve)).toBe('created this task');
    expect(
      renderCopy(
        base({ kind: 'status_changed', before_value: 'In Progress', after_value: 'Done' }),
        resolve,
      ),
    ).toBe('moved from In Progress to Done');
    expect(renderCopy(base({ action: 'Assigned task: Game Combat →', target: 'Youngan' }), resolve)).toBe(
      'Assigned task: Game Combat → Youngan',
    );
  });
});
