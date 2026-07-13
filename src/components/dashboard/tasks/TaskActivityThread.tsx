/* ─────────────────────────────────────────────────────────
 * TaskActivityThread — the full-page detail's merged Activity feed.
 *
 * Linear-style single timeline (Figma node 4:4930): the composer card
 * rides directly under the title card (user call 2026-07-11), then
 * activity events render as light rows and comments as white cards,
 * oldest first. Frameless on the paper canvas — unlike the rail's
 * boxed RailSection, comments ARE the cards here.
 *
 *   ┌────────────────────────────────┐
 *   │ Leave a comment…       📎  ↑   │      ← composer card (under title card)
 *   └────────────────────────────────┘
 *   Activity
 *   ○ d created this task · 8w ago          ← event row (ActivityEventRow)
 *   ┌────────────────────────────────┐
 *   │ ◉ d · 8w ago                   │      ← comment card
 *   │ body with @mention chips        │
 *   │ [attachments] [reactions]       │
 *   └────────────────────────────────┘
 *   ○ d added to milestone · 8w ago
 *
 * Writes go through comment-store (API seam) — never the browser Supabase
 * client. Realtime keeps the thread live in prod (dev has no browser
 * session, so the server-loaded snapshot is what you get there).
 * ───────────────────────────────────────────────────────── */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { subscribeToTable, type SupabaseLike } from '@/lib/realtime';
import {
  createComment,
  deleteComment as deleteCommentApi,
  updateComment as updateCommentApi,
  toggleReaction as toggleReactionApi,
} from '@/lib/comment-store';
import type { Profile, TaskActivity, TaskComment } from '@/lib/types';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  ActivityEventRow,
  formatTimeAgo,
  initials,
} from './ActivitySection';
import { buildFeed } from './task-feed';
import {
  Paperclip,
  ArrowUp,
  SmilePlus,
  Pencil,
  Trash2,
  X,
  FileText,
  MessageSquare,
} from 'lucide-react';

const REACTION_EMOJIS = ['👍', '👎', '🎉', '😂', '❓', '🔥', '❤️'];

const TASK_COMMENT_SELECT =
  '*, profiles(id, display_name, avatar_url), task_comment_reactions(id, emoji, user_id), task_comment_attachments(id, file_url, file_name, file_type, file_size)';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Body text with @mention chips — ported from the legacy sheet's renderContent. */
function renderContent(text: string, teamNames: string[]): React.ReactNode {
  const alts = teamNames
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex);
  if (!alts.length) return text;
  const parts = text.split(new RegExp(`(@(?:${alts.join('|')}))`, 'gi'));
  return parts.map((seg, i) => {
    if (seg.startsWith('@') && alts.some((a) => new RegExp(`^${a}$`, 'i').test(seg.slice(1)))) {
      return (
        <span
          key={i}
          className="rounded bg-seeko-accent/15 px-1 py-0.5 font-medium text-seeko-accent"
        >
          {seg}
        </span>
      );
    }
    return <span key={i}>{seg}</span>;
  });
}

function normalizeComment(row: Record<string, unknown>): TaskComment {
  return {
    ...row,
    reactions: (row.task_comment_reactions as TaskComment['reactions']) ?? [],
    attachments: (row.task_comment_attachments as TaskComment['attachments']) ?? [],
  } as unknown as TaskComment;
}

