'use client';

import Link from 'next/link';
import { ChevronRight, ExternalLink } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ArrowRight } from 'lucide-react';

type Parsed = { type: string; name: string; detail?: string };

function exactTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return dateStr;
  }
}

function openLabel(parsed: Parsed): string {
  if (parsed.type === 'doc') return 'Open in Documents';
  if (parsed.type === 'task' || parsed.type === 'area') return 'Open in Tasks';
  return 'View';
}

export function ActivityMoreInfo({
  name,
  sentence,
  parsed,
  createdAt,
  href,
}: {
  name: string;
  sentence: string;
  parsed: Parsed;
  createdAt: string;
  href: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="text-[11px] text-muted-foreground/70 hover:text-foreground/80 transition-colors inline-flex items-center gap-0.5 w-fit"
        >
          More info
          <ChevronRight className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-3">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{name}</span>
            {' '}
            <span>{sentence}</span>
            {' '}
            <span className="font-medium text-foreground">{parsed.name}</span>
            {parsed.detail && (
              <>
                {' '}
                <ArrowRight className="inline size-3 mx-0.5 text-muted-foreground/50 align-middle" />
                {' '}
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal rounded-md bg-muted/80 text-foreground/80">
                  {parsed.detail}
                </Badge>
              </>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground/60">
            {exactTime(createdAt)}
          </p>
          <Link
            href={href}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/90 hover:text-foreground mt-1"
          >
            <ExternalLink className="size-3" />
            {openLabel(parsed)}
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
