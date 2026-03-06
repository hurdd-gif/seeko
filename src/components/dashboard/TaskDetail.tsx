'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { motion, AnimatePresence } from 'motion/react';
import {
  Clock,
  MessageSquare,
  Send,
  CheckCircle2,
  Timer,
  AlertCircle,
  Circle,
  Pencil,
  Trash2,
  Check,
  X,
  FileText,
  Package,
  Download,
  ArrowRightLeft,
} from 'lucide-react';
import Link from 'next/link';
import { Task, TaskWithAssignee, TaskComment, TaskDeliverable, TaskHandoff, Profile, Doc } from '@/lib/types';
import { toast } from 'sonner';
import { Dialog, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { HandoffDialog } from './HandoffDialog';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const STATUS_DISPLAY: Record<string, { icon: typeof Circle; label: string; className: string }> = {
  'Complete':     { icon: CheckCircle2, label: 'Complete',    className: 'text-[var(--color-status-complete)]' },
  'In Progress':  { icon: Timer,        label: 'In Progress', className: 'text-[var(--color-status-progress)]' },
  'In Review':    { icon: AlertCircle,   label: 'In Review',   className: 'text-[var(--color-status-review)]' },
  'Blocked':      { icon: Circle,        label: 'Blocked',     className: 'text-[var(--color-status-blocked)]' },
};

/* ─────────────────────────────────────────────────────────
 * HANDOFF PANEL ANIMATION
 *   0ms   panel closed (trigger not shown if no handoffs)
 *  open   backdrop fades in, card scales in (spring)
 *  close  card scales down, backdrop fades out
 * ───────────────────────────────────────────────────────── */
const HANDOFF_PANEL = {
  backdropOpacity: { closed: 0, open: 1 },
  cardScale:        { closed: 0.96, open: 1 },
  cardOpacity:      { closed: 0, open: 1 },
  spring:           { type: 'spring' as const, stiffness: 400, damping: 30 },
};

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function formatLocalTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderContent(text: string, teamNames: string[], docTitles: string[]): React.ReactNode[] {
  const mentionAlts = teamNames.filter(Boolean).sort((a, b) => b.length - a.length).map(escapeRegex);
  const docAlts = docTitles.filter(Boolean).sort((a, b) => b.length - a.length).map(escapeRegex);

  const parts: string[] = [];
  if (mentionAlts.length) parts.push(`@(?:${mentionAlts.join('|')})`);
  if (docAlts.length) parts.push(`#(?:${docAlts.join('|')})`);

  if (parts.length === 0) return [<span key={0}>{text}</span>];

  const regex = new RegExp(`(${parts.join('|')})`, 'gi');
  const segments = text.split(regex);

  return segments.map((seg, i) => {
    if (seg.match(/^@/i) && mentionAlts.some(a => seg.slice(1).match(new RegExp(`^${a}$`, 'i')))) {
      return (
        <span key={i} className="rounded bg-seeko-accent/15 px-1 py-0.5 text-seeko-accent font-medium">
          {seg}
        </span>
      );
    }
    if (seg.match(/^#/i) && docAlts.some(a => seg.slice(1).match(new RegExp(`^${a}$`, 'i')))) {
      return (
        <Link key={i} href="/docs" className="rounded bg-blue-500/15 px-1 py-0.5 text-blue-400 font-medium hover:bg-blue-500/25 transition-colors cursor-pointer">
          {seg}
        </Link>
      );
    }
    return <span key={i}>{seg}</span>;
  });
}

function CommentItem({
  comment,
  isOwn,
  isHighlighted,
  teamNames,
  docTitles,
  onEdit,
  onDelete,
}: {
  comment: TaskComment;
  isOwn: boolean;
  isHighlighted?: boolean;
  teamNames: string[];
  docTitles: string[];
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
}) {
  const highlightRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const prof = comment.profiles;
  const name = prof?.display_name ?? 'Unknown';
  const avatar = prof?.avatar_url;
  const wasEdited = comment.updated_at && comment.updated_at !== comment.created_at;

  useEffect(() => {
    if (editing) {
      editRef.current?.focus();
      editRef.current?.select();
    }
  }, [editing]);

  function handleSaveEdit() {
    if (!editText.trim() || editText.trim() === comment.content) {
      setEditing(false);
      setEditText(comment.content);
      return;
    }
    onEdit(comment.id, editText.trim());
    setEditing(false);
  }

  useEffect(() => {
    if (isHighlighted && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isHighlighted]);

  return (
    <motion.div
      ref={highlightRef}
      key={comment.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{
        opacity: 1,
        y: 0,
        backgroundColor: isHighlighted ? ['rgba(59,130,246,0.25)', 'rgba(59,130,246,0)'] : 'rgba(59,130,246,0)',
      }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: isHighlighted ? 2 : 0.15, backgroundColor: { duration: 2, delay: 0.5 } }}
      className="group flex gap-3 rounded-md px-2 py-1 -mx-2"
    >
      <Avatar className="size-7 shrink-0 mt-0.5">
        <AvatarImage src={avatar ?? undefined} alt={name} />
        <AvatarFallback className="text-[8px] bg-secondary">{getInitials(name)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-foreground">{name}</span>
          <span className="text-[11px] text-muted-foreground cursor-default" title={formatLocalTime(comment.created_at)}>{timeAgo(comment.created_at)}</span>
          {wasEdited && (
            <span className="text-[11px] text-muted-foreground/60 italic">( edited )</span>
          )}
          {isOwn && !editing && !confirmingDelete && (
            <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => { setEditText(comment.content); setEditing(true); }}
                className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                title="Edit"
              >
                <Pencil className="size-3" />
              </button>
              <button
                onClick={() => setConfirmingDelete(true)}
                className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Delete"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          )}
        </div>

        <AnimatePresence>
          {confirmingDelete && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.12, ease: [0.25, 1, 0.5, 1] }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 mt-1.5 rounded-md bg-destructive/10 border border-destructive/20 px-2.5 py-1.5">
                <span className="text-xs text-destructive flex-1">Delete this comment?</span>
                <button
                  onClick={() => { onDelete(comment.id); setConfirmingDelete(false); }}
                  className="rounded px-2 py-0.5 text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {editing ? (
          <div className="mt-1">
            <textarea
              ref={editRef}
              value={editText}
              onChange={e => setEditText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
                if (e.key === 'Escape') { setEditing(false); setEditText(comment.content); }
              }}
              className="w-full resize-none rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:border-foreground/30 min-h-[36px]"
              rows={1}
              onInput={e => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 100) + 'px';
              }}
            />
            <div className="flex items-center gap-1.5 mt-1.5">
              <button onClick={handleSaveEdit} className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                <Check className="size-3" />
                Save
              </button>
              <button onClick={() => { setEditing(false); setEditText(comment.content); }} className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <X className="size-3" />
                Cancel
              </button>
              <span className="text-[10px] text-muted-foreground/50 ml-1">Esc to cancel · Enter to save</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-foreground/80 mt-0.5 whitespace-pre-wrap break-words">
            {renderContent(comment.content, teamNames, docTitles)}
          </p>
        )}
      </div>
    </motion.div>
  );
}

