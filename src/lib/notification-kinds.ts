import type { NotificationKind } from './types';

/** Runtime set of valid notification kinds for server-side validation */
export const VALID_NOTIFICATION_KINDS = new Set<NotificationKind>([
  'task_assigned',
  'mentioned',
  'comment_reply',
  'task_completed',
  'deliverable_uploaded',
  'task_handoff',
  'payment_request',
  'payment_approved',
  'payment_denied',
  'deadline_extension_requested',
  'deadline_extension_approved',
  'deadline_extension_denied',
  'task_submitted_review',
  'task_review_approved',
  'task_review_denied',
]);

export function isValidNotificationKind(kind: string): kind is NotificationKind {
  return VALID_NOTIFICATION_KINDS.has(kind as NotificationKind);
}
