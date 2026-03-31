'use client';

import { NotificationCard } from './NotificationCard';
import { DisplayNotification } from './types';

interface NotificationStackProps {
  notification: DisplayNotification;
  group: string;
  index: number;
  stagger: number;
  onTap: (notif: DisplayNotification) => void;
}

export function NotificationStack({
  notification,
  group,
  index,
  stagger,
  onTap,
}: NotificationStackProps) {
  return (
    <NotificationCard
      notification={notification}
      group={group}
      index={index}
      stagger={stagger}
      onTap={onTap}
    />
  );
}
