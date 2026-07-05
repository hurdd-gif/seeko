import { Clock, CheckSquare } from 'lucide-react';
import { TileRow } from './TileRow';
import { Tile } from './Tile';
import type { RecentItem } from '@/lib/supabase/data';

// The tile's time token stays compact so it never crowds the title: dates
// collapse to single relative buckets (Today / Nd / 1 week / N wk) and finally a
// bare month abbreviation — never a two-token "May 10". The redesigned tile
// sizes the token to its content, but keeping it short preserves the rhythm.
//
// All recent items render; the redesign shows three 356px tiles across the
// 1100px column and scrolls the rest horizontally (snap-x on TileRow).
function timeAgo(iso: string): string {
  const day = 1000 * 60 * 60 * 24;
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < day) return 'Today';
  if (diff < day * 2) return '1d';
  if (diff < day * 7) return `${Math.floor(diff / day)}d`;
  if (diff < day * 14) return '1 week';
  if (diff < day * 56) return `${Math.floor(diff / (day * 7))} wk`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short' });
}

export function RecentItemsRow({ items }: { items: RecentItem[] }) {
  if (items.length === 0) return null;
  return (
    <TileRow icon={Clock} eyebrow="Recently worked on">
      {items.map((item) => (
        <Tile
          key={item.id}
          href={item.href}
          icon={CheckSquare}
          title={item.title}
          subtitle={timeAgo(item.updated_at)}
        />
      ))}
    </TileRow>
  );
}
