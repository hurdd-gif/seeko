import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

type Props = {
  icon?: LucideIcon;
  title: string;
  body?: string;
  cta: { href: string; label: string };
};

export function PanelPromo({ icon: Icon, title, body, cta }: Props) {
  return (
    <div className="flex h-full flex-col justify-between">
      {Icon && <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />}
      <div className="mt-auto">
        <p className="text-[15px] font-medium text-foreground">{title}</p>
        {body && <p className="mt-1 text-sm text-muted-foreground">{body}</p>}
        <Link
          href={cta.href}
          className="mt-3 inline-block text-sm text-[var(--color-seeko-accent)] hover:underline"
        >
          {cta.label}
        </Link>
      </div>
    </div>
  );
}
