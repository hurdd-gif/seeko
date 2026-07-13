/* ─────────────────────────────────────────────────────────
 * TaskLinksSection — the "Connected" frame.
 *
 *   ┌────────────────────────────────────────────────┐
 *   │ ⛓ Connected · 2                            [+] │  ← 44px header bar
 *   ├────────────────────────────────────────────────┤  ← hairline
 *   │ ◐  14  Combat hit detection      View task ↗ ✕ │
 *   │ ●  22  Enemy AI pass             View task ↗ ✕ │
 *   │ ＋ Link an issue                                │
 *   └────────────────────────────────────────────────┘
 *
 * A frame, not a bare list, because a connection is a claim ABOUT this task
 * made by something outside it — the border is what says "this belongs to the
 * issue but is not part of it". Reference: the Linear source-embed frame
 * (bordered container, 44px header naming what it's attached to, hairline,
 * body).
 *
 * LINKS ARE SYMMETRIC. Connecting 14 to 22 puts 22 in 14's frame AND 14 in
 * 22's. There is no owner and no direction, so the frame reads identically
 * from either side — which is the whole reason the copy is "Connected" and
 * not "Blocks" or "Depends on". Anything directional would be a lie about
 * what the row means when you arrive at it from the other task.
 * ───────────────────────────────────────────────────────── */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, Link2, Plus, Search, X } from 'lucide-react';
import { Link } from '@/lib/react-router-adapters';
import { linkTask, unlinkTask } from '@/lib/task-link-store';
import { prefetchView } from '@/lib/route-prefetch';
import { springs } from '@/lib/motion';
import type { LinkedTask } from '@/lib/types';
import { StatusDot } from './StatusDot';

/** The picker scales from the button that opened it, not from its own centre. */
const PICKER_ORIGIN = 'origin-top-right';

