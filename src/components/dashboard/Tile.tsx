import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

type Props = {
  href: string;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  size?: 'sm' | 'md';
};

export function Tile({ href, title, subtitle, icon: Icon, size = 'sm' }: Props) {
  const dims = size === 'sm' ? 'w-36 h-24' : 'w-[200px] h-[140px]';
  return (
    <Link
      href={href}
      className={`group ${dims} flex flex-shrink-0 snap-start flex-col justify-between rounded-xl bg-[var(--color-glass)] p-3 backdrop-blur-[48px] transition-transform duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97]`}
    >
      {Icon && <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />}
      <div>
        <p className="line-clamp-2 text-sm leading-tight text-foreground">{title}</p>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </Link>
  );
}
