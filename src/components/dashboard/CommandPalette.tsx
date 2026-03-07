'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, FileText, Activity, Settings, Search, PanelLeftClose,
} from 'lucide-react';
import { useCommandPalette } from '@/lib/hooks/useCommandPalette';
import { springs } from '@/components/motion';
import type { Profile, Doc } from '@/lib/types';

type CommandItem = {
  id: string;
  label: string;
  section: 'Pages' | 'Team' | 'Docs' | 'Actions';
  icon: React.ElementType;
  action: () => void;
  keywords?: string;
};

interface CommandPaletteProps {
  team: Pick<Profile, 'id' | 'display_name'>[];
  docs: Pick<Doc, 'id' | 'title'>[];
  isContractor?: boolean;
}

export function CommandPalette({ team, docs, isContractor = false }: CommandPaletteProps) {
  const { open, setOpen } = useCommandPalette();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const shouldReduce = useReducedMotion();

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
    const actions: CommandItem[] = [
      { id: 'a-sidebar', label: 'Toggle Sidebar', section: 'Actions', icon: PanelLeftClose, action: () => { setOpen(false); document.dispatchEvent(new CustomEvent('toggle-sidebar')); } },
    ];
    return [...pages, ...teamItems, ...docItems, ...actions];
  }, [team, docs, go, setOpen]);

  const filtered = useMemo(() => {
    if (!query) return items.slice(0, 12);
    const q = query.toLowerCase();
    return items.filter((item) => {
      const haystack = `${item.label} ${item.section} ${item.keywords ?? ''}`.toLowerCase();
      return haystack.includes(q);
    }).slice(0, 12);
  }, [query, items]);

  useEffect(() => setSelectedIndex(0), [filtered]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
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
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[103] bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            className="fixed inset-x-0 top-[20%] z-[104] mx-auto w-full max-w-lg"
            initial={shouldReduce ? undefined : { opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={springs.snappy}
          >
            <div id="tour-command-palette" className="mx-4 overflow-hidden rounded-xl border border-border bg-card/95 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search pages, team, docs..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
                <kbd className="hidden md:inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono">
                  ESC
                </kbd>
              </div>
              <div ref={listRef} className="max-h-72 overflow-y-auto py-2">
                {filtered.length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">No results</p>
                )}
                {filtered.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => item.action()}
                      onMouseEnter={() => setSelectedIndex(i)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                        i === selectedIndex ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      <span className="text-[10px] font-mono text-muted-foreground/60 uppercase">{item.section}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
