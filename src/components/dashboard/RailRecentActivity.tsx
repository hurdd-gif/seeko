import Link from 'next/link';
import { ActivityFeedItem } from './ActivityFeedItem';

type Item = {
  id: string;
  name: string;
  action: string;
  target: string;
  time: string;
  actionKey: string;
  iconClassName: string;
  iconBg: string;
};

export function RailRecentActivity({ items, showViewAll }: { items: Item[]; showViewAll: boolean }) {
  return (
    <div className="px-4 py-3.5">
      <p className="mb-2 text-xs text-muted-foreground">Recent activity</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recent activity</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((item) => (
            <li key={item.id}>
              <ActivityFeedItem
                name={item.name}
                action={item.action}
                target={item.target}
                time={item.time}
                actionKey={item.actionKey}
                iconClassName={item.iconClassName}
                iconBg={item.iconBg}
              />
            </li>
          ))}
        </ul>
      )}
      {showViewAll && items.length > 0 && (
        <Link
          href="/activity"
          className="mt-3 inline-block text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          View all →
        </Link>
      )}
    </div>
  );
}
