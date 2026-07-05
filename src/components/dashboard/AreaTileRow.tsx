import { Link } from '@/lib/react-router-adapters';
import { Map } from 'lucide-react';
import type { Area } from '@/lib/types';
import { SectionEyebrow } from './SectionEyebrow';

export function AreaTileRow({ areas }: { areas: Area[] }) {
  return (
    <section>
      <SectionEyebrow icon={Map}>Game areas</SectionEyebrow>
      <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2">
        {areas.map((a) => (
          <Link
            key={a.id}
            href={`/areas/${a.id}`}
            className="group flex h-[140px] w-[200px] flex-shrink-0 snap-start flex-col justify-between rounded-xl bg-[var(--color-glass)] p-4 backdrop-blur-[48px] transition-transform duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
          >
            <p className="text-[15px] font-medium text-foreground">{a.name}</p>
            <div>
              <div className="h-1 w-full rounded bg-muted">
                <div
                  className="h-full rounded bg-[var(--color-seeko-accent)]"
                  style={{ width: `${a.progress}%` }}
                />
              </div>
              <p className="mt-2 text-xs tabular-nums text-muted-foreground">{a.progress}%</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
