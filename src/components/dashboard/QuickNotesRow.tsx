import { StickyNote } from 'lucide-react';
import { SectionEyebrow } from './SectionEyebrow';

type QuickNoteItem = {
  id: string;
  body: string;
  created_at: string;
};

export function QuickNotesRow({ notes }: { notes: QuickNoteItem[] }) {
  return (
    <section>
      <SectionEyebrow icon={StickyNote}>Quick notes</SectionEyebrow>
      <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2">
        {notes.map((n) => (
          <article
            key={n.id}
            className="flex h-[140px] w-[200px] flex-shrink-0 snap-start flex-col rounded-2xl bg-[var(--ov-row,var(--color-glass))] p-4 shadow-[var(--ov-shadow-row,none)]"
          >
            <p className="line-clamp-4 text-sm text-[var(--ov-text,var(--color-foreground))]">
              {n.body}
            </p>
            <time className="mt-auto text-xs tabular-nums text-[var(--ov-muted,var(--color-muted-foreground))]">
              {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </time>
          </article>
        ))}
      </div>
    </section>
  );
}
