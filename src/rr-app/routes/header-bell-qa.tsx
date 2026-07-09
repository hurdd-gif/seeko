import { LightShell } from '@/components/dashboard/LightShell';
import type { Notification } from '@/lib/types';

/* No-backend visual-QA preview for the restored inbox bell, reachable at
 * /tasks/bell-qa WITHOUT the loader's auth gate. Mounts the REAL <LightShell>
 * (same Paper chrome as /tasks) with an `account` that carries a userId — so the
 * header renders the live <NotificationBell> + the transitions.dev slide/pop
 * unread badge, instead of the static Inbox glyph.
 *
 * Sample notifications drive the dropdown feed; the realtime channel settles
 * harmlessly without a session (no live socket data). NOT a migration target —
 * deliberately absent from routeInventory. */
const SAMPLE_NOTIFICATIONS: Notification[] = [
  {
    id: 'qa-1',
    user_id: 'qa-user',
    kind: 'task_assigned',
    title: 'New task assigned to you',
    body: '#204 · Boss arena lighting pass',
    link: '/tasks',
    read: false,
    created_at: '2026-06-22T16:40:00.000Z',
  },
  {
    id: 'qa-2',
    user_id: 'qa-user',
    kind: 'task_submitted_review',
    title: 'Submitted for review',
    body: '#198 · Fighting Club HUD',
    link: '/tasks',
    read: false,
    created_at: '2026-06-22T15:10:00.000Z',
  },
  {
    id: 'qa-3',
    user_id: 'qa-user',
    kind: 'payment_request',
    title: 'Payment requested',
    body: '$420 · contract milestone',
    link: '/payments',
    read: false,
    created_at: '2026-06-21T19:05:00.000Z',
  },
];

export function HeaderBellQaRoute() {
  return (
    <LightShell
      activeTab="issues"
      account={{
        email: 'ada@seeko.studio',
        initials: 'AL',
        displayName: 'Ada Lovelace',
        userId: 'qa-user',
        isAdmin: true,
        unreadCount: SAMPLE_NOTIFICATIONS.length,
        notifications: SAMPLE_NOTIFICATIONS,
        team: [],
        areas: [],
      }}
    >
      <div className="px-[52px] py-12 text-sm text-[#808080]">
        Visual-QA preview — the live inbox bell + slide/pop unread badge live in
        the header (top-right). Click it to open the dropdown feed.
      </div>
    </LightShell>
  );
}
