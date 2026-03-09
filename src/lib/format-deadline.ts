import { AlertTriangle, Clock, type LucideIcon } from 'lucide-react';

export interface DeadlineDisplay {
  label: string;
  className: string;
  icon: LucideIcon;
}

/**
 * Returns a relative deadline label with urgency-based color.
 *
 * Tiers:
 *   Overdue     → "yesterday", "2 days ago", etc. — red
 *   Due today   → "Today" — orange
 *   Due 1-6 days→ "Tomorrow", "in 3 days" — amber
 *   Due 7+ days → "Mar 28" (absolute) — muted
 */
export function formatDeadline(dateStr: string): DeadlineDisplay {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const deadline = new Date(dateStr + 'T00:00:00');
  const diffMs = deadline.getTime() - todayStart.getTime();
  const diffDays = Math.round(diffMs / 86_400_000);

  // Overdue
  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    let label: string;
    if (absDays === 1) label = 'Yesterday';
    else if (absDays < 7) label = `${absDays} days ago`;
    else if (absDays < 14) label = '1 week ago';
    else label = `${Math.floor(absDays / 7)} weeks ago`;
    return { label, className: 'text-red-400', icon: AlertTriangle };
  }

  // Due today
  if (diffDays === 0) {
    return { label: 'Today', className: 'text-orange-400', icon: Clock };
  }

  // Due tomorrow
  if (diffDays === 1) {
    return { label: 'Tomorrow', className: 'text-amber-400', icon: Clock };
  }

  // Due this week (2-6 days)
  if (diffDays <= 6) {
    return { label: `in ${diffDays} days`, className: 'text-amber-400', icon: Clock };
  }

  // Normal (7+ days)
  const formatted = deadline.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  return { label: formatted, className: 'text-muted-foreground', icon: Clock };
}

/** Full absolute date for tooltips */
export function formatDeadlineFull(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
