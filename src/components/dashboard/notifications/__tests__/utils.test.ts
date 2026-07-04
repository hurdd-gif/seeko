import { describe, it, expect } from 'vitest';
import { groupNotificationsFlat } from '../utils';
import type { Notification } from '@/lib/types';

function makeNotif(
  overrides: Partial<Notification> & { id: string; created_at: string },
): Notification {
  return {
    user_id: 'u1',
    kind: 'comment_reply',
    title: 'Reply on your task',
    read: false,
    ...overrides,
  } as Notification;
}

describe('groupNotificationsFlat', () => {
  it('keeps same-kind same-title same-day items as separate flat rows (no collapse)', () => {
    const today = new Date();
    today.setHours(9, 0, 0, 0);
    const iso = today.toISOString();
    const items: Notification[] = [
      makeNotif({ id: 'a', created_at: iso }),
      makeNotif({ id: 'b', created_at: iso }),
      makeNotif({ id: 'c', created_at: iso }),
    ];

    const result = groupNotificationsFlat(items);

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Today');
    expect(result[0].items).toHaveLength(3);
    expect(result[0].items.every((n) => n.count === 1)).toBe(true);
    expect(result[0].items.every((n) => n.children === undefined)).toBe(true);
    expect(result[0].items.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('buckets mixed days into Today/Yesterday/Earlier in fixed order, preserving input order within a group', () => {
    const now = new Date();
    const todayMorning = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0);
    const todayNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const items: Notification[] = [
      makeNotif({ id: 'old', created_at: lastWeek.toISOString() }),
      makeNotif({ id: 't1', created_at: todayMorning.toISOString() }),
      makeNotif({ id: 'y1', created_at: yesterday.toISOString() }),
      makeNotif({ id: 't2', created_at: todayNoon.toISOString() }),
    ];

    const result = groupNotificationsFlat(items);

    expect(result.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Earlier']);
    expect(result.find((g) => g.label === 'Today')!.items.map((n) => n.id)).toEqual(['t1', 't2']);
    expect(result.find((g) => g.label === 'Yesterday')!.items.map((n) => n.id)).toEqual(['y1']);
    expect(result.find((g) => g.label === 'Earlier')!.items.map((n) => n.id)).toEqual(['old']);
  });
});
