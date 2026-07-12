/* task-feed — pure interleave of activity events + comments into one
 * chronological thread (ascending, oldest first), matching Linear's
 * activity feed: event rows and comment cards share a single timeline. */

import type { TaskActivity, TaskComment } from '@/lib/types';

export type FeedItem =
  | { type: 'event'; created_at: string; event: TaskActivity }
  | { type: 'comment'; created_at: string; comment: TaskComment };

/**
 * Merge activity (arrives newest-first from the loader) and comments
 * (oldest-first) into one ascending timeline. Stable within equal
 * timestamps: events sort before comments so "created this task" leads
 * a comment posted in the same instant.
 */
export function buildFeed(activity: TaskActivity[], comments: TaskComment[]): FeedItem[] {
  const items: FeedItem[] = [
    ...activity.map((event) => ({ type: 'event' as const, created_at: event.created_at, event })),
    ...comments.map((comment) => ({
      type: 'comment' as const,
      created_at: comment.created_at,
      comment,
    })),
  ];
  return items.sort((a, b) => {
    const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (diff !== 0) return diff;
    if (a.type === b.type) return 0;
    return a.type === 'event' ? -1 : 1;
  });
}

/**
 * The provenance shown in the top sync banner: the task's `created` event
 * when EKO authored it. Returns null for human-created tasks (no banner).
 */
export function ekoCreatedEvent(activity: TaskActivity[]): TaskActivity | null {
  return (
    activity.find((a) => a.kind === 'created' && a.source === 'eko') ?? null
  );
}
