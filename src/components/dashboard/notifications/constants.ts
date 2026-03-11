import {
  Bell, CheckSquare, AtSign, MessageSquare, CheckCircle2, Package,
  ArrowRightLeft, Receipt, CircleCheck, CircleX, Clock, AlertCircle,
} from 'lucide-react';
import { NotificationKind } from '@/lib/types';

export const SMOOTH = { type: 'spring' as const, stiffness: 300, damping: 25 };
export const SNAPPY = { type: 'spring' as const, stiffness: 500, damping: 30 };
export const SHEET_SPRING = { type: 'spring' as const, visualDuration: 0.35, bounce: 0.05 };
export const ROW_STAGGER = 0.03;
export const MOBILE_ROW_STAGGER = 0.02;
export const SWIPE_DISMISS_THRESHOLD = 100;

export const KIND_CONFIG: Record<NotificationKind, { icon: typeof Bell; className: string; bg: string }> = {
  task_assigned:       { icon: CheckSquare,    className: 'text-seeko-accent',  bg: 'bg-emerald-500/10' },
  mentioned:           { icon: AtSign,         className: 'text-blue-400',      bg: 'bg-blue-500/10' },
  comment_reply:       { icon: MessageSquare,  className: 'text-amber-400',     bg: 'bg-amber-500/10' },
  task_completed:      { icon: CheckCircle2,   className: 'text-emerald-500',   bg: 'bg-emerald-500/10' },
  deliverable_uploaded:{ icon: Package,        className: 'text-violet-400',    bg: 'bg-violet-500/10' },
  task_handoff:        { icon: ArrowRightLeft, className: 'text-seeko-accent',  bg: 'bg-emerald-500/10' },
  payment_request:     { icon: Receipt,        className: 'text-cyan-400',      bg: 'bg-cyan-500/10' },
  payment_approved:    { icon: CircleCheck,    className: 'text-emerald-500',   bg: 'bg-emerald-500/10' },
  payment_denied:      { icon: CircleX,        className: 'text-red-400',       bg: 'bg-red-500/10' },
  deadline_extension_requested: { icon: Clock,       className: 'text-amber-400',    bg: 'bg-amber-500/10' },
  deadline_extension_approved:  { icon: CheckCircle2, className: 'text-emerald-500',  bg: 'bg-emerald-500/10' },
  deadline_extension_denied:    { icon: CircleX,      className: 'text-red-400',      bg: 'bg-red-500/10' },
  task_submitted_review:        { icon: AlertCircle,  className: 'text-blue-400',     bg: 'bg-blue-500/10' },
  task_review_approved:         { icon: CheckCircle2, className: 'text-emerald-500',  bg: 'bg-emerald-500/10' },
  task_review_denied:           { icon: CircleX,      className: 'text-red-400',      bg: 'bg-red-500/10' },
};
