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
import { useReducedMotion } from 'motion/react';
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

/* ── Hold-to-delete ───────────────────────────────────────
 * Deleting a comment is the only irreversible action on the card, and it used
 * to be the easiest one to hit: a bare onClick on a 28px target sitting 2px
 * from "edit". Now it costs three seconds of sustained intent.
 *
 * INTERACTION STORYBOARD (pointer down on the trash icon)
 *
 *      0ms   THE VESSEL ARRIVES. The 28px square opens into a 124px pill, a red
 *            frame draws around it, and "Hold to delete" fades up. Nothing
 *            fills yet — first you are shown the thing that is going to fill.
 *    180ms   THE CLOCK RUNS. A pale red fill sweeps left → right across a box
 *            that is now standing still, and the frame deepens from soft to
 *            solid red as it advances. Approaching the point of no return
 *            looks like approaching the point of no return.
 *   3000ms   the fill lands on the right edge, the frame is at full strength,
 *            the comment is deleted — and the control HOLDS that filled frame
 *            as its final state. It does not undo itself at the moment it
 *            succeeds.
 *
 *   release, or drag off, at any point before 3000ms:
 *    +200ms  fill retracts, frame fades, pill collapses — all on one duration
 *            and one curve, so the retreat reads as a single motion instead of
 *            three things leaving separately.
 *
 * WHY THE FILL WAITS FOR THE PILL. A clip-path inset is a percentage OF THE
 * CURRENT BOX. Sweeping while the box is still growing 28px → 124px means the
 * fill's right edge is chasing a right edge that is running away from it: it
 * lurches out of the gate and its apparent rate has nothing to do with the
 * timer, even though the timer is perfectly linear. Open first, sweep second,
 * and the rate is honest. (This was the actual bug — not the colours.)
 *
 * The fill is still the clock: HOLD_OPEN_MS + HOLD_SWEEP_MS === HOLD_MS by
 * construction, so what you see and what the timer does cannot drift apart.
 * ───────────────────────────────────────────────────────── */
const HOLD_MS = 3000;
/** The pill's opening beat. The fill is delayed by exactly this much. */
const HOLD_OPEN_MS = 180;
const HOLD_SWEEP_MS = HOLD_MS - HOLD_OPEN_MS;
/** Release is snappy where the press is deliberate — slow to decide, fast to respond. */
const HOLD_RELEASE_MS = 200;
/** Strong ease-out (easing.dev). CSS's built-in curve is too weak to make 180ms
 *  read as a deliberate "the control is opening for you" beat. */
