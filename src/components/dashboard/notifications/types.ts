import { NotificationKind } from '@/lib/types';

export interface DisplayNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  link?: string | null;
  read: boolean;
  created_at: string;
  count: number;
  ids: string[];
}

export interface GroupedNotification {
  label: string;
  items: DisplayNotification[];
}
