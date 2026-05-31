import { Clock, CheckSquare, FileText, Map } from 'lucide-react';
import { TileRow } from './TileRow';
import { Tile } from './Tile';
import type { RecentItem } from '@/lib/supabase/data';

const kindIcon = { task: CheckSquare, doc: FileText, area: Map } as const;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const day = 1000 * 60 * 60 * 24;
  if (diff < day) return 'Today';
  if (diff < day * 2) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function RecentItemsRow({ items }: { items: RecentItem[] }) {
  if (items.length === 0) return null;
  return (
    <TileRow icon={Clock} eyebrow="Recently worked on">
      {items.map((item) => (
        <Tile
          key={item.id}
          href={item.href}
          icon={kindIcon[item.kind]}
          title={item.title}
          subtitle={timeAgo(item.updated_at)}
        />
      ))}
    </TileRow>
  );
}
