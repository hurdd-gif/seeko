// src/components/contractor/JourneyRail.tsx
import { useEffect, useRef, useState } from 'react';
import { Check, ListChecks } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { ContractorStepDeliverable } from '@/lib/contractor-steps';
import { deriveSteps, summarizeSteps } from '@/lib/contractor-steps';
import { TAB_PILL_SPRING } from '@/lib/motion';
import { GradientAvatar } from '@/components/ui/gradient-avatar';

/* Left journey rail (Meridian-labs whole-page reference, 2026-07-11; shipped
 * corroboration: Mercury onboarding rail + Melio's connector stepper). One node
 * per active deliverable in the card column's own urgency order, two-line
 * labels (name + status microcopy), then a single green "Delivered" stop for
 * the history below. Node hues reuse the page's status palette exactly — red
 * missed, blue in-review, hollow on-track, green done — never decoration.
 * Deliverables are parallel work, not a sequence, so "you are here" is the
 * card currently under the reader's eye (scroll position), not a stored state.
 */

const OVERDUE_RED = '#d4503e';
const ACCENT_BLUE = '#0a63cc';

type RailTone = 'red' | 'blue' | 'neutral';

type RailItem = {
  targetId: string;
  name: string;
  subtitle: string;
  tone: RailTone;
  delivered?: boolean;
};

export type JourneyRailProps = {
  active: ContractorStepDeliverable[];
  /** Count of delivered deliverables in the history below the cards. */
  deliveredCount: number;
  profile: { displayName: string | null; email: string | null; avatarUrl: string | null };
  now: Date;
};

