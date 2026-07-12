import { Link } from '@/lib/react-router-adapters';

type Props = {
  title: string;
  body?: string;
  cta: { href: string; label: string };
  tone?: 'blue' | 'neutral';
};

const PILL = {
  blue: {
    bg: 'bg-[#0d7aff0f]',
    border: 'border-[#5f5f5f1a] dark:border-white/[0.10]',
    fg: 'text-[#545454] dark:text-ink-muted',
    arrow: 'text-[#848484] dark:text-ink-faint',
  },
  neutral: {
    bg: 'bg-[#4242420f] dark:bg-white/[0.05]',
    border: 'border-[#1d1d1d1a] dark:border-white/[0.10]',
    fg: 'text-[#5c5c5c] dark:text-ink-muted',
    arrow: 'text-[#939393] dark:text-ink-faint',
  },
} as const;

// Left half of a SplitPanel: headline + meta on ONE line, pill pinned bottom-left
// (parent SplitPanel column is justify-between).
export function PanelPromo({ title, body, cta, tone = 'blue' }: Props) {
  const label = cta.label.replace(/\s*→\s*$/, '');
  const p = PILL[tone];
  return (
    <>
      <div className="flex gap-1 self-stretch">
        <span className="text-[15px] font-medium leading-[18px] tabular-nums text-[#1b1b1b] dark:text-ink-title">{title}</span>
        {body && (
          <span className="text-[14px] leading-[18px] tabular-nums text-[var(--ov-muted)]">{body}</span>
        )}
      </div>
      <Link
        href={cta.href}
        className={`mt-5 inline-flex w-fit items-center justify-center gap-1.5 self-start rounded-full border py-2 pl-3.5 pr-3 text-[14px] leading-[18px] transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] ${p.bg} ${p.border} ${p.fg}`}
      >
        <span>{label}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 ${p.arrow}`}
          aria-hidden
        >
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </Link>
    </>
  );
}
