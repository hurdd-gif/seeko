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
} from 'lucide-react';
import { Task, TaskWithAssignee, TaskComment, Profile } from '@/lib/types';
import { Dialog, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
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

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
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

function renderContent(text: string): React.ReactNode[] {
  const parts = text.split(/(@\w[\w\s]*?\b)/g);
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className="rounded bg-seeko-accent/15 px-1 py-0.5 text-seeko-accent font-medium">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

interface TaskDetailProps {
  task: Task | TaskWithAssignee;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: Profile[];
  currentUserId: string;
}

export function TaskDetail({ task, open, onOpenChange, team, currentUserId }: TaskDetailProps) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

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

  useEffect(() => {
    if (comments.length > 0) {
      commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [comments.length]);

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return team.filter(m => (m.display_name ?? '').toLowerCase().includes(q)).slice(0, 5);
  }, [mentionQuery, team]);

  function handleInputChange(value: string) {
    setInput(value);

    const cursorPos = inputRef.current?.selectionStart ?? value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const match = textBeforeCursor.match(/@(\w*)$/);

    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }

  function insertMention(name: string) {
    const cursorPos = inputRef.current?.selectionStart ?? input.length;
    const textBefore = input.slice(0, cursorPos);
    const textAfter = input.slice(cursorPos);
    const replaced = textBefore.replace(/@\w*$/, `@${name} `);
    setInput(replaced + textAfter);
    setMentionQuery(null);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (mentionQuery !== null && mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(i => (i + 1) % mentionCandidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i => (i - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionCandidates[mentionIndex].display_name ?? '');
        return;
      }
      if (e.key === 'Escape') {
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
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

    await supabase.from('task_comments').insert({
      task_id: task.id,
      user_id: currentUserId,
      content: optimistic.content,
    });

    setSending(false);
  }, [input, sending, task.id, currentUserId, team, supabase]);

  const statusCfg = STATUS_DISPLAY[task.status] ?? STATUS_DISPLAY['In Progress'];
  const StatusIcon = statusCfg.icon;
  const assignee = 'assignee' in task ? (task as TaskWithAssignee).assignee : null;

  return (
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
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
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
            {comments.map(comment => {
              const prof = comment.profiles;
              const name = prof?.display_name ?? 'Unknown';
              const avatar = prof?.avatar_url;

              return (
                <motion.div
                  key={comment.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex gap-3"
                >
                  <Avatar className="size-7 shrink-0 mt-0.5">
                    <AvatarImage src={avatar ?? undefined} alt={name} />
                    <AvatarFallback className="text-[8px] bg-secondary">{getInitials(name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-foreground">{name}</span>
                      <span className="text-[11px] text-muted-foreground">{timeAgo(comment.created_at)}</span>
                    </div>
                    <p className="text-sm text-foreground/80 mt-0.5 whitespace-pre-wrap break-words">
                      {renderContent(comment.content)}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          <div ref={commentsEndRef} />
        </div>

        <div className="relative">
          <AnimatePresence>
            {mentionQuery !== null && mentionCandidates.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.1 }}
                className="absolute bottom-full mb-1 left-0 w-full rounded-lg border border-border bg-card shadow-lg z-10 overflow-hidden"
              >
                {mentionCandidates.map((member, i) => (
                  <button
                    key={member.id}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${i === mentionIndex ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                    onMouseDown={e => { e.preventDefault(); insertMention(member.display_name ?? ''); }}
                    onMouseEnter={() => setMentionIndex(i)}
                  >
                    <Avatar className="size-5">
                      <AvatarImage src={member.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[7px] bg-secondary">{getInitials(member.display_name ?? '?')}</AvatarFallback>
                    </Avatar>
                    <span>{member.display_name}</span>
                    {member.role && <span className="text-xs text-muted-foreground ml-auto">{member.role}</span>}
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
              placeholder="Write a comment... Type @ to mention"
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
    </Dialog>
  );
}
