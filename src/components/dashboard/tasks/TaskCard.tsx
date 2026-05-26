/**
 * TaskCard — a single card on the issue board.
 *
 * Spec (light-mode adaptation of Paper TA-0; see plan 2026-05-19):
 *   • bg-white, rounded-xl, shadow-seeko, p-3
 *   • Header row:  [DIH-{n}]      [assignee avatar / +icon]
 *   • Title row:   [StatusDot] [name (truncate)]
 *   • Footer:      Created {date}
 *   • Hover lift:  y: -2 with springs.snappy
 *   • Click → rail (Phase C); admin click on avatar → quick-assign popover.
 *
 * The outer surface is a div with role="button" (not a <button>) so the
 * nested AssigneePopover trigger button is valid HTML.
 */

'use client';

import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { UserPlus } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { springs } from '@/lib/motion';
import type { Profile, TaskWithAssignee } from '@/lib/types';
import { StatusDot } from './StatusDot';
import { AssigneePopover } from './AssigneePopover';
import { cn } from '@/lib/utils';

function initials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Short "Created May 13" — matches the Paper footer ("Created May …" truncated). */
function shortCreated(dateStr?: string): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `Created ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

export function TaskCard({
  task,
  onClick,
  index = 0,
  className,
  isAdmin = false,
  team,
  onAssign,
}: {
  task: TaskWithAssignee;
  onClick?: () => void;
  /** For entrance stagger inside a column. */
  index?: number;
  className?: string;
  /** Admin gets the quick-assign affordance on the avatar/+ chip. */
  isAdmin?: boolean;
  /** Roster used to populate the assignee menu (admin only). */
  team?: Profile[];
  /** Mutation callback (admin only): null clears the assignee. */
  onAssign?: (taskId: string, profileId: string | null) => void;
}) {
  const reduce = useReducedMotion();
  const idLabel = task.task_number != null ? String(task.task_number) : null;
  const created = shortCreated(task.created_at);
  const assignee = task.assignee;

  const canQuickAssign = isAdmin && !!team && !!onAssign;

  // The visible avatar/initials block — same in both editable and read-only modes.
  const avatarVisual = assignee ? (
    <Avatar className="size-5 shrink-0 ring-1 ring-black/[0.04]">
      <AvatarImage src={assignee.avatar_url ?? undefined} alt={assignee.display_name ?? ''} />
      <AvatarFallback className="bg-[#e5e5e5] text-[8px] font-medium text-[#505050]">
        {initials(assignee.display_name)}
      </AvatarFallback>
    </Avatar>
  ) : null;

  // Trigger shown when the card is unassigned and the user is an admin —
  // a dashed circle with a + icon, matching the popover's "No assignee" row.
  const emptyTrigger = (
    <span
      className="flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-[#cfcfcf] text-[#9a9a9a] transition-colors hover:border-[#9a9a9a] hover:text-[#505050]"
      aria-hidden
    >
      <UserPlus className="size-3" strokeWidth={1.75} />
    </span>
  );

  const headerRight = canQuickAssign ? (
    <AssigneePopover
      value={task.assignee_id ?? null}
      team={team!}
      ariaLabel={assignee ? `Change assignee for ${task.name}` : `Assign ${task.name}`}
      onSelect={(next) => onAssign!(task.id, next)}
    >
      {avatarVisual ?? emptyTrigger}
    </AssigneePopover>
  ) : (
    avatarVisual ?? <span aria-hidden />
  );

  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.defaultPrevented) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  }

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={`Open ${task.name}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        ...springs.smooth,
        delay: reduce ? 0 : 0.04 + index * 0.025,
      }}
      whileHover={reduce ? undefined : { y: -2 }}
      whileTap={reduce ? undefined : { scale: 0.985 }}
      style={{ transformOrigin: 'center' }}
      className={cn(
        'group block w-full rounded-xl bg-white p-3 text-left shadow-seeko',
        'cursor-pointer outline-none',
        'focus-visible:ring-2 focus-visible:ring-[#0d7aff]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#eeeeee]',
        className,
      )}
    >
      {/* Header row — id label · assignee trigger */}
      <div className="flex items-start justify-between gap-2">
        {idLabel ? (
          <span className="font-mono text-[11px] leading-none tabular-nums text-[#808080]">
            {idLabel}
          </span>
        ) : (
          <span aria-hidden />
        )}
        {headerRight}
      </div>

      {/* Title row — status dot · name */}
      <div className="mt-2 flex items-center gap-2">
        <StatusDot status={task.status} size="sm" className="shrink-0" />
        <span className="min-w-0 flex-1 line-clamp-2 text-[13.5px] font-medium leading-snug text-[#222222]">
          {task.name}
        </span>
      </div>

      {/* Footer — created date */}
      {created && (
        <p className="mt-3 text-[11px] leading-none text-[#9a9a9a] tabular-nums">{created}</p>
      )}
    </motion.div>
  );
}
