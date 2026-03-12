/**
 * Reference-counted scroll lock via data-modal-open attribute.
 * Multiple sheets/dialogs can lock simultaneously — the attribute
 * is only removed when ALL have unlocked.
 *
 * CSS in globals.css uses :root[data-modal-open] to disable scroll
 * on body, #dashboard-scroll, and #tour-main.
 */

let lockCount = 0;

export function acquireScrollLock() {
  lockCount++;
  document.documentElement.setAttribute('data-modal-open', '');
}

export function releaseScrollLock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.documentElement.removeAttribute('data-modal-open');
  }
}