const HOLD_OPEN_EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
/** Resting size matches the sibling icon buttons; the pill fits the label. */
const HOLD_REST_W = 'w-7';
const HOLD_OPEN_W = 'w-[124px]';

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
                  onRestored={handlePosted}
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
  onRestored,
}: {
  comment: TaskComment;
  taskId: string;
  teamNames: string[];
  currentUserId: string;
  isAdmin: boolean;
  onUpdated: (id: string, patch: Partial<TaskComment>) => void;
  onDeleted: (id: string) => void;
  /** Puts an optimistically-removed comment back when the DELETE fails. */
  onRestored: (comment: TaskComment) => void;
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

  // Optimistic, like saveEdit and react — and, like them, it puts the comment
  // back if the API rejects. It didn't before: a failed DELETE left the card
  // gone from the feed until a reload, so you'd believe you had destroyed
  // something you hadn't. buildFeed sorts by created_at, so restoring drops it
  // back into its original slot rather than at the end.
  const remove = async () => {
    onDeleted(comment.id);
    const res = await deleteCommentApi(taskId, comment.id);
    if (!res.ok) onRestored(comment);
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
            seed={comment.user_id}
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
            {(own || isAdmin) && <HoldToDelete onCommit={() => void remove()} />}
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

/* ── Hold-to-delete control ───────────────────────────────── */

/* Exported for /tasks/hold-delete-qa — the control only appears on a comment you
 * own, so the isolated preview is the only way to exercise the 3s hold without
 * writing a throwaway comment to the live DB. */
export function HoldToDelete({ onCommit }: { onCommit: () => void }) {
  const [holding, setHolding] = useState(false);
  const reduceMotion = useReducedMotion();
  const timer = useRef<number | null>(null);
  /* Once the hold lands, the control freezes in its filled state and stops
     listening. The card is about to unmount, and a pointerup arriving in that
     gap would otherwise retract the fill — the delete's own success animating
     itself away. */
  const committed = useRef(false);

  /* Reduced motion keeps the fill (it is a progress READOUT, not decoration —
     without it a 3-second hold gives no feedback at all) and drops the morph:
     the pill snaps open. So the fill must not wait for a beat that never
     happens. HOLD_MS is unchanged either way. */
  const openMs = reduceMotion ? 0 : HOLD_OPEN_MS;
  const sweepMs = HOLD_MS - openMs;
  /* One duration and one curve per beat — the whole control moves together. */
  const beatMs = holding ? openMs : HOLD_RELEASE_MS;
  const beatEase = holding ? HOLD_OPEN_EASE : 'ease-out';

  const cancel = useCallback(() => {
    if (committed.current) return;
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setHolding(false);
  }, []);

  const start = useCallback(() => {
    if (timer.current !== null || committed.current) return; // already counting
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      committed.current = true;
      // `holding` deliberately stays true: the last frame the user sees is a
      // full pill inside a solid red frame, not a control snapping back to rest.
      onCommit();
    }, HOLD_MS);
  }, [onCommit]);

  // The card unmounts the instant the delete lands; don't leave a timer behind.
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  return (
    <button
      type="button"
      // The cost is part of the control's name. The visible "Hold to delete"
      // label can't carry it — it only appears once you're already holding, and
      // an aria-label overrides the button's contents anyway. Without this a
      // screen-reader user presses, hears nothing, and moves on.
      aria-label="Delete comment (hold for 3 seconds)"
      title="Hold for 3 seconds to delete"
      onPointerDown={start}
      onPointerUp={cancel}
      // Drag off to abort — the same escape hatch a native button press gives you.
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      // Focus lost mid-hold: Tab away, click elsewhere, Cmd-Tab out. keyup is
      // delivered to whatever has focus NOW, so it never reaches this button and
      // the timer would run to completion unwatched. Losing focus is a release.
      onBlur={cancel}
      onKeyDown={(e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        // Also suppresses Space's synthetic click, so the keyboard can't skip the hold.
        e.preventDefault();
        if (!e.repeat) start(); // keydown auto-repeats while held; only the first starts the clock
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') cancel();
      }}
      className={`relative flex h-7 shrink-0 touch-none select-none items-center overflow-hidden rounded-md ${
        holding
          ? `${HOLD_OPEN_W} text-[#c04040] dark:text-danger`
          : `${HOLD_REST_W} text-ink-faint hover:bg-wash-4 hover:text-[#c04040] dark:hover:text-danger`
      }`}
      style={{
        // The press itself, at button speed — it must land long before the pill
        // has finished opening, or the control feels like it heard you late.
        transform: holding ? 'scale(0.98)' : 'scale(1)',
        transitionProperty: 'width, color, transform',
        transitionDuration: `${beatMs}ms, 150ms, 120ms`,
        transitionTimingFunction: `${beatEase}, ease-out, ease-out`,
      }}
    >
      {/* THE FRAME, soft. Draws in with the pill and holds at half strength —
          the outline of the vessel, visible before anything is in it. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-inset ring-[#c04040]/45 dark:ring-danger/40"
        style={{
          opacity: holding ? 1 : 0,
          transitionProperty: 'opacity',
          transitionDuration: `${beatMs}ms`,
          transitionTimingFunction: beatEase,
        }}
      />
      {/* THE FRAME, solid. Rides the same clock as the fill, so the outline
          deepens toward full red exactly as the fill approaches the edge. This
          is the part that makes the last second feel like the last second. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-inset ring-[#c04040] dark:ring-danger"
        style={{
          opacity: holding ? 1 : 0,
          transitionProperty: 'opacity',
          transitionDelay: holding ? `${openMs}ms` : '0ms',
          transitionDuration: `${holding ? sweepMs : HOLD_RELEASE_MS}ms`,
          transitionTimingFunction: holding ? 'linear' : 'ease-out',
        }}
      />
      {/* THE FILL — the clock made visible, in a red light enough to read as
          "filling up" rather than "already done". One clip-path transition,
          linear, delayed until the box has stopped moving (see the storyboard:
          a clip inset is a % of the CURRENT box, so sweeping across a growing
          box makes the rate a lie). A transition, not a keyframe, so releasing
          retargets it from wherever it got to instead of restarting. */}
      <span
        aria-hidden
        className="absolute inset-0 bg-[#c04040]/[0.16] dark:bg-danger/20"
        style={{
          clipPath: holding ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)',
          transitionProperty: 'clip-path',
          transitionDelay: holding ? `${openMs}ms` : '0ms',
          transitionDuration: `${holding ? sweepMs : HOLD_RELEASE_MS}ms`,
          transitionTimingFunction: holding ? 'linear' : 'ease-out',
        }}
      />
      <span className="relative flex size-7 shrink-0 items-center justify-center">
        <Trash2 className="size-3.5" />
      </span>
      {/* Says the consequence on the control. A silent 3s hold is undiscoverable:
          you'd press, see nothing happen, and conclude delete was broken. It
          arrives ON the pill's curve rather than a curve of its own — the label
          is part of the pill opening, not a fourth thing happening at once. */}
      <span
        className="relative whitespace-nowrap pr-2.5 text-[12px] font-medium tracking-[-0.01em]"
        style={{
          opacity: holding ? 1 : 0,
          transform: holding ? 'translateX(0)' : 'translateX(4px)',
          transitionProperty: 'opacity, transform',
          transitionDuration: `${beatMs}ms`,
          transitionTimingFunction: beatEase,
        }}
      >
        Hold to delete
      </span>
    </button>
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
    // This is an INPUT, not a card, and it has to SINK rather than sit on top —
    // hence --surface-sunken, not --surface-1. A field is somewhere you put
    // something into; every raised tier on this page (the title card, the comments
    // below) is something already put there. Reaching for surface-1 lifted the
    // composer 0.025 ABOVE the canvas and made the emptiest box on the page also
    // the most prominent one.
    //
    // Sinking looks opposite in the two schemes and the token absorbs that: on
    // light it resolves to white (paper is brighter than the desk), so light is
    // unchanged; on dark it goes below the canvas. See globals.css.
    //
    // The wash-6 hairline stays — it is the top lip of the well catching light, and
    // it is what keeps the boundary legible once the fill stops doing that work. It
    // is present-but-transparent in light so the box geometry is identical in both
    // schemes: no 1px reflow when the theme flips.
    <div className="rounded-xl border border-transparent bg-surface-sunken px-4 py-3 shadow-seeko dark:border-wash-6">
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