type AutocompleteMode = 'mention' | 'doc' | null;

interface TaskDetailProps {
  task: Task | TaskWithAssignee;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: Profile[];
  docs: Doc[];
  currentUserId: string;
  highlightCommentId?: string | null;
  isAdmin?: boolean;
}

export function TaskDetail({ task, open, onOpenChange, team, docs, currentUserId, highlightCommentId, isAdmin = false }: TaskDetailProps) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [deliverables, setDeliverables] = useState<TaskDeliverable[]>([]);
  const [deliverablesLoading, setDeliverablesLoading] = useState(false);
  const [deletingDeliverableId, setDeletingDeliverableId] = useState<string | null>(null);
  const [confirmingDeliverableId, setConfirmingDeliverableId] = useState<string | null>(null);
  const [handoffs, setHandoffs] = useState<TaskHandoff[]>([]);
  const [handoffPanelOpen, setHandoffPanelOpen] = useState(false);
  const [showHandoff, setShowHandoff] = useState(false);
  const [localAssigneeId, setLocalAssigneeId] = useState<string | null | undefined>(undefined);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [autocompleteMode, setAutocompleteMode] = useState<AutocompleteMode>(null);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), []);

  const teamNames = useMemo(() => team.map(m => m.display_name).filter(Boolean) as string[], [team]);
  const docTitles = useMemo(() => docs.map(d => d.title).filter(Boolean), [docs]);

  const loadComments = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('task_comments')
      .select('*, profiles(id, display_name, avatar_url)')
      .eq('task_id', task.id)
      .order('created_at', { ascending: true });
    setComments((data ?? []) as TaskComment[]);
    setLoading(false);
  }, [task.id, supabase]);

  useEffect(() => {
    if (open) loadComments();
  }, [open, loadComments]);

  const loadDeliverables = useCallback(async () => {
    if (!isAdmin) return;
    setDeliverablesLoading(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/deliverables`);
      if (res.ok) {
        const data = await res.json();
        setDeliverables(Array.isArray(data) ? data : []);
      } else {
        setDeliverables([]);
      }
    } finally {
      setDeliverablesLoading(false);
    }
  }, [task.id, isAdmin]);

  useEffect(() => {
    if (open && isAdmin) loadDeliverables();
  }, [open, isAdmin, loadDeliverables]);

  const handleDeleteDeliverable = useCallback(async (deliverableId: string) => {
    setDeletingDeliverableId(deliverableId);
    try {
      const res = await fetch(`/api/tasks/${task.id}/deliverables/${deliverableId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? 'Failed to remove deliverable');
        return;
      }
      setDeliverables(prev => prev.filter(d => d.id !== deliverableId));
      toast.success('Deliverable removed');
    } finally {
      setDeletingDeliverableId(null);
    }
  }, [task.id]);

  const loadHandoffs = useCallback(async () => {
    const res = await supabase
      .from('task_handoffs')
      .select('*, from_profile:profiles!task_handoffs_from_user_id_fkey(id, display_name, avatar_url), to_profile:profiles!task_handoffs_to_user_id_fkey(id, display_name, avatar_url)')
      .eq('task_id', task.id)
      .order('created_at', { ascending: true });
    setHandoffs((res.data ?? []) as TaskHandoff[]);
  }, [task.id, supabase]);

  useEffect(() => {
    if (open) loadHandoffs();
  }, [open, loadHandoffs]);

  useEffect(() => {
    if (!open) return;

    let isMounted = true;

    const channel = supabase
      .channel(`comments:${task.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_comments', filter: `task_id=eq.${task.id}` },
        (payload) => {
          const incoming = payload.new as TaskComment;
          // Skip if this is our own comment (already optimistically added)
          if (incoming.user_id === currentUserId) return;
          // Fetch full comment with profile join, then add to state
          supabase
            .from('task_comments')
            .select('*, profiles(id, display_name, avatar_url)')
            .eq('id', incoming.id)
            .single()
            .then(({ data }) => {
              if (data && isMounted) setComments(prev => [...prev, data as TaskComment]);
            });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'task_comments', filter: `task_id=eq.${task.id}` },
        (payload) => {
          const updated = payload.new as TaskComment;
          setComments(prev =>
            prev.map(c => c.id === updated.id ? { ...c, content: updated.content, updated_at: updated.updated_at } : c)
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'task_comments', filter: `task_id=eq.${task.id}` },
        (payload) => {
          const deleted = payload.old as { id: string };
          setComments(prev => prev.filter(c => c.id !== deleted.id));
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [open, task.id, currentUserId, supabase]);

  useEffect(() => {
    if (comments.length > 0) {
      commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [comments.length]);

  const handleEditComment = useCallback(async (commentId: string, newContent: string) => {
    const now = new Date().toISOString();
    setComments(prev => prev.map(c =>
      c.id === commentId ? { ...c, content: newContent, updated_at: now } : c
    ));
    await supabase
      .from('task_comments')
      .update({ content: newContent, updated_at: now })
      .eq('id', commentId);
  }, [supabase]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    setComments(prev => prev.filter(c => c.id !== commentId));
    await supabase.from('task_comments').delete().eq('id', commentId);
  }, [supabase]);

  const autocompleteCandidates = useMemo(() => {
    if (autocompleteMode === null) return [];
    const q = autocompleteQuery.toLowerCase();
    if (autocompleteMode === 'mention') {
      return team
        .filter(m => (m.display_name ?? '').toLowerCase().includes(q))
        .slice(0, 5)
        .map(m => ({ id: m.id, label: m.display_name ?? '', icon: 'user' as const, avatar: m.avatar_url, role: m.role }));
    }
    return docs
      .filter(d => d.title.toLowerCase().includes(q))
      .slice(0, 5)
      .map(d => ({ id: d.id, label: d.title, icon: 'doc' as const }));
  }, [autocompleteMode, autocompleteQuery, team, docs]);

  function detectAutocomplete(value: string) {
    const cursorPos = inputRef.current?.selectionStart ?? value.length;
    const textBeforeCursor = value.slice(0, cursorPos);

    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    if (mentionMatch) {
      setAutocompleteMode('mention');
      setAutocompleteQuery(mentionMatch[1]);
      setAutocompleteIndex(0);
      return;
    }

    const docMatch = textBeforeCursor.match(/#(\w*)$/);
    if (docMatch) {
      setAutocompleteMode('doc');
      setAutocompleteQuery(docMatch[1]);
      setAutocompleteIndex(0);
      return;
    }

    setAutocompleteMode(null);
  }

  function handleInputChange(value: string) {
    setInput(value);
    detectAutocomplete(value);
  }

  function insertAutocomplete(label: string) {
    const cursorPos = inputRef.current?.selectionStart ?? input.length;
    const textBefore = input.slice(0, cursorPos);
    const textAfter = input.slice(cursorPos);
    const trigger = autocompleteMode === 'mention' ? '@' : '#';
    const regex = autocompleteMode === 'mention' ? /@\w*$/ : /#\w*$/;
    const replaced = textBefore.replace(regex, `${trigger}${label} `);
    setInput(replaced + textAfter);
    setAutocompleteMode(null);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (autocompleteMode !== null && autocompleteCandidates.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setAutocompleteIndex(i => (i + 1) % autocompleteCandidates.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setAutocompleteIndex(i => (i - 1 + autocompleteCandidates.length) % autocompleteCandidates.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertAutocomplete(autocompleteCandidates[autocompleteIndex].label); return; }
      if (e.key === 'Escape') { setAutocompleteMode(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return;
    setSending(true);

    const currentProfile = team.find(m => m.id === currentUserId);
    const optimistic: TaskComment = {
      id: crypto.randomUUID(),
      task_id: task.id,
      user_id: currentUserId,
      content: input.trim(),
      created_at: new Date().toISOString(),
      profiles: {
        id: currentUserId,
        display_name: currentProfile?.display_name,
        avatar_url: currentProfile?.avatar_url,
      },
    };
    setComments(prev => [...prev, optimistic]);
    setInput('');

    const { data: inserted } = await supabase.from('task_comments').insert({
      task_id: task.id,
      user_id: currentUserId,
      content: optimistic.content,
    }).select('id').single();

    const realCommentId = inserted?.id ?? optimistic.id;
    if (inserted?.id) {
      setComments(prev => prev.map(c =>
        c.id === optimistic.id ? { ...c, id: inserted.id } : c
      ));
    }
    const senderName = currentProfile?.display_name ?? 'Someone';
    const notifs: { user_id: string; kind: string; title: string; body: string; link: string }[] = [];

    const mentionedTargets = team.filter(m => {
      const dn = m.display_name;
      return dn && optimistic.content.toLowerCase().includes(`@${dn.toLowerCase()}`);
    });
    for (const target of mentionedTargets) {
      if (target.id !== currentUserId) {
        notifs.push({
          user_id: target.id,
          kind: 'mentioned',
          title: 'You were mentioned',
          body: `${senderName} mentioned you in "${task.name}"`,
          link: `/tasks?task=${task.id}&comment=${realCommentId}`,
        });
      }
    }

    const mentionedIds = new Set(notifs.map(n => n.user_id));
    const otherCommenters = new Set(
      comments
        .filter(c => c.user_id !== currentUserId)
        .map(c => c.user_id)
    );
    for (const uid of otherCommenters) {
      if (!mentionedIds.has(uid)) {
        notifs.push({
          user_id: uid,
          kind: 'comment_reply',
          title: 'New reply',
          body: `${senderName} replied in "${task.name}"`,
          link: `/tasks?task=${task.id}&comment=${realCommentId}`,
        });
      }
    }

    if (notifs.length > 0) {
      await supabase.from('notifications').insert(notifs);
    }

    setSending(false);
  }, [input, sending, task.id, currentUserId, team, comments, supabase]);

  const statusCfg = STATUS_DISPLAY[task.status] ?? STATUS_DISPLAY['In Progress'];
  const StatusIcon = statusCfg.icon;
  const originalAssigneeId = 'assignee' in task ? (task as TaskWithAssignee).assignee?.id : task.assignee_id;
  const effectiveAssigneeId = localAssigneeId !== undefined ? localAssigneeId : originalAssigneeId;
  const assignee = localAssigneeId !== undefined
    ? (localAssigneeId ? team.find(m => m.id === localAssigneeId) ?? null : null)
    : ('assignee' in task ? (task as TaskWithAssignee).assignee : null);
  const canHandOff = isAdmin || task.assignee_id === currentUserId || effectiveAssigneeId === currentUserId;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogClose onClose={() => onOpenChange(false)} />
      <DialogHeader>
        <DialogTitle className="pr-8">{task.name}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className={`flex items-center gap-1.5 ${statusCfg.className}`}>
          <StatusIcon className="size-3.5" />
          <span className="text-xs font-medium">{statusCfg.label}</span>
        </div>
        <Badge variant="secondary" className="text-xs">{task.department}</Badge>
        <Badge variant="outline" className="text-xs">{task.priority}</Badge>
        {task.deadline && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground cursor-default" title={task.deadline ? formatLocalTime(task.deadline) : undefined}>
            <Clock className="size-3" />
            <span>{task.deadline}</span>
          </div>
        )}
        {assignee && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Avatar className="size-4">
              <AvatarImage src={assignee.avatar_url ?? undefined} />
              <AvatarFallback className="text-[6px] bg-secondary">{getInitials(assignee.display_name ?? '?')}</AvatarFallback>
            </Avatar>
            <span>{assignee.display_name}</span>
          </div>
        )}
        {canHandOff && (
          <button
            onClick={() => setShowHandoff(true)}
            className="ml-auto flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground border border-border hover:bg-muted/50 hover:text-foreground transition-colors"
          >
            <ArrowRightLeft className="size-3.5" />
            Hand Off
          </button>
        )}
      </div>

      {task.description && (
        <p className="text-sm text-muted-foreground mb-4">{task.description}</p>
      )}

      <Separator />

      <div className="mt-4">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">Comments</h3>
          <span className="text-xs text-muted-foreground">({comments.length})</span>
        </div>

        <div className="max-h-[280px] overflow-y-auto space-y-4 mb-4">
          {loading && comments.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">Loading comments...</p>
          )}
          {!loading && comments.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No comments yet. Start the conversation.</p>
          )}

          <AnimatePresence>
            {comments.map(comment => (
              <CommentItem
                key={comment.id}
                isHighlighted={highlightCommentId === comment.id}
                teamNames={teamNames}
                docTitles={docTitles}
                comment={comment}
                isOwn={comment.user_id === currentUserId}
                onEdit={handleEditComment}
                onDelete={handleDeleteComment}
              />
            ))}
          </AnimatePresence>
          <div ref={commentsEndRef} />
        </div>

        <div className="relative">
          <AnimatePresence>
            {autocompleteMode !== null && autocompleteCandidates.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.1 }}
                className="absolute bottom-full mb-1 left-0 w-full rounded-lg border border-border bg-card shadow-lg z-10 overflow-hidden"
              >
                {autocompleteCandidates.map((candidate, i) => (
                  <button
                    key={candidate.id}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${i === autocompleteIndex ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                    onMouseDown={e => { e.preventDefault(); insertAutocomplete(candidate.label); }}
                    onMouseEnter={() => setAutocompleteIndex(i)}
                  >
                    {candidate.icon === 'user' ? (
                      <Avatar className="size-5">
                        <AvatarImage src={candidate.avatar ?? undefined} />
                        <AvatarFallback className="text-[7px] bg-secondary">{getInitials(candidate.label)}</AvatarFallback>
                      </Avatar>
                    ) : (
                      <FileText className="size-4 text-blue-400" />
                    )}
                    <span className="truncate">{candidate.label}</span>
                    {candidate.icon === 'user' && candidate.role && (
                      <span className="text-xs text-muted-foreground ml-auto">{candidate.role}</span>
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-end gap-2 rounded-lg border border-border bg-muted/30 p-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write a comment... @ to mention, # to link doc"
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none min-h-[36px] max-h-[120px] py-1.5"
              style={{ height: 'auto', overflow: 'hidden' }}
              onInput={e => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                el.style.overflow = el.scrollHeight > 120 ? 'auto' : 'hidden';
              }}
            />
            <Button
              size="icon"
              className="size-8 shrink-0"
              onClick={handleSend}
              disabled={!input.trim() || sending}
            >
              <Send className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {handoffs.length > 0 && (
        <>
          <Separator className="my-4" />
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setHandoffPanelOpen(true)}
              className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
            >
              <ArrowRightLeft className="size-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-foreground">Handoff History</span>
              <span className="text-xs text-muted-foreground">({handoffs.length})</span>
            </button>
          </div>

          <AnimatePresence>
            {handoffPanelOpen && (
              <motion.div
                key="handoff-panel"
                initial={{ opacity: HANDOFF_PANEL.backdropOpacity.closed }}
                animate={{ opacity: HANDOFF_PANEL.backdropOpacity.open }}
                exit={{ opacity: HANDOFF_PANEL.backdropOpacity.closed }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-50"
              >
                <div
                  role="presentation"
                  aria-hidden
                  className="absolute inset-0 bg-black/60"
                  onClick={() => setHandoffPanelOpen(false)}
                />
                <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
                  <motion.div
                    role="dialog"
                    aria-labelledby="handoff-panel-title"
                    aria-modal="true"
                    initial={{
                      opacity: HANDOFF_PANEL.cardOpacity.closed,
                      scale: HANDOFF_PANEL.cardScale.closed,
                    }}
                    animate={{
                      opacity: HANDOFF_PANEL.cardOpacity.open,
                      scale: HANDOFF_PANEL.cardScale.open,
                    }}
                    exit={{
                      opacity: HANDOFF_PANEL.cardOpacity.closed,
                      scale: HANDOFF_PANEL.cardScale.closed,
                    }}
                    transition={HANDOFF_PANEL.spring}
                    className="pointer-events-auto w-full max-w-md max-h-[80vh] flex flex-col rounded-xl border border-border bg-card shadow-xl"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                      <h2 id="handoff-panel-title" className="text-sm font-medium text-foreground flex items-center gap-2">
                        <ArrowRightLeft className="size-4 text-muted-foreground" />
                        Handoff History
                      </h2>
                      <button
                        type="button"
                        onClick={() => setHandoffPanelOpen(false)}
                        className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        aria-label="Close handoff history"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                    <ul className="overflow-y-auto p-4 space-y-2">
                      {handoffs.map((h) => {
                        const fromName = h.from_profile?.display_name ?? 'Unknown';
                        const toName = h.to_profile?.display_name ?? 'Unknown';
                        return (
                          <li key={h.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Avatar className="size-5 shrink-0">
                                  <AvatarImage src={h.from_profile?.avatar_url ?? undefined} />
                                  <AvatarFallback className="text-[7px] bg-secondary">{getInitials(fromName)}</AvatarFallback>
                                </Avatar>
                                <span className="text-xs font-medium text-foreground truncate">{fromName}</span>
                              </div>
                              <ArrowRightLeft className="size-3 text-muted-foreground shrink-0" aria-hidden />
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Avatar className="size-5 shrink-0">
                                  <AvatarImage src={h.to_profile?.avatar_url ?? undefined} />
                                  <AvatarFallback className="text-[7px] bg-secondary">{getInitials(toName)}</AvatarFallback>
                                </Avatar>
                                <span className="text-xs font-medium text-foreground truncate">{toName}</span>
                              </div>
                              <span
                                className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums"
                                title={formatLocalTime(h.created_at)}
                              >
                                {timeAgo(h.created_at)}
                              </span>
                            </div>
                            {h.note && (
                              <div className="mt-2 rounded-r-md border-l-2 border-border bg-muted/30 pl-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap">
                                {h.note}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {isAdmin && (
        <>
          <Separator className="my-4" />
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-3">
              <Package className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-medium text-foreground">Deliverables</h3>
              <span className="text-xs text-muted-foreground">({deliverables.length})</span>
            </div>
            {deliverablesLoading ? (
              <p className="text-xs text-muted-foreground py-3">Loading...</p>
            ) : deliverables.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3">No deliverables uploaded yet.</p>
            ) : (
              <ul className="space-y-2 max-h-32 overflow-y-auto">
                {deliverables.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 text-sm group">
                    <FileText className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">{d.file_name}</span>
                    {d.download_url ? (
                      <a
                        href={d.download_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <Download className="size-3" />
                        Download
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setConfirmingDeliverableId(d.id)}
                      disabled={deletingDeliverableId === d.id}
                      className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                      title="Remove deliverable"
                      aria-label={`Remove ${d.file_name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {confirmingDeliverableId && (() => {
              const d = deliverables.find(x => x.id === confirmingDeliverableId);
              if (!d) return null;
              return (
                <div className="mt-3 rounded-lg border border-border bg-card p-3">
                  <p className="text-sm text-foreground mb-3">
                    Remove <span className="font-medium">{d.file_name}</span>? This can&apos;t be undone.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmingDeliverableId(null)}
                      disabled={deletingDeliverableId === d.id}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        handleDeleteDeliverable(d.id);
                        setConfirmingDeliverableId(null);
                      }}
                      disabled={deletingDeliverableId === d.id}
                    >
                      {deletingDeliverableId === d.id ? 'Removing…' : 'Remove'}
                    </Button>
                  </div>
                </div>
              );
            })()}
          </div>
        </>
      )}
    </Dialog>

    {showHandoff && (
      <HandoffDialog
        task={task}
        team={team}
        currentUserId={currentUserId}
        open={showHandoff}
        onOpenChange={setShowHandoff}
        onHandoffComplete={(toUserId) => {
          setLocalAssigneeId(toUserId);
          loadHandoffs();
        }}
      />
    )}
    </>
  );
}
