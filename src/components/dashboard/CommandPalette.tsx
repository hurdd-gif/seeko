'use client';

/* ─────────────────────────────────────────────────────────
 * COMMAND PALETTE — ANIMATION STORYBOARD
 *
 *   open    backdrop fades in, palette scales 0.95 → 1.0 (spring)
 *           rows stagger in from left (30ms per row)
 *   nav     ↑↓ keys move highlight, Enter selects
 *   close   scale 1.0 → 0.97, opacity 1 → 0 (120ms)
 * ───────────────────────────────────────────────────────── */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, FileText, Activity, Settings, Search, PanelLeftClose, DollarSign, Presentation,
} from 'lucide-react';
import { useCommandPalette } from '@/lib/hooks/useCommandPalette';
import type { Profile, Doc } from '@/lib/types';
import { cn } from '@/lib/utils';

const SPRING = { type: 'spring' as const, stiffness: 500, damping: 30 };
const ROW_STAGGER = 0.025;

type CommandItem = {
  id: string;
  label: string;
  section: 'Pages' | 'Team' | 'Docs' | 'Decks' | 'Actions';
  icon: React.ElementType;
  action: () => void;
  keywords?: string;
};

interface CommandPaletteProps {
  team: Pick<Profile, 'id' | 'display_name'>[];
  docs: Pick<Doc, 'id' | 'title'>[];
  decks?: Pick<Doc, 'id' | 'title'>[];
  isContractor?: boolean;
  isAdmin?: boolean;
}

export function CommandPalette({ team, docs, decks = [], isContractor = false, isAdmin = false }: CommandPaletteProps) {
  const { open, setOpen } = useCommandPalette();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const shouldReduce = useReducedMotion();

  // During the tour, show non-admin view so admin-only pages don't leak
  const isTourActive = typeof document !== 'undefined' && document.body.classList.contains('tour-cmd-k-active');
  const showAdmin = isAdmin && !isTourActive;

  const go = useCallback((path: string) => {
    setOpen(false);
    setQuery('');
    router.push(path);
  }, [setOpen, router]);

  const items = useMemo<CommandItem[]>(() => {
    const pages: CommandItem[] = [
      { id: 'p-overview', label: 'Overview', section: 'Pages', icon: LayoutDashboard, action: () => go('/') },
      { id: 'p-team', label: 'Team', section: 'Pages', icon: Users, action: () => go('/team') },
      { id: 'p-docs', label: 'Docs', section: 'Pages', icon: FileText, action: () => go('/docs') },
      ...(!isContractor ? [{ id: 'p-activity', label: 'Activity', section: 'Pages' as const, icon: Activity, action: () => go('/activity') }] : []),
      ...(showAdmin ? [{ id: 'p-payments', label: 'Payments', section: 'Pages' as const, icon: DollarSign, action: () => go('/payments') }] : []),
      { id: 'p-settings', label: 'Settings', section: 'Pages', icon: Settings, action: () => go('/settings') },
    ];
    const teamItems: CommandItem[] = team.map((m) => ({
      id: `t-${m.id}`,
      label: m.display_name ?? 'Unknown',
      section: 'Team',
      icon: Users,
      action: () => go(`/team?member=${m.id}`),
      keywords: m.display_name ?? '',
    }));
    const docItems: CommandItem[] = docs.map((d) => ({
      id: `d-${d.id}`,
      label: d.title,
      section: 'Docs',
      icon: FileText,
      action: () => go(`/docs?doc=${d.id}`),
      keywords: d.title,
    }));
    const deckItems: CommandItem[] = decks.map((d) => ({
      id: `dk-${d.id}`,
      label: d.title,
      section: 'Decks',
      icon: Presentation,
      action: () => go(`/docs?doc=${d.id}`),
      keywords: d.title,
    }));
    const actions: CommandItem[] = [
      { id: 'a-sidebar', label: 'Toggle Sidebar', section: 'Actions', icon: PanelLeftClose, action: () => { setOpen(false); document.dispatchEvent(new CustomEvent('toggle-sidebar')); } },
    ];
    return [...pages, ...teamItems, ...docItems, ...deckItems, ...actions];
  }, [team, docs, decks, go, setOpen, isContractor, showAdmin]);

  const filtered = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter((item) => {
      const haystack = `${item.label} ${item.section} ${item.keywords ?? ''}`.toLowerCase();
      return haystack.includes(q);
    }).slice(0, 12);
  }, [query, items]);

  // Group filtered items by section
  const grouped = useMemo(() => {
    const sections = new Map<string, CommandItem[]>();
    const order: string[] = [];
    for (const item of filtered) {
      if (!sections.has(item.section)) {
        sections.set(item.section, []);
        order.push(item.section);
      }
      sections.get(item.section)!.push(item);
    }
    return order.map(section => ({ section, items: sections.get(section)! }));
  }, [filtered]);

  useEffect(() => setSelectedIndex(0), [filtered]);

  useEffect(() => {
    if (open) {
      document.documentElement.setAttribute('data-modal-open', '');
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      document.documentElement.removeAttribute('data-modal-open');
    }
    return () => { document.documentElement.removeAttribute('data-modal-open'); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        filtered[selectedIndex].action();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, filtered, selectedIndex]);

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-selected="true"]') as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Track flat index across grouped sections for keyboard nav
  let flatIndex = 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            id="command-palette-backdrop"
            className="fixed inset-0 z-[103] bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            id="command-palette-container"
            className="fixed inset-x-0 top-[18%] z-[104] mx-auto w-full max-w-lg"
            initial={shouldReduce ? undefined : { opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={SPRING}
          >
            <div
              id="tour-command-palette"
              className="mx-4 overflow-hidden rounded-xl border border-white/[0.08] bg-popover/80 backdrop-blur-xl backdrop-saturate-150 shadow-xl"
            >
              {/* Search input */}
              <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
                <Search className="size-4 text-muted-foreground shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search pages, team, docs..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
                <kbd className="hidden md:inline-flex items-center gap-0.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono">
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <div ref={listRef} className="max-h-72 overflow-y-auto p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Search className="size-6 text-muted-foreground/30" />
                    <p className="mt-2 text-sm text-muted-foreground">No results for &ldquo;{query}&rdquo;</p>
                    <p className="mt-1 text-xs text-muted-foreground/60">Try a different search term</p>
                  </div>
                ) : (
                  grouped.map(group => {
                    const rows = group.items.map(item => {
                      const Icon = item.icon;
                      const currentIndex = flatIndex++;
                      const isSelected = currentIndex === selectedIndex;
                      return (
                        <motion.button
                          key={item.id}
                          data-selected={isSelected}
                          initial={shouldReduce ? undefined : { opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ ...SPRING, delay: currentIndex * ROW_STAGGER }}
                          onClick={() => item.action()}
                          onMouseEnter={() => setSelectedIndex(currentIndex)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                            isSelected
                              ? 'bg-white/[0.08] text-foreground'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          <Icon className="size-4 shrink-0" />
                          <span className="flex-1 truncate">{item.label}</span>
                        </motion.button>
                      );
                    });

                    return (
                      <div key={group.section}>
                        <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                          {group.section}
                        </div>
                        {rows}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer hint */}
              <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2">
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground/50">
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-white/[0.08] bg-white/[0.04] px-1 py-0.5 font-mono">↑↓</kbd>
                    navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-white/[0.08] bg-white/[0.04] px-1 py-0.5 font-mono">↵</kbd>
                    select
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground/50 font-mono">⌘K</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