export function TaskActivityThread({
  taskId,
  activity,
  comments: initialComments,
  team,
  currentUserId,
  isAdmin = false,
}: {
  taskId: string;
  activity: TaskActivity[];
  comments: TaskComment[];
  team: Profile[];
  currentUserId: string;
  isAdmin?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [comments, setComments] = useState<TaskComment[]>(initialComments);
  const commentsRef = useRef(comments);
  commentsRef.current = comments;

  const teamNames = useMemo(
    () => team.map((m) => m.display_name).filter(Boolean) as string[],
    [team],
  );
  const nameById = useMemo(
    () => new Map(team.map((p) => [p.id, p.display_name])),
    [team],
  );
  const resolveName = useCallback(
    (id: string) => nameById.get(id) || undefined,
    [nameById],
  );
  const currentProfile = useMemo(
    () => team.find((p) => p.id === currentUserId),
    [team, currentUserId],
  );

  /* ── Realtime: keep the thread live for other viewers (prod only) ── */
  useEffect(() => {
    const refetchComment = async (id: string) => {
      const { data } = await supabase
        .from('task_comments')
        .select(TASK_COMMENT_SELECT)
        .eq('id', id)
        .maybeSingle();
      if (!data) return;
      const full = normalizeComment(data as Record<string, unknown>);
      setComments((prev) =>
        prev.some((c) => c.id === full.id)
          ? prev.map((c) => (c.id === full.id ? full : c))
          : [...prev, full],
      );
    };

    return subscribeToTable(supabase as unknown as SupabaseLike, `task-comments-${taskId}`, [
      {
        event: 'INSERT',
        table: 'task_comments',
        filter: `task_id=eq.${taskId}`,
        handler: ({ new: row }) => {
          const id = (row as { id?: string })?.id;
          // Own inserts already landed via the API response.
          if (id && !commentsRef.current.some((c) => c.id === id)) void refetchComment(id);
        },
      },
      {
        event: 'UPDATE',
        table: 'task_comments',
        filter: `task_id=eq.${taskId}`,
        handler: ({ new: row }) => {
          const id = (row as { id?: string })?.id;
          if (id) void refetchComment(id);
        },
      },
      {
        event: 'DELETE',
        table: 'task_comments',
        handler: ({ old: row }) => {
          const id = (row as { id?: string })?.id;
          if (id) setComments((prev) => prev.filter((c) => c.id !== id));
        },
      },
    ]);
  }, [supabase, taskId]);

  const handlePosted = useCallback((comment: TaskComment) => {
    setComments((prev) =>
      prev.some((c) => c.id === comment.id) ? prev : [...prev, comment],
    );
  }, []);

  const handleUpdated = useCallback((id: string, patch: Partial<TaskComment>) => {
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const feed = useMemo(() => buildFeed(activity, comments), [activity, comments]);

  return (
    <section aria-label="Activity">
      {/* Composer rides directly under the title card; the feed reads below it. */}
      <CommentComposer
        taskId={taskId}
        currentUserId={currentUserId}
        currentProfile={currentProfile}
        onPosted={handlePosted}
      />

      <h2 className="mt-8 text-[14px] font-medium tracking-[-0.01em] text-ink-title">Activity</h2>

      {feed.length === 0 ? (
        <div className="mt-4 flex items-center gap-2 text-[12.5px] text-ink-faint">
          <MessageSquare className="size-3.5" />
          <span>No activity yet.</span>
        </div>
      ) : (
        <ol className="mt-4 flex flex-col gap-3">
          {feed.map((item) =>
            item.type === 'event' ? (
              <ActivityEventRow
                key={`e-${item.event.id}`}
                activity={item.event}
                resolveName={resolveName}
                showActorName
              />
            ) : (
              <li key={`c-${item.comment.id}`}>
                <CommentCard
                  comment={item.comment}
                  taskId={taskId}
                  teamNames={teamNames}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                  onUpdated={handleUpdated}
                  onDeleted={handleDeleted}
                />
              </li>
            ),
          )}
        </ol>
      )}

    </section>
  );
}

/* ── Comment card ─────────────────────────────────────────── */

function CommentCard({
  comment,
  taskId,
  teamNames,
  currentUserId,
  isAdmin,
  onUpdated,
  onDeleted,
}: {
  comment: TaskComment;
  taskId: string;
  teamNames: string[];
  currentUserId: string;
  isAdmin: boolean;
  onUpdated: (id: string, patch: Partial<TaskComment>) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const own = comment.user_id === currentUserId;
  const authorName = comment.profiles?.display_name ?? 'Teammate';
  const edited = Boolean(
    comment.updated_at &&
      new Date(comment.updated_at).getTime() - new Date(comment.created_at).getTime() > 60_000,
  );

  useEffect(() => {
    if (!pickerOpen) return;
    const close = (e: PointerEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [pickerOpen]);

  const saveEdit = async () => {
    const next = draft.trim();
    if (!next || next === comment.content) {
      setEditing(false);
      setDraft(comment.content);
      return;
    }
    // Optimistic: the card re-renders immediately, API failure reverts.
    const prev = comment.content;
    onUpdated(comment.id, { content: next, updated_at: new Date().toISOString() });
    setEditing(false);
    const res = await updateCommentApi(taskId, comment.id, next);
    if (!res.ok) onUpdated(comment.id, { content: prev });
  };

  const remove = async () => {
    onDeleted(comment.id);
    await deleteCommentApi(taskId, comment.id);
  };

  const react = async (emoji: string) => {
    setPickerOpen(false);
    const mine = (comment.reactions ?? []).find(
      (r) => r.user_id === currentUserId && r.emoji === emoji,
    );
    // Optimistic toggle mirroring the server's on/off semantics.
    const nextReactions = mine
      ? (comment.reactions ?? []).filter((r) => r.id !== mine.id)
      : [
          ...(comment.reactions ?? []),
          {
            id: `temp-${Date.now()}`,
            comment_id: comment.id,
            user_id: currentUserId,
            emoji,
            created_at: new Date().toISOString(),
          },
        ];
    const prev = comment.reactions ?? [];
    onUpdated(comment.id, { reactions: nextReactions });
    const res = await toggleReactionApi(taskId, comment.id, emoji);
    if (!res.ok) onUpdated(comment.id, { reactions: prev });
  };

  // Group reactions: emoji → user ids (for the count chips under the body).
  const reactionGroups = useMemo(() => {
    const groups = new Map<string, { count: number; mine: boolean }>();
    for (const r of comment.reactions ?? []) {
      const g = groups.get(r.emoji) ?? { count: 0, mine: false };
      g.count += 1;
      if (r.user_id === currentUserId) g.mine = true;
      groups.set(r.emoji, g);
    }
    return [...groups.entries()];
  }, [comment.reactions, currentUserId]);

  const images = (comment.attachments ?? []).filter((a) => a.file_type?.startsWith('image/'));
  const files = (comment.attachments ?? []).filter((a) => !a.file_type?.startsWith('image/'));

  return (
    <article className="group relative rounded-xl bg-surface-1 px-4 py-3.5 shadow-seeko">
      {/* Header: avatar + name + time (+ edited) + hover actions */}
      <header className="flex items-center gap-2">
        <Avatar className="size-[18px] ring-1 ring-wash-4">
          <AvatarImage src={comment.profiles?.avatar_url ?? undefined} alt={authorName} />
          <AvatarFallback
            hash={comment.user_id}
            className="text-[7px] font-medium text-ink-body"
          >
            {initials(authorName)}
          </AvatarFallback>
        </Avatar>
        <span className="text-[13px] font-medium tracking-[-0.01em] text-ink-title">
          {authorName}
        </span>
        <span className="text-[12px] text-[#a8a8a8] dark:text-ink-muted">{formatTimeAgo(comment.created_at)}</span>
        {edited && <span className="text-[12px] text-ink-faintest">(edited)</span>}

        <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
            <div className="relative" ref={pickerRef}>
              <button
                type="button"
                aria-label="Add reaction"
                onClick={() => setPickerOpen((v) => !v)}
                className="flex size-7 items-center justify-center rounded-md text-ink-faint transition-[background-color,color,scale] duration-150 ease-out hover:bg-wash-4 hover:text-ink active:scale-[0.96]"
              >
                <SmilePlus className="size-3.5" />
              </button>
              {pickerOpen && (
                <div className="absolute right-0 top-8 z-10 flex items-center gap-0.5 rounded-[10px] bg-surface-1 p-1 shadow-seeko">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => void react(emoji)}
                      className="flex size-7 items-center justify-center rounded-md text-[14px] transition-[background-color,scale] duration-150 ease-out hover:bg-wash-4 active:scale-[0.96]"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {own && (
              <button
                type="button"
                aria-label="Edit comment"
                onClick={() => {
                  setDraft(comment.content);
                  setEditing(true);
                }}
                className="flex size-7 items-center justify-center rounded-md text-ink-faint transition-[background-color,color,scale] duration-150 ease-out hover:bg-wash-4 hover:text-ink active:scale-[0.96]"
              >
                <Pencil className="size-3.5" />
              </button>
            )}
            {(own || isAdmin) && (
              <button
                type="button"
                aria-label="Delete comment"
                onClick={() => void remove()}
                className="flex size-7 items-center justify-center rounded-md text-ink-faint transition-[background-color,color,scale] duration-150 ease-out hover:bg-wash-4 hover:text-[#c04040] dark:hover:text-danger active:scale-[0.96]"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
        </div>
      </header>

      {/* Body */}
      {editing ? (
        <div className="mt-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void saveEdit();
              }
              if (e.key === 'Escape') {
                setEditing(false);
                setDraft(comment.content);
              }
            }}
            autoFocus
            rows={2}
            className="w-full resize-none rounded-lg bg-wash-3 px-3 py-2 text-[13.5px] leading-[1.55] text-ink-title outline-none placeholder:text-ink-faintest focus:bg-wash-5"
          />
          <div className="mt-1.5 flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(comment.content);
              }}
              className="rounded-md px-2.5 py-1 text-[12.5px] font-medium text-ink-muted transition-[background-color,scale] duration-150 ease-out hover:bg-wash-4 active:scale-[0.96]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveEdit()}
              className="rounded-md bg-seeko-accent px-2.5 py-1 text-[12.5px] font-medium text-white transition-[opacity,scale] duration-150 ease-out hover:opacity-90 active:scale-[0.96]"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-[1.55] text-ink [text-wrap:pretty]">
          {renderContent(comment.content, teamNames)}
        </p>
      )}

      {/* Attachments */}
      {images.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {images.map((a) => (
            <a key={a.id} href={a.file_url} target="_blank" rel="noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.file_url}
                alt={a.file_name}
                className="max-h-48 rounded-lg outline outline-1 -outline-offset-1 outline-wash-6"
              />
            </a>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {files.map((a) => (
            <a
              key={a.id}
              href={a.file_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-wash-3 px-2.5 py-1.5 text-[12.5px] text-ink transition-[background-color] duration-150 ease-out hover:bg-wash-6"
            >
              <FileText className="size-3.5 text-ink-faint" />
              <span className="max-w-[200px] truncate">{a.file_name}</span>
            </a>
          ))}
        </div>
      )}

      {/* Reactions */}
      {reactionGroups.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {reactionGroups.map(([emoji, g]) => (
            <button
              key={emoji}
              type="button"
              onClick={() => void react(emoji)}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] tabular-nums transition-[background-color,scale] duration-150 ease-out active:scale-[0.96] ${
                g.mine
                  ? 'bg-seeko-accent/10 text-seeko-accent'
                  : 'bg-wash-4 text-[#5a5a5a] dark:text-ink-body hover:bg-black/[0.07] dark:hover:bg-white/[0.09]'
              }`}
            >
              <span>{emoji}</span>
              <span className="font-medium">{g.count}</span>
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

/* ── Composer ─────────────────────────────────────────────── */

function CommentComposer({
  taskId,
  currentUserId,
  currentProfile,
  onPosted,
}: {
  taskId: string;
  currentUserId: string;
  currentProfile?: Profile;
  onPosted: (comment: TaskComment) => void;
}) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSend = input.trim().length > 0 && !sending;

  const autoGrow = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const send = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);

    const res = await createComment(taskId, content);
    if (!res.ok) {
      setSending(false);
      setError(res.error);
      return;
    }

    const posted: TaskComment = {
      ...res.data.comment,
      reactions: [],
      attachments: [],
      profiles: res.data.comment.profiles ?? {
        id: currentUserId,
        display_name: currentProfile?.display_name,
        avatar_url: currentProfile?.avatar_url,
      },
    };

    // Attachments ride the existing upload route, keyed to the new comment.
    if (pendingFiles.length > 0) {
      const uploaded: NonNullable<TaskComment['attachments']> = [];
      for (const file of pendingFiles) {
        const form = new FormData();
        form.append('file', file);
        form.append('comment_id', posted.id);
        try {
          const up = await fetch(`/api/tasks/${taskId}/comments/attachments`, {
            method: 'POST',
            body: form,
          });
          if (up.ok) uploaded.push(await up.json());
        } catch {
          // Skip failed uploads; the comment itself already landed.
        }
      }
      posted.attachments = uploaded;
    }

    onPosted(posted);
    setInput('');
    setPendingFiles([]);
    setSending(false);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) el.style.height = 'auto';
    });
  };

  return (
    <div className="rounded-xl bg-surface-1 px-4 py-3 shadow-seeko">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          autoGrow();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void send();
          }
        }}
        placeholder="Leave a comment…"
        rows={1}
        className="min-h-[24px] w-full resize-none bg-transparent text-[13.5px] leading-[1.55] text-ink-title outline-none placeholder:text-ink-faintest"
      />

      {pendingFiles.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {pendingFiles.map((file, i) => (
            <span
              key={`${file.name}-${i}`}
              className="flex items-center gap-1.5 rounded-lg bg-wash-3 px-2.5 py-1 text-[12.5px] text-ink"
            >
              <Paperclip className="size-3 text-ink-faint" />
              <span className="max-w-[180px] truncate">{file.name}</span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                className="flex size-4 items-center justify-center rounded-full text-ink-faint transition-colors duration-150 hover:text-ink"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[12px] text-[#c04040] dark:text-danger">{error}</span>
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) setPendingFiles((prev) => [...prev, ...files]);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            aria-label="Attach files"
            onClick={() => fileInputRef.current?.click()}
            className="flex size-7 items-center justify-center rounded-full text-ink-faint transition-[background-color,color,scale] duration-150 ease-out hover:bg-wash-4 hover:text-ink active:scale-[0.96]"
          >
            <Paperclip className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Post comment"
            disabled={!canSend}
            onClick={() => void send()}
            className="flex size-6 items-center justify-center rounded-full bg-seeko-accent text-white transition-[background-color,color,opacity,scale] duration-150 ease-out hover:opacity-90 active:scale-[0.96] disabled:bg-wash-6 disabled:text-ink-faintest"
          >
            <ArrowUp className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