export function TaskLinksSection({
  taskId,
  links: initialLinks,
  candidates,
}: {
  taskId: string;
  links: LinkedTask[];
  candidates: LinkedTask[];
}) {
  const [links, setLinks] = useState(initialLinks);
  const [picking, setPicking] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* The server owns the list — every write returns the task's full link set, so
     the client never has to reason about which side of the pair it just wrote. */
  const applyResult = useCallback(
    (result: Awaited<ReturnType<typeof linkTask>>) => {
      if (result.ok) {
        setLinks(result.links);
        setError(null);
      } else {
        setError(result.error);
      }
      setBusyId(null);
    },
    [],
  );

  const add = useCallback(
    async (id: string) => {
      setBusyId(id);
      setPicking(false);
      applyResult(await linkTask(taskId, id));
    },
    [taskId, applyResult],
  );

  const remove = useCallback(
    async (id: string) => {
      setBusyId(id);
      applyResult(await unlinkTask(taskId, id));
    },
    [taskId, applyResult],
  );

  /* Candidates minus whatever is already on screen. Filtering here rather than
     re-fetching keeps the picker honest immediately after a link lands. */
  const linkedIds = useMemo(() => new Set(links.map((l) => l.id)), [links]);
  const available = useMemo(
    () => candidates.filter((c) => !linkedIds.has(c.id)),
    [candidates, linkedIds],
  );

  // NOTE: no `overflow-hidden` on the <section>, deliberately. It is the obvious
  // way to make the rows respect the card's rounded corners, and it silently
  // amputates the picker: the popover is an absolutely-positioned descendant, so
  // the same clip that rounds the corners cuts it off at the card's edge. The
  // corners are handled where the bleed actually happens instead —
  // `rounded-b-2xl` on the footer row, the only child that reaches the bottom.
  return (
    <section className="rounded-2xl bg-surface-1 shadow-seeko">
      <header className="flex h-11 items-center gap-2 border-b border-wash-6 px-4">
        <Link2 className="size-3.5 shrink-0 text-ink-faint" />
        <h2 className="text-[13px] font-medium tracking-[-0.01em] text-ink-title">Connected</h2>
        {links.length > 0 && (
          <span className="text-[12px] tabular-nums text-ink-faint">{links.length}</span>
        )}

        <div className="relative ml-auto">
          <button
            type="button"
            aria-label="Link an issue"
            aria-expanded={picking}
            onClick={() => setPicking((v) => !v)}
            className="flex size-7 items-center justify-center rounded-md text-ink-faint transition-[background-color,color,scale] duration-150 ease-out hover:bg-wash-4 hover:text-ink active:scale-[0.96]"
          >
            <Plus className="size-3.5" />
          </button>

          <AnimatePresence>
            {picking && (
              <LinkPicker
                candidates={available}
                onPick={(id) => void add(id)}
                onClose={() => setPicking(false)}
              />
            )}
          </AnimatePresence>
        </div>
      </header>

      {links.length > 0 && (
        <ul>
          {links.map((link) => (
            <LinkedRow
              key={link.id}
              link={link}
              busy={busyId === link.id}
              onRemove={() => void remove(link.id)}
            />
          ))}
        </ul>
      )}

      {/* Always present, so the frame is never a dead end: on a task with no
          connections this row IS the empty state and the affordance at once.
          The hairline only appears once there are rows above it — it separates
          the connections from the action on them. With nothing above, there is
          nothing to separate and the line would just be a line. */}
      <button
        type="button"
        onClick={() => setPicking(true)}
        className={`flex w-full items-center gap-2 rounded-b-2xl px-4 py-2.5 text-left text-[13px] text-ink-faint transition-colors duration-150 ease-out hover:bg-wash-2 hover:text-ink active:bg-wash-4 ${
          links.length > 0 ? 'border-t border-wash-4' : ''
        }`}
      >
        <Plus className="size-3.5 shrink-0" />
        <span>Link an issue</span>
      </button>

      {error && (
        <p role="alert" className="px-4 pb-2.5 text-[12px] text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

/* ── One connected issue ──────────────────────────────────
 * The whole row navigates (a stretched link under the actions), because a row
 * that looks like a link and isn't one is a small betrayal. "View task" is the
 * VISIBLE half of that same affordance — it names the destination on hover and
 * gives the keyboard a real, focusable target, since a stretched overlay is
 * invisible to someone tabbing through.
 *
 * THE ROW ANSWERS IMMEDIATELY, which took two changes, and they work as a pair.
 * A data-router navigation is blocking: the outgoing page stays fully painted
 * until the incoming loader resolves. Measured here, that was 313ms of a totally
 * inert screen after the click — long enough that the press read as ignored and
 * the arrival read as a teleport.
 *
 *   1. WARM THE LOADER ON HOVER. `View task` only exists on hover, so by
 *      construction the pointer is over the row before it can ever be clicked —
 *      the head start is not a gamble here, it's guaranteed. Firing the loader's
 *      own request at `pointerenter` means the payload is usually already home
 *      when the router asks, and the navigation commits on the next frame.
 *
 *   2. HOLD THE PRESS UNTIL THE NEW TASK ARRIVES, for the clicks that are still
 *      cold (keyboard, a fast flick through the row, a slow network). `:active`
 *      can't do this: it releases when the pointer lifts, which is *before*
 *      anything has happened, so the row would flash and then go dead again. The
 *      pending flag keeps the pressed fill on screen for exactly as long as the
 *      wait lasts — one continuous gesture instead of two states that merely
 *      resemble each other.
 * ───────────────────────────────────────────────────────── */
function LinkedRow({
  link,
  busy,
  onRemove,
}: {
  link: LinkedTask;
  busy: boolean;
  onRemove: () => void;
}) {
  const idLabel = link.task_number != null ? String(link.task_number) : null;
  const { key } = useLocation();
  const [pending, setPending] = useState(false);

  /* Clear on ARRIVAL, not on unmount. This row does unmount on a successful hop
     (the destination's Connected frame is a different set of rows), so the flag
     usually dies with it — but a loader that 404s or throws leaves us standing
     right here, and without this the row would keep its pressed fill forever.
     `key` changes on every navigation, including one that lands back where it
     started. */
  useEffect(() => {
    setPending(false);
  }, [key]);

  return (
    <li
      onPointerEnter={() => prefetchView(`/api/task-detail/${link.id}`)}
      data-pending={pending || undefined}
      className="group/link relative flex items-center gap-3 px-4 py-2.5 transition-[background-color,opacity] duration-150 ease-out hover:bg-wash-2 data-[pending]:bg-wash-4"
      style={{ opacity: busy ? 0.5 : 1 }}
    >
      <StatusDot status={link.status} size="sm" className="shrink-0" />

      {idLabel && (
        <span className="w-[28px] shrink-0 font-mono text-[12px] tabular-nums text-ink-muted">
          {idLabel}
        </span>
      )}

      <span className="min-w-0 flex-1 truncate text-[14px] leading-snug text-ink-title">
        {link.name}
      </span>

      {/* THE STRETCHED LINK. Deliberately NOT `relative`: with no positioned
          ancestor of its own, the `before:inset-0` resolves against the <li>, so
          the pseudo-element covers the ENTIRE row and the whole row navigates.
          Add `relative` here and the overlay collapses back onto the label —
          the row goes dead and only the words "View task" stay clickable.

          It still needs to sit above nothing in particular, but the ✕ must sit
          above IT: both carry z-10 and the ✕ comes later in the DOM, so it wins
          the paint order. z-index works on both without `position` because they
          are flex items. The visible label is not decoration — it is the
          keyboard's only way in, since a stretched pseudo-element cannot be
          tabbed to. */}
      <Link
        href={`/tasks/${link.id}`}
        onFocus={() => prefetchView(`/api/task-detail/${link.id}`)}
        onClick={() => setPending(true)}
        className="z-10 flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-ink-faint opacity-0 transition-[opacity,color] duration-150 ease-out before:absolute before:inset-0 before:content-[''] hover:text-ink focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-seeko-accent group-hover/link:opacity-100 group-data-[pending]/link:text-ink group-data-[pending]/link:opacity-100"
      >
        <span>View task</span>
        <ArrowUpRight className="size-3" />
      </Link>

      {/* `after:` lifts the 24px glyph to a 36×44 hit target. It grows into the
          row's dead vertical space and only 6px sideways ON PURPOSE: the 12px
          gap to "View task" is all that separates this from a destructive
          mis-tap, so the hit area stops short of eating that gap. */}
      <button
        type="button"
        aria-label={`Disconnect ${link.name}`}
        disabled={busy}
        onClick={onRemove}
        className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-md text-ink-faintest opacity-0 transition-[background-color,color,opacity,scale] duration-150 ease-out after:absolute after:-inset-x-1.5 after:-inset-y-2.5 after:content-[''] hover:bg-wash-4 hover:text-ink focus-visible:opacity-100 active:scale-[0.96] group-hover/link:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}

/* ── The picker ───────────────────────────────────────────
 * Search by name OR number — "14" finds task 14 — the same two-way match the
 * milestone picker uses, because "#14" is how people refer to issues out loud.
 * ───────────────────────────────────────────────────────── */
function LinkPicker({
  candidates,
  onPick,
  onClose,
}: {
  candidates: LinkedTask[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Outside-click and Escape both close. Escape is listened for on the document
  // rather than the input, so it still works once focus has moved into the list.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    const num = q.replace(/\D/g, '');
    return candidates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (num !== '' && t.task_number != null && String(t.task_number).includes(num)),
    );
  }, [candidates, query]);

  return (
    <motion.div
      ref={panelRef}
      // Never from scale(0) — 0.96 keeps the panel a real object that grew,
      // not one conjured out of nothing. Reduced motion drops the scale but
      // keeps the panel: the movement is what's optional, not the panel.
      initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.96 }}
      transition={reduceMotion ? { duration: 0.12 } : springs.snappy}
      className={`absolute right-0 top-8 z-30 w-[288px] ${PICKER_ORIGIN} rounded-[14px] bg-overlay p-1 shadow-seeko-pop`}
    >
      <div className="relative px-1 pt-1 pb-1.5">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-faintest" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search issues"
          aria-label="Search issues"
          className="block w-full rounded-md border border-wash-6 bg-surface-1 py-1.5 pl-7 pr-2.5 text-[12.5px] text-ink-title placeholder:text-ink-faintest transition-colors focus:border-seeko-accent focus:outline-none"
        />
      </div>

      {results.length === 0 ? (
        <p className="px-2 py-3 text-center text-[12.5px] text-ink-faintest">
          {candidates.length === 0 ? 'No other issues to link.' : `No issues match “${query}”.`}
        </p>
      ) : (
        <ul className="scrollbar-paper max-h-[220px] overflow-y-auto">
          {results.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => onPick(task.id)}
                className="flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left transition-colors duration-150 ease-out hover:bg-wash-4"
              >
                <StatusDot status={task.status} size="sm" className="shrink-0" />
                {task.task_number != null && (
                  <span className="w-[24px] shrink-0 font-mono text-[10.5px] tabular-nums text-ink-faint">
                    {task.task_number}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-title">
                  {task.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
