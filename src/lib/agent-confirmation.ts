/**
 * How the tray decides what a confirmation-like prompt ("yes", "go ahead", …) means.
 *
 * This logic used to live inline in AgentCompanion and quietly deflected EVERY bare
 * "yes" with a canned reply — never calling the API — so EKO never saw the
 * confirmation and forgot the offer it had made the previous turn. Centralising it
 * here, as pure functions with tests, keeps the client decision honest: a bare "yes"
 * with no visible approval card must reach the server, which threads the conversation
 * history and stages exactly what EKO offered (still behind the approval gate).
 */

/** Explicit confirmation phrasing used to approve a card that is already on screen. */
export function isApprovalConfirmationPrompt(prompt: string): boolean {
  return /\b(i (?:already )?approved|approved it|approve it|i approve|confirmed?|go ahead|proceed|do it|yes)\b/i.test(prompt);
}

/** A standalone affirmation with no other content ("yes", "ok", "do it"). */
export function isBareConfirmation(prompt: string): boolean {
  return /^\s*(?:yes|yeah|yep|ok|okay|sure|do it|confirmed?|confirm|go ahead|proceed|approve it|approved it|i approve|i already approved it)\s*[.!?]*\s*$/i.test(
    prompt,
  );
}

export type ConfirmationRoute = 'approve-visible-card' | 'send-to-server';

/**
 * Decide how a submitted prompt should be handled.
 *
 * When an approval card is already visible, an explicit confirmation approves it
 * locally — no server round-trip, no duplicate staging. Otherwise EVERYTHING goes to
 * the server, including a bare "yes" confirming an offer EKO made in conversation.
 * The client must never short-circuit that "yes": doing so throws away the context
 * the server needs to remember what it offered.
 */
export function confirmationRoute(
  prompt: string,
  ctx: { hasVisibleApprovalCard: boolean },
): ConfirmationRoute {
  if (ctx.hasVisibleApprovalCard && isApprovalConfirmationPrompt(prompt)) {
    return 'approve-visible-card';
  }
  return 'send-to-server';
}
