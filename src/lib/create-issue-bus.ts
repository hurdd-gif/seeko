/**
 * Create-issue bus — lets the global "Create" pill in the header open the
 * board's CreateTaskComposer, across a subtree it cannot reach by props.
 *
 * WHY A BUS AND NOT A SECOND COMPOSER. The composer needs `team`, `areas`, and
 * an `onCreated` that inserts the new task into the board's local state so the
 * card appears without a round trip. TasksBoard has all three; StudioHeaderActions
 * (which renders inside LightShell's account cluster, on every page) has none of
 * them. Mounting a second composer in the header would mean a second data fetch
 * and a create path that can't optimistically update the board behind it — two
 * composers that behave differently depending on which button you pressed. So
 * the header doesn't own a composer; it asks for one.
 *
 * THE MAILBOX. The header pill also renders on /docs and /activity, where no
 * board is listening. Rather than disable it there, an undelivered request is
 * PARKED and the caller navigates to /issues; the board claims the parked
 * request when it mounts. Same one-slot + TTL shape as the EKO spotlight
 * mailbox (see eko-bus.ts) — a never-claimed request must not fire on some
 * unrelated later visit to the board.
 */

import type { TaskStatus } from '@/lib/types';

export type CreateIssueRequest = {
  /** Pre-select the column the issue lands in (per-column "+" affordance). */
  status?: TaskStatus;
};

type Listener = (request: CreateIssueRequest) => void;

const listeners = new Set<Listener>();

const PENDING_TTL_MS = 15_000;

let pending: { request: CreateIssueRequest; expiresAt: number } | null = null;

/** Subscribe to composer requests. Returns an unsubscribe function. */
export function subscribeCreateIssue(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Producer entry point. Returns `true` when a live consumer (a mounted board)
 * took the request, `false` when it was parked instead — in which case the
 * caller is expected to navigate to the board, whose mount will claim it.
 */
export function requestCreateIssue(request: CreateIssueRequest = {}): boolean {
  if (listeners.size > 0) {
    for (const listener of [...listeners]) listener(request);
    return true;
  }
  pending = { request, expiresAt: Date.now() + PENDING_TTL_MS };
  return false;
}

/** Consumer entry point: the board claims a parked request on mount, once. */
export function claimPendingCreateIssue(): CreateIssueRequest | null {
  if (!pending) return null;
  if (Date.now() > pending.expiresAt) {
    pending = null;
    return null;
  }
  const { request } = pending;
  pending = null;
  return request;
}

/** Test/teardown helper. */
export function clearPendingCreateIssue(): void {
  pending = null;
}
