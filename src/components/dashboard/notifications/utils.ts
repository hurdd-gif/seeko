import { Notification } from '@/lib/types';
import { DisplayNotification, GroupedNotification } from './types';

export function formatTime(dateStr: string, group: string): string {
  const date = new Date(dateStr);
  if (group === 'Earlier') {
    const days = Math.floor((Date.now() - date.getTime()) / 86400000);
    return `${days}d ago`;
  }
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function getTimeGroup(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  if (date >= todayStart) return 'Today';
  if (date >= yesterdayStart) return 'Yesterday';
  return 'Earlier';
}

export function collapseNotifications(items: Notification[]): DisplayNotification[] {
  const result: DisplayNotification[] = [];
  const seen = new Map<string, number>();

  for (const n of items) {
    const titlePrefix = n.title.replace(/\$[\d,.]+/, '').trim();
    const key = `${n.kind}:${titlePrefix}`;
    const existingIdx = seen.get(key);

    if (existingIdx !== undefined && result[existingIdx]) {
      const existing = result[existingIdx];
      existing.count++;
      existing.ids.push(n.id);
      if (!n.read) existing.read = false;
      if (n.kind === 'payment_request') {
        const existAmount = parseFloat(existing.title.match(/\$([\d,.]+)/)?.[1]?.replace(',', '') ?? '0');
        const newAmount = parseFloat(n.title.match(/\$([\d,.]+)/)?.[1]?.replace(',', '') ?? '0');
        const total = existAmount + newAmount;
        existing.title = existing.title.replace(/\$[\d,.]+/, `$${total.toFixed(2)}`);
        existing.body = `${existing.count} payments`;
      }
    } else {
      seen.set(key, result.length);
      result.push({
        id: n.id, kind: n.kind, title: n.title, body: n.body,
        link: n.link, read: n.read, created_at: n.created_at,
        count: 1, ids: [n.id],
      });
    }
  }
  return result;
}

export function groupNotifications(notifications: Notification[]): GroupedNotification[] {
  const groups = new Map<string, Notification[]>();
  const order = ['Today', 'Yesterday', 'Earlier'];

  for (const n of notifications) {
    const group = getTimeGroup(n.created_at);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(n);
  }

  return order
    .filter(label => groups.has(label))
    .map(label => ({ label, items: collapseNotifications(groups.get(label)!) }));
}
