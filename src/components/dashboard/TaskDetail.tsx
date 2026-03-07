'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { motion, AnimatePresence, LayoutGroup } from 'motion/react';
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
  Reply,
  Paperclip,
} from 'lucide-react';
import Link from 'next/link';
import { Task, TaskWithAssignee, TaskComment, TaskCommentAttachment, TaskCommentReaction, TaskDeliverable, TaskHandoff, Profile, Doc } from '@/lib/types';
import { toast } from 'sonner';
import { Dialog, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { HandoffDialog } from './HandoffDialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { DURATION_BACKDROP_MS, PANEL_SPRING, PANEL, SLIDEOUT, SLIDEOUT_SPRING } from '@/lib/motion';

const REACTION_EMOJIS = ['👍', '👎', '🎉', '😂', '❓', '🔥', '❤️'];

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

const STATUS_DISPLAY: Record<string, { icon: typeof Circle; label: string; className: string; color: string }> = {
  'Complete':     { icon: CheckCircle2, label: 'Complete',    className: 'text-[var(--color-status-complete)]', color: 'var(--color-status-complete)' },
  'In Progress':  { icon: Timer,        label: 'In Progress', className: 'text-[var(--color-status-progress)]', color: 'var(--color-status-progress)' },
  'In Review':    { icon: AlertCircle,   label: 'In Review',   className: 'text-[var(--color-status-review)]', color: 'var(--color-status-review)' },
  'Blocked':      { icon: Circle,        label: 'Blocked',     className: 'text-[var(--color-status-blocked)]', color: 'var(--color-status-blocked)' },
};

/* Handoff panel: see @/lib/motion for storyboard and PANEL_SPRING. */

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
  isGrouped,
  teamNames,
  docTitles,
  onEdit,
  onDelete,
  onReact,
  onReply,
  allComments,
  currentUserId,
}: {
  comment: TaskComment;
  isOwn: boolean;
  isHighlighted?: boolean;
  isGrouped?: boolean;
  teamNames: string[];
  docTitles: string[];
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onReact: (commentId: string, emoji: string) => void;
  onReply: (comment: TaskComment) => void;
  allComments: TaskComment[];
  currentUserId: string;
}) {
  const highlightRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const reactionPickerRef = useRef<HTMLDivElement>(null);

  const [lightbox, setLightbox] = useState<{ url: string; name: string; type: string } | null>(null);

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

  useEffect(() => {
    if (!showReactionPicker) return;
    function handleClick(e: MouseEvent) {
      if (reactionPickerRef.current && !reactionPickerRef.current.contains(e.target as Node)) {
        setShowReactionPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showReactionPicker]);

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
      className={cn('group relative flex gap-3 rounded-md px-2 -mx-2', isGrouped ? 'py-0 mt-0.5 pl-[44px]' : 'py-1 mt-3 first:mt-0')}
    >
      {!isGrouped && (
        <Avatar className="size-8 shrink-0 mt-0.5">
          <AvatarImage src={avatar ?? undefined} alt={name} />
          <AvatarFallback className="text-[9px] bg-secondary">{getInitials(name)}</AvatarFallback>
        </Avatar>
      )}
      <div className="flex-1 min-w-0">
        {!isGrouped && (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-foreground">{name}</span>
            <span className="font-mono text-[11px] text-muted-foreground cursor-default" title={formatLocalTime(comment.created_at)}>{timeAgo(comment.created_at)}</span>
            {wasEdited && (
              <span className="text-[11px] text-muted-foreground/60 italic">( edited )</span>
            )}
          </div>
        )}
        {isGrouped && wasEdited && (
          <span className="text-[11px] text-muted-foreground/60 italic">( edited )</span>
        )}

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

        {comment.reply_to_id && (() => {
          const parent = allComments.find(c => c.id === comment.reply_to_id);
          const parentName = parent?.profiles?.display_name ?? 'Unknown';
          return (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground/70 mb-0.5">
              <Reply className="size-2.5" />
              <span>replying to <span className="font-medium">{parentName}</span></span>
            </div>
          );
        })()}

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
          <p className="text-sm text-foreground mt-0.5 whitespace-pre-wrap break-words">
            {renderContent(comment.content, teamNames, docTitles)}
          </p>
        )}

        {(comment.attachments ?? []).length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {(comment.attachments ?? []).map(att => {
              const isImage = att.file_type.startsWith('image/');
              const isVideo = att.file_type.startsWith('video/');
              if (isImage) {
                return (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() => setLightbox({ url: att.file_url, name: att.file_name, type: att.file_type })}
                    className="block cursor-zoom-in"
                  >
                    <img
                      src={att.file_url}
                      alt={att.file_name}
                      className="rounded-md border border-border max-w-[200px] max-h-[150px] object-cover hover:opacity-90 transition-opacity"
                    />
                  </button>
                );
              }
              if (isVideo) {
                return (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() => setLightbox({ url: att.file_url, name: att.file_name, type: att.file_type })}
                    className="relative block cursor-pointer group"
                  >
                    <video
                      src={att.file_url}
                      className="rounded-md border border-border max-w-[200px] max-h-[150px] object-cover"
                      muted
                      preload="metadata"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-md group-hover:bg-black/40 transition-colors">
                      <div className="size-8 rounded-full bg-white/90 flex items-center justify-center">
                        <span className="ml-0.5 border-l-[10px] border-l-black border-y-[6px] border-y-transparent" />
                      </div>
                    </div>
                  </button>
                );
              }
              return (
                <a
                  key={att.id}
                  href={att.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
                >
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="truncate max-w-[140px]">{att.file_name}</span>
                  <Download className="size-3 text-muted-foreground" />
                </a>
              );
            })}
          </div>
        )}

        {/* Lightbox */}
        <AnimatePresence>
          {lightbox && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-zoom-out"
              onClick={() => setLightbox(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="relative max-w-[90vw] max-h-[90vh]"
                onClick={e => e.stopPropagation()}
              >
                {lightbox.type.startsWith('video/') ? (
                  <video
                    src={lightbox.url}
                    controls
                    autoPlay
                    className="max-w-[90vw] max-h-[85vh] rounded-lg"
                  />
                ) : (
                  <img
                    src={lightbox.url}
                    alt={lightbox.name}
                    className="max-w-[90vw] max-h-[85vh] rounded-lg object-contain"
                  />
                )}
                <button
                  onClick={() => setLightbox(null)}
                  className="absolute -top-3 -right-3 rounded-full bg-card border border-border p-1.5 text-muted-foreground hover:text-foreground shadow-lg transition-colors"
                >
                  <X className="size-4" />
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reactions row */}
        {!editing && (
          <div className="flex items-center gap-1 mt-2.5 flex-wrap">
            {/* Grouped existing reactions */}
            {Object.entries(
              (comment.reactions ?? []).reduce<Record<string, { count: number; hasOwn: boolean }>>((acc, r) => {
                if (!acc[r.emoji]) acc[r.emoji] = { count: 0, hasOwn: false };
                acc[r.emoji].count++;
                if (r.user_id === currentUserId) acc[r.emoji].hasOwn = true;
                return acc;
              }, {})
            ).map(([emoji, { count, hasOwn }]) => (
              <button
                key={emoji}
                onClick={() => onReact(comment.id, emoji)}
                className={cn(
                  'group/pill inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
                  hasOwn
                    ? 'border-foreground/20 bg-foreground/10 text-foreground'
                    : 'border-border text-muted-foreground hover:border-foreground/20'
                )}
              >
                {hasOwn && (
                  <X className="size-2.5 text-muted-foreground opacity-0 group-hover/pill:opacity-100 transition-opacity -ml-0.5" />
                )}
                <span>{emoji}</span>
                <span className="tabular-nums">{count}</span>
              </button>
            ))}

            {/* Add reaction button — click to toggle picker */}
            <div className="relative" ref={reactionPickerRef}>
              <button
                onClick={() => setShowReactionPicker(v => !v)}
                className="inline-flex items-center justify-center size-6 rounded-full border border-transparent text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:border-border hover:text-muted-foreground transition-all text-xs"
              >
                +
              </button>
              <AnimatePresence>
                {showReactionPicker && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.95 }}
                    transition={{ duration: 0.1 }}
                    className="absolute bottom-full left-0 mb-1 flex gap-1 rounded-lg border border-border bg-card p-1.5 shadow-lg z-10"
                  >
                    {REACTION_EMOJIS.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => { onReact(comment.id, emoji); setShowReactionPicker(false); }}
                        className="rounded p-1 text-sm hover:bg-muted transition-colors"
                      >
                        {emoji}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      {/* Hover actions — overlay top-right of message row */}
      {!editing && !confirmingDelete && (
        <div className="absolute top-0.5 right-1 flex items-center gap-0.5 rounded-md border border-border bg-card px-0.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-sm">
          <button onClick={() => onReply(comment)} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors" title="Reply"><Reply className="size-3" /></button>
          {isOwn && (
            <>
              <button onClick={() => { setEditText(comment.content); setEditing(true); }} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors" title="Edit"><Pencil className="size-3" /></button>
              <button onClick={() => setConfirmingDelete(true)} className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Delete"><Trash2 className="size-3" /></button>
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}

type AutocompleteMode = 'mention' | 'doc' | 'slash' | null;

const SLASH_COMMANDS = [
  { cmd: '/in progress', label: 'In Progress', icon: Timer, className: 'text-[var(--color-status-progress)]' },
  { cmd: '/in review', label: 'In Review', icon: AlertCircle, className: 'text-[var(--color-status-review)]' },
  { cmd: '/complete', label: 'Complete', icon: CheckCircle2, className: 'text-[var(--color-status-complete)]' },
  { cmd: '/blocked', label: 'Blocked', icon: Circle, className: 'text-[var(--color-status-blocked)]' },
];

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
  const isDesktop = useMediaQuery('(min-width: 768px)');

  // Escape key handler for desktop slide-out
  useEffect(() => {
    if (!open || !isDesktop) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, isDesktop, onOpenChange]);

  // Lock body scroll when desktop slide-out is open
  useEffect(() => {
    if (!open || !isDesktop) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open, isDesktop]);

  const [activeTab, setActiveTab] = useState<'details' | 'chat'>('details');
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
  const [replyTo, setReplyTo] = useState<TaskComment | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
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
      .select('*, profiles(id, display_name, avatar_url), task_comment_reactions(id, emoji, user_id), task_comment_attachments(id, file_url, file_name, file_type, file_size)')
      .eq('task_id', task.id)
      .order('created_at', { ascending: true });
    setComments((data ?? []).map((c: Record<string, unknown>) => ({
      ...c,
      reactions: c.task_comment_reactions ?? [],
      attachments: c.task_comment_attachments ?? [],
    })) as TaskComment[]);
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
            .select('*, profiles(id, display_name, avatar_url), task_comment_reactions(id, emoji, user_id), task_comment_attachments(id, file_url, file_name, file_type, file_size)')
            .eq('id', incoming.id)
            .single()
            .then(({ data }) => {
              if (data && isMounted) {
                const d = data as Record<string, unknown>;
                const mapped = { ...data, reactions: d.task_comment_reactions ?? [], attachments: d.task_comment_attachments ?? [] } as TaskComment;
                setComments(prev => [...prev, mapped]);
              }
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

  const handleToggleReaction = useCallback(async (commentId: string, emoji: string) => {
    const existing = comments
      .find(c => c.id === commentId)
      ?.reactions?.find(r => r.emoji === emoji && r.user_id === currentUserId);

    if (existing) {
      // Remove reaction (optimistic)
      setComments(prev => prev.map(c =>
        c.id === commentId
          ? { ...c, reactions: (c.reactions ?? []).filter(r => r.id !== existing.id) }
          : c
      ));
      await supabase.from('task_comment_reactions').delete().eq('id', existing.id);
    } else {
      // Add reaction (optimistic)
      const optimistic: TaskCommentReaction = {
        id: crypto.randomUUID(),
        comment_id: commentId,
        user_id: currentUserId,
        emoji,
        created_at: new Date().toISOString(),
      };
      setComments(prev => prev.map(c =>
        c.id === commentId
          ? { ...c, reactions: [...(c.reactions ?? []), optimistic] }
          : c
      ));
      const { data } = await supabase.from('task_comment_reactions').insert({
        comment_id: commentId,
        user_id: currentUserId,
        emoji,
      }).select('id').single();
      if (data) {
        setComments(prev => prev.map(c =>
          c.id === commentId
            ? { ...c, reactions: (c.reactions ?? []).map(r => r.id === optimistic.id ? { ...r, id: data.id } : r) }
            : c
        ));
      }
    }
  }, [comments, currentUserId, supabase]);

  const autocompleteCandidates = useMemo(() => {
    if (autocompleteMode === null) return [];
    const q = autocompleteQuery.toLowerCase();
    if (autocompleteMode === 'slash') {
      return SLASH_COMMANDS
        .filter(c => c.label.toLowerCase().includes(q) || c.cmd.toLowerCase().includes('/' + q))
        .map(c => ({ id: c.cmd, label: c.label, icon: 'slash' as const, cmd: c.cmd, slashIcon: c.icon, slashClassName: c.className }));
    }
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

    // Slash commands (admin only) — match `/` at start of input
    if (isAdmin) {
      const slashMatch = textBeforeCursor.match(/^\/(.*)$/i);
      if (slashMatch) {
        setAutocompleteMode('slash');
        setAutocompleteQuery(slashMatch[1]);
        setAutocompleteIndex(0);
        return;
      }
    }

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

  function insertAutocomplete(label: string, candidateId?: string) {
    // For slash commands, fill the full command and auto-send
    if (autocompleteMode === 'slash' && candidateId) {
      setInput(candidateId); // e.g. "/in review"
      setAutocompleteMode(null);
      // Auto-execute the slash command
      setTimeout(async () => {
        const handled = await handleSlashCommand(candidateId);
        if (handled) setInput('');
      }, 0);
      return;
    }

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
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); const c = autocompleteCandidates[autocompleteIndex]; insertAutocomplete(c.label, c.id); return; }
      if (e.key === 'Escape') { setAutocompleteMode(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  const handleSlashCommand = useCallback(async (command: string): Promise<boolean> => {
    if (!isAdmin) return false;
    const cmd = command.toLowerCase().trim();
    const statusMap: Record<string, string> = {
      '/complete': 'Complete',
      '/done': 'Complete',
      '/in progress': 'In Progress',
      '/progress': 'In Progress',
      '/in review': 'In Review',
      '/review': 'In Review',
      '/blocked': 'Blocked',
      '/block': 'Blocked',
    };
    const newStatus = statusMap[cmd];
    if (!newStatus) return false;
    await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id);
    toast.success(`Status changed to ${newStatus}`);
    return true;
  }, [isAdmin, task.id, supabase]);

  const handleSend = useCallback(async () => {
    if ((!input.trim() && pendingFiles.length === 0) || sending) return;

    // Check for slash commands (admin only)
    if (input.trim().startsWith('/') && pendingFiles.length === 0) {
      const handled = await handleSlashCommand(input.trim());
      if (handled) {
        setInput('');
        return;
      }
    }

    setSending(true);

    const currentProfile = team.find(m => m.id === currentUserId);
    const optimistic: TaskComment = {
      id: crypto.randomUUID(),
      task_id: task.id,
      user_id: currentUserId,
      content: input.trim(),
      created_at: new Date().toISOString(),
      reply_to_id: replyTo?.id,
      profiles: {
        id: currentUserId,
        display_name: currentProfile?.display_name,
        avatar_url: currentProfile?.avatar_url,
      },
    };
    setComments(prev => [...prev, optimistic]);
    setInput('');
    setReplyTo(null);

    const { data: inserted } = await supabase.from('task_comments').insert({
      task_id: task.id,
      user_id: currentUserId,
      content: optimistic.content,
      reply_to_id: replyTo?.id ?? null,
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

    // Upload pending files
    if (pendingFiles.length > 0) {
      for (const file of pendingFiles) {
        const form = new FormData();
        form.append('file', file);
        form.append('comment_id', realCommentId);
        await fetch(`/api/tasks/${task.id}/comments/attachments`, { method: 'POST', body: form });
      }
      setPendingFiles([]);
      // Reload comments to get attachment data
      loadComments();
    }

    setSending(false);
  }, [input, sending, task.id, currentUserId, team, comments, supabase, replyTo, pendingFiles, loadComments, handleSlashCommand]);

  const statusCfg = STATUS_DISPLAY[task.status] ?? STATUS_DISPLAY['In Progress'];
  const StatusIcon = statusCfg.icon;
  const originalAssigneeId = 'assignee' in task ? (task as TaskWithAssignee).assignee?.id : task.assignee_id;
  const effectiveAssigneeId = localAssigneeId !== undefined ? localAssigneeId : originalAssigneeId;
  const assignee = localAssigneeId !== undefined
    ? (localAssigneeId ? team.find(m => m.id === localAssigneeId) ?? null : null)
    : ('assignee' in task ? (task as TaskWithAssignee).assignee : null);
  const canHandOff = isAdmin || task.assignee_id === currentUserId || effectiveAssigneeId === currentUserId;

  const detailsContent = (
    <>
      {/* Metadata row */}
      <div className="rounded-lg bg-muted/40 px-3.5 py-3 mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Priority</span>
            <Badge variant="outline" className="text-xs">{task.priority}</Badge>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Dept</span>
            <Badge variant="secondary" className="text-xs">{task.department}</Badge>
          </div>
          {task.deadline && (
            <>
              <div className="w-px h-4 bg-border" />
              <div className="flex items-center gap-1.5 cursor-default" title={formatLocalTime(task.deadline)}>
                <Clock className="size-3 text-muted-foreground" />
                <span className="text-xs text-foreground">{new Date(task.deadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      {canHandOff && (
        <button
          onClick={() => setShowHandoff(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors mb-4"
        >
          <ArrowRightLeft className="size-3.5" />
          Hand Off Task
        </button>
      )}

      {/* Description */}
      {task.description ? (
        <div className="mb-4">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">Description</span>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{task.description}</p>
        </div>
      ) : (
        <div className="mb-4 py-4 text-center">
          <p className="text-xs text-muted-foreground/40">No description added</p>
        </div>
      )}

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
                initial={{ opacity: PANEL.backdropOpacity.closed }}
                animate={{ opacity: PANEL.backdropOpacity.open }}
                exit={{ opacity: PANEL.backdropOpacity.closed }}
                transition={{ duration: DURATION_BACKDROP_MS / 1000 }}
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
                      opacity: PANEL.cardOpacity.closed,
                      scale: PANEL.cardScale.closed,
                    }}
                    animate={{
                      opacity: PANEL.cardOpacity.open,
                      scale: PANEL.cardScale.open,
                    }}
                    exit={{
                      opacity: PANEL.cardOpacity.closed,
                      scale: PANEL.cardScale.closed,
                    }}
                    transition={PANEL_SPRING}
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
                                className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums"
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
    </>
  );

  const chatMessages = (
    <>
      {loading && comments.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">Loading comments...</p>
      )}
      {!loading && comments.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="rounded-full bg-muted/60 p-3">
            <MessageSquare className="size-5 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-muted-foreground">No messages yet</p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">Start the conversation below</p>
          </div>
        </div>
      )}

      <AnimatePresence>
        {comments.map((comment, idx) => {
          const prev = idx > 0 ? comments[idx - 1] : null;
          const isGrouped = prev
            && prev.user_id === comment.user_id
            && !comment.reply_to_id
            && (new Date(comment.created_at).getTime() - new Date(prev.created_at).getTime()) < 5 * 60 * 1000;
          return (
            <CommentItem
              key={comment.id}
              isHighlighted={highlightCommentId === comment.id}
              isGrouped={!!isGrouped}
              teamNames={teamNames}
              docTitles={docTitles}
              comment={comment}
              isOwn={comment.user_id === currentUserId}
              onEdit={handleEditComment}
              onDelete={handleDeleteComment}
              onReact={handleToggleReaction}
              onReply={setReplyTo}
              allComments={comments}
              currentUserId={currentUserId}
            />
          );
        })}
      </AnimatePresence>
      <div ref={commentsEndRef} />
    </>
  );

  const chatCompose = (
    <div className="relative">
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 bg-muted/30 px-4 py-2.5 overflow-hidden"
          >
            <Reply className="size-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Replying to <span className="font-medium text-foreground">{replyTo.profiles?.display_name ?? 'Unknown'}</span>
            </span>
            <button
              onClick={() => setReplyTo(null)}
              className="ml-auto rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {autocompleteMode !== null && autocompleteCandidates.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.1 }}
            className="absolute bottom-full mb-1 left-0 w-full rounded-lg border border-border bg-card shadow-lg z-10 overflow-hidden"
          >
            {autocompleteCandidates.map((candidate, i) => {
              const SlashIcon = candidate.icon === 'slash' && 'slashIcon' in candidate ? candidate.slashIcon as typeof Circle : null;
              return (
                <button
                  key={candidate.id}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${i === autocompleteIndex ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                  onMouseDown={e => { e.preventDefault(); insertAutocomplete(candidate.label, candidate.id); }}
                  onMouseEnter={() => setAutocompleteIndex(i)}
                >
                  {candidate.icon === 'slash' && SlashIcon ? (
                    <SlashIcon className={`size-4 ${'slashClassName' in candidate ? candidate.slashClassName as string : ''}`} />
                  ) : candidate.icon === 'user' ? (
                    <Avatar className="size-5">
                      <AvatarImage src={candidate.avatar ?? undefined} />
                      <AvatarFallback className="text-[7px] bg-secondary">{getInitials(candidate.label)}</AvatarFallback>
                    </Avatar>
                  ) : (
                    <FileText className="size-4 text-blue-400" />
                  )}
                  <span className="truncate">{candidate.label}</span>
                  {candidate.icon === 'slash' && 'cmd' in candidate && (
                    <span className="text-xs text-muted-foreground/50 ml-auto font-mono">{candidate.cmd as string}</span>
                  )}
                  {candidate.icon === 'user' && candidate.role && (
                    <span className="text-xs text-muted-foreground ml-auto">{candidate.role}</span>
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-2 py-2">
          {pendingFiles.map((file, i) => (
            <div key={i} className="flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs">
              <Paperclip className="size-3 text-muted-foreground" />
              <span className="truncate max-w-[120px]">{file.name}</span>
              <button
                onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 rounded-lg bg-muted/20 p-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write a message..."
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
        <label className="cursor-pointer rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0">
          <Paperclip className="size-4" />
          <input
            type="file"
            multiple
            className="hidden"
            onChange={e => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) setPendingFiles(prev => [...prev, ...files]);
              e.target.value = '';
            }}
          />
        </label>
        <Button
          size="icon"
          className={cn('size-8 shrink-0 transition-colors', (input.trim() || pendingFiles.length > 0) && !sending ? 'bg-seeko-accent text-black hover:bg-seeko-accent/90' : '')}
          onClick={handleSend}
          disabled={!input.trim() && pendingFiles.length === 0 || sending}
        >
          <Send className="size-3.5" />
        </Button>
      </div>
    </div>
  );

  const tabBar = (
    <LayoutGroup>
      <div className="flex gap-1 px-6 py-1.5 shrink-0 border-b border-border">
        <button
          className={cn(
            'relative rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
            activeTab === 'details' ? 'text-seeko-accent' : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setActiveTab('details')}
        >
          {activeTab === 'details' && (
            <motion.div
              className="absolute inset-0 rounded-lg bg-muted"
              layoutId="tab-highlight"
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            />
          )}
          <span className="relative">Details</span>
        </button>
        <button
          className={cn(
            'relative rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
            activeTab === 'chat' ? 'text-seeko-accent' : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setActiveTab('chat')}
        >
          {activeTab === 'chat' && (
            <motion.div
              className="absolute inset-0 rounded-lg bg-muted"
              layoutId="tab-highlight"
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            />
          )}
          <span className="relative">Chat</span>
          <span className="relative ml-1.5 text-xs text-muted-foreground">({comments.length})</span>
        </button>
      </div>
    </LayoutGroup>
  );

  return (
    <>
      <AnimatePresence>
        {open && (
          /* Centered card modal */
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => onOpenChange(false)}
            />
            <motion.div
              className="relative w-full rounded-xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden"
              initial={{ opacity: 0, scale: 0.95, y: 10, maxWidth: 576, maxHeight: '70vh' }}
              animate={{
                opacity: 1,
                scale: 1,
                y: 0,
                maxWidth: activeTab === 'chat' ? 820 : 576,
                maxHeight: activeTab === 'chat' ? '92vh' : '70vh',
              }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{
                type: 'spring', stiffness: 400, damping: 34,
                opacity: { duration: 0.12 },
              }}
            >
              {/* Header */}
              <div className="flex items-start gap-3 px-6 pt-5 pb-3 shrink-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-xl font-semibold text-foreground truncate">{task.name}</h2>
                    <div
                      className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium shrink-0"
                      style={{ color: statusCfg.color, borderColor: `color-mix(in srgb, ${statusCfg.color} 25%, transparent)`, backgroundColor: `color-mix(in srgb, ${statusCfg.color} 10%, transparent)` }}
                    >
                      <StatusIcon className="size-3" />
                      {statusCfg.label}
                    </div>
                  </div>
                  {assignee && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Avatar className="size-5">
                        <AvatarImage src={assignee.avatar_url ?? undefined} />
                        <AvatarFallback className="text-[7px] bg-secondary">{getInitials(assignee.display_name ?? '?')}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-muted-foreground">{assignee.display_name}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => onOpenChange(false)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                >
                  <X className="size-4" />
                  <span className="sr-only">Close</span>
                </button>
              </div>

              {/* Tab bar */}
              {tabBar}

              {/* Tab content */}
              <AnimatePresence mode="wait" initial={false}>
                {activeTab === 'details' && (
                  <motion.div key="details" className="flex-1 overflow-y-auto px-6 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ type: 'spring', stiffness: 500, damping: 35, opacity: { duration: 0.12 } }}>
                    {detailsContent}
                  </motion.div>
                )}
                {activeTab === 'chat' && (
                  <motion.div
                    key="chat"
                    className={cn('flex flex-1 flex-col overflow-hidden', isDragging && 'ring-2 ring-inset ring-seeko-accent/50')}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 35, opacity: { duration: 0.12 } }}
                    onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={e => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
                    }}
                    onDrop={e => {
                      e.preventDefault();
                      setIsDragging(false);
                      const files = Array.from(e.dataTransfer.files);
                      if (files.length > 0) setPendingFiles(prev => [...prev, ...files]);
                    }}
                  >
                    <div className="flex-1 overflow-y-auto px-6 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {chatMessages}
                    </div>
                    <div className="shrink-0 border-t border-border px-5 py-3">
                      {chatCompose}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
