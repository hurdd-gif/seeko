import { describe, expect, it } from 'vitest';
import { buildFeed, ekoCreatedEvent } from '../task-feed';
import type { TaskActivity, TaskComment } from '@/lib/types';

function event(id: string, created_at: string, extra: Partial<TaskActivity> = {}): TaskActivity {
  return {
    id,
    user_id: 'user-1',
    action: 'updated',
    target: 'task',
    created_at,
    ...extra,
  } as TaskActivity;
}

function comment(id: string, created_at: string): TaskComment {
  return {
    id,
    task_id: 'task-1',
    user_id: 'user-1',
    content: 'hello',
    created_at,
  } as TaskComment;
}

describe('buildFeed', () => {
  it('interleaves events and comments ascending by created_at', () => {
    // Activity arrives newest-first from the loader; comments oldest-first.
    const feed = buildFeed(
      [event('e2', '2026-07-03T00:00:00Z'), event('e1', '2026-07-01T00:00:00Z')],
      [comment('c1', '2026-07-02T00:00:00Z'), comment('c2', '2026-07-04T00:00:00Z')],
    );

    expect(
      feed.map((i) => (i.type === 'event' ? i.event.id : i.comment.id)),
    ).toEqual(['e1', 'c1', 'e2', 'c2']);
  });

  it('puts an event before a comment sharing the same timestamp', () => {
    const feed = buildFeed(
      [event('e1', '2026-07-01T00:00:00Z')],
      [comment('c1', '2026-07-01T00:00:00Z')],
    );

    expect(feed.map((i) => i.type)).toEqual(['event', 'comment']);
  });

  it('returns empty for no input', () => {
    expect(buildFeed([], [])).toEqual([]);
  });
});

describe('ekoCreatedEvent', () => {
  it('finds the created event when EKO authored it', () => {
    const created = event('e1', '2026-07-01T00:00:00Z', { kind: 'created', source: 'eko' });
    expect(ekoCreatedEvent([event('e2', '2026-07-02T00:00:00Z'), created])).toBe(created);
  });

  it('returns null for human-created tasks', () => {
    expect(
      ekoCreatedEvent([event('e1', '2026-07-01T00:00:00Z', { kind: 'created', source: 'human' })]),
    ).toBeNull();
  });

  it('ignores non-created EKO events', () => {
    expect(
      ekoCreatedEvent([
        event('e1', '2026-07-01T00:00:00Z', { kind: 'status_changed', source: 'eko' }),
      ]),
    ).toBeNull();
  });
});