export function JourneyRail({ active, deliveredCount, profile, now }: JourneyRailProps) {
  const navRef = useRef<HTMLElement>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const reduce = useReducedMotion();
  // A rail click COMMITS its destination: the pin keeps the spy quiet so the
  // indicator neither walks through intermediate stops during the glide nor
  // gets stolen afterwards (bottom targets trip the scroll-end override via
  // IO callbacks that trail scrollend). `top === null` means the glide is
  // still in flight; once settled, only real movement away from the settled
  // position (any input: wheel, scrollbar, keys) hands control back.
  const pinRef = useRef<{ active: boolean; top: number | null }>({ active: false, top: null });
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Scroll a rail target into view; the click commits the destination. */
  function jumpTo(targetId: string) {
    const el = document.getElementById(targetId);
    if (!el) return;
    setCurrentId(targetId);
    pinRef.current = { active: true, top: null };
    const root = navRef.current?.closest('[data-contractor-scroll]');
    const settle = () => {
      if (pinRef.current.active) pinRef.current.top = (root as HTMLElement | null)?.scrollTop ?? 0;
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    };
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    // scrollend where supported; timeout fallback (Safari) outlives the glide.
    root?.addEventListener('scrollend', settle, { once: true });
    settleTimerRef.current = setTimeout(settle, 900);
    const noMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: noMotion ? 'auto' : 'smooth', block: 'start' });
  }

  const items: RailItem[] = active.map((d) => {
    const derived = deriveSteps(d.steps, now);
    const rollup = summarizeSteps(d.steps, now);
    const hasMissed = derived.some((x) => x.rendered === 'missed');
    return {
      targetId: `deliverable-${d.id}`,
      name: d.name,
      subtitle: rollup.label || 'No steps yet',
      tone: hasMissed ? 'red' : rollup.label === 'In review' ? 'blue' : 'neutral',
    };
  });
  if (deliveredCount > 0) {
    items.push({
      targetId: 'delivered-history',
      name: 'Delivered',
      subtitle: `${deliveredCount} deliverable${deliveredCount === 1 ? '' : 's'}`,
      tone: 'neutral',
      delivered: true,
    });
  }

  const targetsKey = items.map((i) => i.targetId).join('|');

  // "You are here" = the topmost card in the reading zone. Root is the page's
  // own scroll container ([data-contractor-scroll]), not the viewport — the
  // rail lives inside it. jsdom has no IntersectionObserver; the rail just
  // skips spying.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const root = navRef.current?.closest('[data-contractor-scroll]') ?? null;
    const visible = new Map<string, number>();
    const order = targetsKey.split('|');
    // The last stops may be too short to ever reach the reading zone, so at
    // scroll end the final item wins outright — otherwise clicking "Delivered"
    // would jump there while the rail kept emphasizing an earlier card.
    const update = () => {
      const el = root as HTMLElement | null;
      const pin = pinRef.current;
      if (pin.active) {
        // Glide in flight, or settled with no movement since (trailing IO
        // callbacks land after scrollend) — the committed target holds.
        if (pin.top === null) return;
        if (el && Math.abs(el.scrollTop - pin.top) <= 2) return;
        pinRef.current = { active: false, top: null }; // user moved — spy resumes
      }
      if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
        setCurrentId(order[order.length - 1]);
        return;
      }
      const top = order.find((id) => visible.has(id));
      if (top) setCurrentId(top);
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
          else visible.delete(e.target.id);
        }
        update();
      },
      // Reading zone: below the sticky header, upper 40% of the container.
      { root: root as Element | null, rootMargin: '-80px 0px -60% 0px' },
    );
    for (const id of order) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    root?.addEventListener('scroll', update, { passive: true });
    return () => {
      io.disconnect();
      root?.removeEventListener('scroll', update);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
      pinRef.current = { active: false, top: null };
    };
  }, [targetsKey]);

  return (
    <nav ref={navRef} aria-label="Deliverables" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2.5">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-1 text-ink-muted-strong ring-1 ring-hairline"
          aria-hidden
        >
          <ListChecks className="size-3.5" strokeWidth={2} />
        </span>
        <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-ink-heading">
          Your deliverables
        </h2>
      </div>

      {/* Spine flows from the header chip's center (14px) — same connected-object
       * geometry as the cards' monogram → spine relationship. Line + hollow
       * nodes step up from `hairline` to black/7–10%: on the #eee canvas the
       * white-surface hairline is invisible, and the rail is wayfinding, not
       * whisper-quiet history (contrast CompletedTimeline, which stays faint
       * on purpose). */}
      {/* Scroll wrapper OUTSIDE the spine: overflow-y-auto computes overflow-x
       * to auto too, which would clip the nodes hanging -7px past the border.
       * scroll-mask-y so a long list fades at its cut edge instead of clipping
       * silently (same affordance the cards column already carries). */}
      <div className="mt-3 min-h-0 overflow-y-auto scroll-mask-y [--scroll-mask-size:32px]">
        <div className="ml-[13px] border-l border-black/[0.07]">
        <ol>
          {items.map((item) => {
            const current = currentId === item.targetId;
            // 12px nodes — the 10px knockouts put an 8px check glyph below
            // the legibility floor (Workable's completed-step scale). Center
            // stays on the spine: -7 + 6 = -1 ≈ border center; top 12 + 6 =
            // 18px = the name line's optical center.
            const node = item.delivered ? (
              <span
                className="absolute -left-[7px] top-[12px] flex size-3 items-center justify-center rounded-full bg-[var(--ov-bg)] ring-1 ring-wash-10"
                aria-hidden
              >
                <Check className="size-2.5 text-success" strokeWidth={3} aria-hidden />
              </span>
            ) : item.tone === 'neutral' ? (
              <span
                className="absolute -left-[7px] top-[12px] size-3 rounded-full bg-[var(--ov-bg)] ring-1 ring-wash-10"
                aria-hidden
              />
            ) : (
              <span
                className="absolute -left-[7px] top-[12px] size-3 rounded-full ring-2 ring-[var(--ov-bg)]"
                style={{ backgroundColor: item.tone === 'red' ? OVERDUE_RED : ACCENT_BLUE }}
                aria-hidden
              />
            );
            return (
              <li key={item.targetId} className="relative">
                <button
                  type="button"
                  onClick={() => jumpTo(item.targetId)}
                  aria-current={current ? 'location' : undefined}
                  className="group relative flex w-full flex-col py-2 pl-[25px] pr-1 text-left outline-none transition-transform duration-150 ease-out focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-seeko-accent/40 active:scale-[0.99] motion-reduce:transition-none"
                >
                  {/* "You are here" is a surface that TRAVELS between rows
                   * (shared-layout pill, canonical TAB_PILL_SPRING), not a
                   * font-weight swap — weight can't transition and reflows
                   * glyph widths on every spy tick. Inset 15px so it clears
                   * the nodes on the spine. Hover gets the same shape one
                   * step quieter, so every row answers the pointer — the
                   * old text-only hover was a no-op on the current row. */}
                  <span
                    className="absolute inset-y-0.5 left-[15px] right-0 rounded-md bg-wash-3 opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 motion-reduce:transition-none"
                    aria-hidden
                  />
                  {current && (
                    <motion.span
                      layoutId="rail-current"
                      transition={reduce ? { duration: 0 } : TAB_PILL_SPRING}
                      className="absolute inset-y-0.5 left-[15px] right-0 rounded-md bg-wash-5"
                      aria-hidden
                    />
                  )}
                  {node}
                  <span
                    className={`relative block truncate text-[13px] leading-5 transition-colors duration-150 ease-out group-hover:text-ink-heading motion-reduce:transition-none ${
                      current ? 'text-ink-heading' : 'text-ink-muted-strong'
                    }`}
                  >
                    {item.name}
                  </span>
                  <span className="relative block truncate text-[12px] leading-4 text-ink-faint tabular-nums">
                    {item.subtitle}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        </div>
      </div>

      {/* Identity chip pinned to the rail's foot (reference bottom-left). */}
      <div className="mt-auto flex items-center gap-2.5 pt-6">
        <span className="size-8 shrink-0 overflow-hidden rounded-full outline outline-1 -outline-offset-1 outline-wash-6">
          {/* Everyone renders the deterministic gradient avatar, not a photo. */}
          <GradientAvatar seed={profile.displayName ?? profile.email ?? 'contractor'} />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium leading-5 text-ink-heading">
              {profile.displayName ?? 'Contractor'}
            </span>
            <span className="shrink-0 rounded-md bg-wash-5 px-1.5 py-[2px] text-[10px] font-medium leading-none text-ink-muted-strong">
              Contractor
            </span>
          </span>
          {profile.email && (
            // ink-muted, not ink-faint — the email is real data (which account
            // am I signed in as), not decorative sublining; faint sat ~2.96:1.
            <span className="block truncate text-[12px] leading-4 text-ink-muted">{profile.email}</span>
          )}
        </span>
      </div>
    </nav>
  );
}
