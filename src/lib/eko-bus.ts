/**
 * EKO bus — a typed, framework-agnostic pub/sub channel between the EKO agent
 * tray (AgentCompanion) and the dashboard pages LightShell wraps.
 *
 * HARD RULE: this bus carries UI choreography ONLY — spotlighting, scrolling,
 * navigation, prefilling. It must NEVER carry or trigger a mutation. All
 * writes stay on the existing gated /api/agent/chat approval path.
 *
 * The module is a singleton, so events and the pending-spotlight slot survive
 * SPA navigations (e.g. "receipt clicked on /docs → navigate → /issues cards
 * mount → the matching card claims the spotlight").
 */

/**
 * How a bus event points at a task. Matching precedence (see
 * `matchesEkoTaskRef`): id → task_number → case-insensitive name. The agent
 * API returns the task id for executed writes; number/name are fallbacks for
 * events built from prose.
 */
export type EkoTaskRef = {
  /** Supabase task uuid (preferred). */
  id?: string;
  /** Board number (rendered bare on the board, "#{n}" in prose). */
  taskNumber?: number;
  /** Exact task name — last-resort matcher. */
  name?: string;
};

/** Draft fields EKO may want a form pre-filled with (future: drawer prefill). */
export type EkoTaskDraft = {
  title?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  assigneeName?: string;
};

/** What a page can hand EKO as conversation context (future: context chips). */
export type EkoContextRef =
  | { kind: 'task'; id: string; label?: string }
  | { kind: 'tasks'; ids: string[]; label?: string }
  | { kind: 'doc'; id: string; label?: string }
  | { kind: 'page'; path: string; label?: string };

/**
 * The full event union. `spotlight`, `navigate`, and `write-executed` are
 * wired today (post-write receipt deep-link + board loader revalidation); the
 * rest reserve shapes for the other brainstormed ideas so producers/consumers
 * can be added without a breaking change:
 *  - `open-drawer` / `preview-draft` / `clear-preview` → diff previews and
 *    drawer prefill on the board.
 *  - `ask-eko` → pages pushing context chips into the tray composer.
 */
export type EkoBusEvent =
  | { type: 'spotlight'; target: EkoTaskRef }
  | { type: 'navigate'; path: string; filters?: Record<string, string[]> }
  /**
   * An approved EKO write just executed. Fired for ALL executed writes,
   * including deletes (`target` is absent — a deleted task has no card).
   * Consumers only re-READ loader data in response (e.g. /issues board
   * revalidation); per the bus hard rule, no mutation rides this event.
   */
  | { type: 'write-executed'; target?: EkoTaskRef }
  | { type: 'open-drawer'; target?: EkoTaskRef; draft?: EkoTaskDraft }
  | { type: 'preview-draft'; target: EkoTaskRef; draft: EkoTaskDraft }
  | { type: 'clear-preview' }
  | { type: 'ask-eko'; context: EkoContextRef };

export type EkoBusListener = (event: EkoBusEvent) => void;

const listeners = new Set<EkoBusListener>();

/** Subscribe to every bus event. Returns an unsubscribe function. */
export function subscribeEkoBus(listener: EkoBusListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Broadcast one event to all live subscribers (synchronously, in order). */
export function emitEkoEvent(event: EkoBusEvent): void {
  for (const listener of [...listeners]) {
    listener(event);
  }
}

/**
 * Pending spotlight — a one-slot mailbox so a spotlight survives navigation.
 * If no card claims it while the emit is live (wrong page), it waits for the
 * matching card to mount after the route change. TTL keeps a never-claimed
 * spotlight from firing on some unrelated later visit to /issues.
 */
const PENDING_SPOTLIGHT_TTL_MS = 15_000;

let pendingSpotlight: { target: EkoTaskRef; expiresAt: number } | null = null;

/** True when the two refs point at the same task. Ids win over numbers over names. */
export function matchesEkoTaskRef(a: EkoTaskRef, b: EkoTaskRef): boolean {
  if (a.id && b.id) return a.id === b.id;
  if (a.taskNumber != null && b.taskNumber != null) return a.taskNumber === b.taskNumber;
  if (a.name && b.name) return a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
  return false;
}

/**
 * Producer entry point: park the target in the pending slot, then emit. A
 * card already on screen claims it synchronously during the emit; otherwise
 * it waits for the post-navigation mount claim.
 */
export function requestEkoSpotlight(target: EkoTaskRef): void {
  pendingSpotlight = { target, expiresAt: Date.now() + PENDING_SPOTLIGHT_TTL_MS };
  emitEkoEvent({ type: 'spotlight', target });
}

/**
 * Consumer entry point: a card offers itself as `candidate`. If the pending
 * spotlight matches (and hasn't expired), the slot is cleared and the card
 * wins — exactly one card ever claims a given spotlight.
 */
export function tryClaimEkoSpotlight(candidate: EkoTaskRef): boolean {
  if (!pendingSpotlight) return false;
  if (Date.now() > pendingSpotlight.expiresAt) {
    pendingSpotlight = null;
    return false;
  }
  if (!matchesEkoTaskRef(pendingSpotlight.target, candidate)) return false;
  pendingSpotlight = null;
  return true;
}

/**
 * Put a claimed-but-unfinished spotlight back in the mailbox WITHOUT emitting.
 * StrictMode-safe consumer cleanup: React dev double-invokes mount effects, so
 * a card that claims on mount is torn down and re-run immediately — re-parking
 * on cleanup lets the re-run (or the next matching mount) claim it again.
 */
export function restoreEkoSpotlight(target: EkoTaskRef): void {
  pendingSpotlight = { target, expiresAt: Date.now() + PENDING_SPOTLIGHT_TTL_MS };
}

/** Test/teardown helper. */
export function clearPendingEkoSpotlight(): void {
  pendingSpotlight = null;
}

/** Test helper — inspect without claiming. */
export function peekPendingEkoSpotlight(): EkoTaskRef | null {
  return pendingSpotlight?.target ?? null;
}
