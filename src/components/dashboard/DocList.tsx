'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { FileText, Lock, Pencil, Trash2, Plus, Search, Clock, ChevronDown, Presentation, Share2, XCircle, RotateCcw, Eye, Calendar, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Doc } from '@/lib/types';
import type { Profile } from '@/lib/types';
import { Dialog, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { motion, AnimatePresence } from 'motion/react';
import { Stagger, StaggerItem } from '@/components/motion';
import { LIGHT_INPUT, BTN_PRIMARY } from '@/components/dashboard/lightKit';
import { DocEditor } from './DocEditor';
import { DeckEditor } from './DeckEditor';
import { DeckViewer } from './DeckViewer';
import { DocDeleteConfirm } from './DocDeleteConfirm';
import { DocContent } from './DocContent';
import { DocShareDialog } from './DocShareDialog';
import { DatePicker } from '@/components/ui/date-picker';
import { useHaptics } from '@/components/HapticsProvider';

/** Strip HTML tags and decode common entities for plain-text previews */
const _decodeEl = typeof document !== 'undefined' ? document.createElement('textarea') : null;
function stripHtml(html: string): string {
  const text = html.replace(/<[^>]*>/g, '');
  if (_decodeEl) { _decodeEl.innerHTML = text; return _decodeEl.value; }
  return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

const DEPARTMENTS = ['Coding', 'Visual Art', 'UI/UX', 'Animation', 'Asset Creation'] as const;

/** Threshold for "recently updated" indicator (48 hours) */
const RECENTLY_UPDATED_MS = 48 * 60 * 60 * 1000;

function timeAgo(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function timeUntil(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return 'expired';
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'in 1d';
  if (days < 7) return `in ${days}d`;
  if (days < 30) return `in ${Math.floor(days / 7)}w`;
  return `in ${Math.floor(days / 30)}mo`;
}

function isRecentlyUpdated(doc: Doc): boolean {
  const ts = doc.updated_at ?? doc.created_at;
  if (!ts) return false;
  return Date.now() - new Date(ts).getTime() < RECENTLY_UPDATED_MS;
}

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 *    0ms   list container visible
 *   70ms   stagger between each doc row (fade + rise)
 *  Hover   row tints (hover:bg-black/[0.02])
 * ───────────────────────────────────────────────────────── */

const LIST = {
  staggerMs: 70,   // ms between each row
  delayMs:   0,    // ms before first row
};

const TAB_ORDER: Record<string, number> = { docs: 0, decks: 1, shared: 2 };

const tabSlideVariants = {
  enter: (d: number) => ({ opacity: 0, x: d * 40 }),
  active: { opacity: 1, x: 0 },
  exit: (d: number) => ({ opacity: 0, x: d * -40 }),
};

const tabSlideTransition = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 32,
  opacity: { duration: 0.15 },
};

/* Light status chips — bg tint + restrained ink (no borders). */
const SHARE_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-[#f5a623]/10 text-[#b8801a]',
  verified: 'bg-[#0d7aff]/10 text-[#0d7aff]',
  expired: 'bg-black/[0.04] text-[#9a9a9a]',
  revoked: 'bg-[#d4503e]/10 text-[#d4503e]',
};

/* ─────────────────────────────────────────────────────────
 * FilterPill (light — sentence-case, no uppercase eyebrow)
 * ───────────────────────────────────────────────────────── */

function FilterPill({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-[13px] font-medium transition-[color,background-color,border-color] duration-150',
            value !== 'all'
              ? 'border-black/15 bg-black/[0.04] text-[#111]'
              : 'border-black/[0.08] text-[#808080] hover:text-[#111] hover:border-black/15'
          )}
        >
          {value !== 'all' ? options.find(o => o.value === value)?.label ?? label : label}
          <ChevronDown className="size-3 text-[#9a9a9a]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="border-black/[0.06] bg-white/95 text-[#111] shadow-seeko-pop"
      >
        {options.map(opt => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => onChange(opt.value)}
            selected={opt.value === value}
            className="text-[13px] text-[#505050] hover:bg-black/[0.04] hover:text-[#111] focus:bg-black/[0.04] focus:text-[#111]"
          >
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─────────────────────────────────────────────────────────
 * DocList
 * ───────────────────────────────────────────────────────── */

interface DocListProps {
  docs: Doc[];
  userDepartment?: string | null;
  isAdmin?: boolean;
  isInvestor?: boolean;
  currentUserId?: string;
  team?: Pick<Profile, 'id' | 'display_name'>[];
}

export function DocList({ docs: initialDocs, userDepartment, isAdmin = false, isInvestor = false, currentUserId = '', team = [] }: DocListProps) {
  const [docs, setDocs] = useState<Doc[]>(initialDocs);
  const { trigger } = useHaptics();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const VALID_TABS = ['docs', 'decks', 'shared'] as const;
  type ViewMode = typeof VALID_TABS[number];
  const tabParam = searchParams.get('tab');
  const viewMode: ViewMode = VALID_TABS.includes(tabParam as ViewMode) ? (tabParam as ViewMode) : 'docs';
  const [tabDirection, setTabDirection] = useState(1);

  const setViewMode = (mode: ViewMode) => {
    setTabDirection(TAB_ORDER[mode] > TAB_ORDER[viewMode] ? 1 : -1);
    const params = new URLSearchParams(searchParams.toString());
    if (mode === 'docs') {
      params.delete('tab');
    } else {
      params.set('tab', mode);
    }
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
  };

  const [selected, setSelected] = useState<Doc | null>(null);
  const [editingDoc, setEditingDoc] = useState<Doc | 'new' | null>(null);
  const [editingDeck, setEditingDeck] = useState<Doc | 'new' | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [shareDoc, setShareDoc] = useState<Doc | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [sharedLinks, setSharedLinks] = useState<any[]>([]);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [sharedExpanded, setSharedExpanded] = useState(false);
  const [editingDeadlineId, setEditingDeadlineId] = useState<string | null>(null);
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineLoading, setDeadlineLoading] = useState(false);

  const isLocked = (d: Doc) => {
    if (isAdmin || isInvestor) return false;
    const hasDeptRestriction = !!d.restricted_department?.length;
    const inDept = hasDeptRestriction && d.restricted_department!.includes(userDepartment ?? '');
    const granted = !!d.granted_user_ids?.length && d.granted_user_ids.includes(currentUserId);
    return hasDeptRestriction && !inDept && !granted;
  };

  const sortedDocs = useMemo(() => {
    // Filter by type first
    const byType = docs.filter(d =>
      viewMode === 'decks' ? d.type === 'deck' : d.type !== 'deck'
    );
    const byLock = [...byType].sort((a, b) =>
      isLocked(a) === isLocked(b) ? 0 : isLocked(a) ? 1 : -1
    );
    const q = searchQuery.trim().toLowerCase();
    const bySearch = q
      ? byLock.filter(d => d.title.toLowerCase().includes(q))
      : byLock;
    if (departmentFilter === 'all') return bySearch;
    return bySearch.filter(d => d.restricted_department?.includes(departmentFilter));
  }, [docs, viewMode, searchQuery, departmentFilter, isAdmin, userDepartment, currentUserId]);

  /** Group docs: unlocked by department, locked collected at end */
  const grouped = useMemo(() => {
    const unlocked: Doc[] = [];
    const locked: Doc[] = [];
    for (const d of sortedDocs) {
      if (isLocked(d)) locked.push(d);
      else unlocked.push(d);
    }

    // Group unlocked docs by primary department (or "Shared" if none)
    const groups = new Map<string, Doc[]>();
    for (const d of unlocked) {
      const dept = d.restricted_department?.length ? d.restricted_department[0] : 'Shared';
      if (!groups.has(dept)) groups.set(dept, []);
      groups.get(dept)!.push(d);
    }

    // Sort: Shared first, then alphabetical
    const sorted = Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === 'Shared') return -1;
      if (b === 'Shared') return 1;
      return a.localeCompare(b);
    });

    return { groups: sorted, locked };
  }, [sortedDocs]);

  useEffect(() => {
    const docId = searchParams.get('doc');
    if (!docId || docs.length === 0) return;
    const found = docs.find(d => d.id === docId);
    if (found) setSelected(found);
  }, [searchParams, docs]);

  useEffect(() => {
    if (viewMode === 'shared' && isAdmin) {
      setSharedLoading(true);
      fetch('/api/doc-share/list')
        .then(r => r.json())
        .then(data => setSharedLinks(Array.isArray(data) ? data : []))
        .catch(() => toast.error('Failed to load shared links'))
        .finally(() => setSharedLoading(false));
    }
  }, [viewMode, isAdmin]);

  async function handleRevoke(inviteId: string) {
    try {
      const res = await fetch('/api/doc-share/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_id: inviteId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to revoke');
      setSharedLinks(prev => prev.map(l => l.id === inviteId ? { ...l, status: 'revoked' } : l));
      toast.success('Share link revoked');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke');
    }
  }

  async function handleResend(inviteId: string) {
    try {
      const res = await fetch('/api/doc-share/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_id: inviteId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to resend');
      setSharedLinks(prev => prev.map(l => l.id === inviteId ? { ...l, status: 'pending' } : l));
      toast.success('Share link resent');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resend');
    }
  }

  async function handleUpdateDeadline(inviteId: string, newExpiresAt: string) {
    setDeadlineLoading(true);
    try {
      const res = await fetch('/api/doc-share/update-deadline', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_id: inviteId, expires_at: new Date(newExpiresAt + 'T00:00:00').toISOString() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update deadline');
      setSharedLinks(prev => prev.map(l => l.id === inviteId ? { ...l, expires_at: data.expires_at } : l));
      toast.success('Deadline updated');
      setEditingDeadlineId(null);
      setDeadlineDate('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update deadline');
    } finally {
      setDeadlineLoading(false);
    }
  }

  const handleSave = (saved: Doc) => {
    setDocs(prev => {
      const idx = prev.findIndex(d => d.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
    setEditingDoc(null);
    setEditingDeck(null);
    const isDeck = saved.type === 'deck';
    const isNew = editingDoc === 'new' || editingDeck === 'new';
    toast.success(isNew ? (isDeck ? 'Deck created' : 'Document created') : (isDeck ? 'Deck saved' : 'Document saved'));
    trigger('success');
  };

  const handleDelete = (id: string) => {
    setDocs(prev => prev.filter(d => d.id !== id));
    setDeletingId(null);
    toast.success('Document deleted');
    trigger('success');
  };

  /* ── Render: unlocked doc/deck row (inside a divide-y group card) ── */
  const renderDocRow = (doc: Doc) => {
    const recent = isRecentlyUpdated(doc);
    const isDeck = doc.type === 'deck';
    const hasThumb = isDeck && !!doc.slides?.[0];
    const handleEdit = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isDeck) setEditingDeck(doc);
      else setEditingDoc(doc);
    };
    return (
      <StaggerItem key={doc.id}>
        {deletingId === doc.id ? (
          <div className="px-4 py-3">
            <DocDeleteConfirm
              docId={doc.id}
              docTitle={doc.title}
              onDelete={handleDelete}
              onCancel={() => setDeletingId(null)}
            />
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => setSelected(doc)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(doc); } }}
            className="group flex cursor-pointer items-start gap-3.5 px-4 py-3.5 transition-colors duration-150 hover:bg-black/[0.02] focus-visible:bg-black/[0.02] focus-visible:outline-none"
          >
            {/* Left: deck thumbnail or icon container */}
            {hasThumb ? (
              <div className="relative h-10 w-[68px] shrink-0 overflow-hidden rounded-md bg-[#f4f4f4] outline outline-1 -outline-offset-1 outline-black/[0.06]">
                <img src={doc.slides![0].url} alt="" className="h-full w-full object-cover" />
                {recent && (
                  <span className="absolute right-1 top-1 size-2 rounded-full bg-[#0d7aff] ring-2 ring-white" />
                )}
              </div>
            ) : (
              <div className="relative flex size-9 shrink-0 items-center justify-center rounded-md bg-[#f4f4f4]">
                {isDeck ? <Presentation className="size-4 text-[#808080]" /> : <FileText className="size-4 text-[#808080]" />}
                {recent && (
                  <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[#0d7aff] ring-2 ring-white" />
                )}
              </div>
            )}

            {/* Right: title + meta */}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="truncate text-[14px] font-medium text-[#111]">{doc.title}</p>
                  {isDeck && doc.slides && (
                    <span className="font-mono text-[10px] tabular-nums text-[#b0b0b0]">{doc.slides.length} slides</span>
                  )}
                  {recent && (
                    <span className="shrink-0 rounded-full bg-[#0d7aff]/10 px-2 py-0.5 text-[10px] font-medium text-[#0d7aff]">Updated</span>
                  )}
                  {doc.restricted_department?.map(dept => (
                    <span key={dept} className="shrink-0 rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium text-[#808080]">{dept}</span>
                  ))}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {(doc.updated_at || doc.created_at) && (
                    <span className="hidden text-[11px] tabular-nums text-[#9a9a9a] sm:inline">
                      {timeAgo(doc.updated_at ?? doc.created_at!)}
                    </span>
                  )}
                  {isAdmin && (
                    <>
                      <button
                        type="button"
                        title="Edit"
                        onClick={handleEdit}
                        className="flex size-7 items-center justify-center rounded-md text-[#9a9a9a] opacity-0 transition-[color,background-color,opacity] duration-150 hover:bg-black/[0.04] hover:text-[#111] group-hover:opacity-100"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        onClick={(e) => { e.stopPropagation(); setDeletingId(doc.id); }}
                        className="flex size-7 items-center justify-center rounded-md text-[#9a9a9a] opacity-0 transition-[color,background-color,opacity] duration-150 hover:bg-[#d4503e]/10 hover:text-[#d4503e] group-hover:opacity-100"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {isAdmin && doc.granted_user_ids?.length ? (
                <p className="text-[11px] text-[#9a9a9a]">
                  Also granted: {team.filter(p => doc.granted_user_ids?.includes(p.id)).map(p => p.display_name ?? 'Unknown').join(', ')}
                </p>
              ) : null}
              {doc.content ? (
                <p className={cn('text-[13px] leading-relaxed text-[#808080]', isDeck ? 'line-clamp-1' : 'line-clamp-2')}>
                  {stripHtml(doc.content).slice(0, isDeck ? 100 : 200)}
                </p>
              ) : null}
            </div>
          </div>
        )}
      </StaggerItem>
    );
  };

  const docCount = docs.filter(d => d.type !== 'deck').length;
  const deckCount = docs.filter(d => d.type === 'deck').length;
  const sharedCount = sharedLinks.length;

  /* Light segmented tab — active chip is white-on-tint with shadow-seeko. */
  const tabBtn = (active: boolean) =>
    cn(
      'rounded-full px-3.5 h-8 text-[13px] font-medium transition-[color,background-color,box-shadow] duration-150',
      active ? 'bg-white text-[#111] shadow-seeko' : 'text-[#808080] hover:text-[#111]'
    );

  return (
    <>
      {/* Tab toggle + New button */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1 rounded-full bg-black/[0.04] p-1">
          <button type="button" onClick={() => setViewMode('docs')} className={tabBtn(viewMode === 'docs')}>
            Documents{docCount > 0 && <span className="ml-1 tabular-nums text-[#9a9a9a]">{docCount}</span>}
          </button>
          <button type="button" onClick={() => setViewMode('decks')} className={tabBtn(viewMode === 'decks')}>
            Decks{deckCount > 0 && <span className="ml-1 tabular-nums text-[#9a9a9a]">{deckCount}</span>}
          </button>
          {isAdmin && (
            <button type="button" onClick={() => setViewMode('shared')} className={tabBtn(viewMode === 'shared')}>
              Shared{sharedCount > 0 && <span className="ml-1 tabular-nums text-[#9a9a9a]">{sharedCount}</span>}
            </button>
          )}
        </div>
        {isAdmin && viewMode !== 'shared' && (
          <button
            type="button"
            aria-label={viewMode === 'decks' ? 'New Deck' : 'New Document'}
            onClick={() => viewMode === 'decks' ? setEditingDeck('new') : setEditingDoc('new')}
            className={cn(BTN_PRIMARY, 'inline-flex items-center gap-1.5 pl-3.5 pr-4')}
          >
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">{viewMode === 'decks' ? 'New Deck' : 'New Document'}</span>
          </button>
        )}
      </div>

      {/* ── Tab content with directional slide ────────────── */}
      <AnimatePresence mode="wait" custom={tabDirection}>
      {viewMode === 'shared' && isAdmin && (
        <motion.div
          key="shared"
          custom={tabDirection}
          variants={tabSlideVariants}
          initial="enter"
          animate="active"
          exit="exit"
          transition={tabSlideTransition}
          className="flex flex-col gap-2"
        >
          {sharedLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="size-5 animate-spin rounded-full border-2 border-black/10 border-t-[#808080]" />
            </div>
          ) : sharedLinks.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-[#808080]">No shared links yet</p>
          ) : (
            <>
              {(sharedExpanded ? sharedLinks : sharedLinks.slice(0, 3)).map(link => (
                  <div key={link.id} className="overflow-hidden rounded-xl bg-white shadow-seeko">
                    <div className="flex items-center gap-3 p-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#f4f4f4]">
                        {link.doc_type === 'deck' ? (
                          <Presentation className="size-3.5 text-[#808080]" />
                        ) : (
                          <FileText className="size-3.5 text-[#808080]" />
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-[#111]">{link.doc_title ?? 'Untitled'}</p>
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium capitalize', SHARE_STATUS_COLORS[link.status] ?? SHARE_STATUS_COLORS.expired)}>
                            {link.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-[#9a9a9a]">
                          <span className="truncate">{link.recipient_email}</span>
                          <span className="flex shrink-0 items-center gap-1 tabular-nums">
                            <Eye className="size-3" />
                            {link.view_count ?? 0}
                          </span>
                          <span className="shrink-0 tabular-nums">{timeAgo(link.created_at)}</span>
                          {link.expires_at && (link.status === 'pending' || link.status === 'verified') && (
                            <span className="flex shrink-0 items-center gap-1 tabular-nums">
                              <Clock className="size-3" />
                              {timeUntil(link.expires_at)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {(link.status === 'pending' || link.status === 'verified') && (
                          <button
                            type="button"
                            title="Revoke"
                            onClick={() => handleRevoke(link.id)}
                            className="flex size-7 items-center justify-center rounded-md text-[#9a9a9a] transition-[color,background-color] duration-150 hover:bg-[#d4503e]/10 hover:text-[#d4503e]"
                          >
                            <XCircle className="size-3.5" />
                          </button>
                        )}
                        {link.status === 'pending' && (
                          <button
                            type="button"
                            title="Resend"
                            onClick={() => handleResend(link.id)}
                            className="flex size-7 items-center justify-center rounded-md text-[#9a9a9a] transition-[color,background-color] duration-150 hover:bg-black/[0.04] hover:text-[#111]"
                          >
                            <RotateCcw className="size-3.5" />
                          </button>
                        )}
                        {(link.status === 'pending' || link.status === 'verified') && (
                          <button
                            type="button"
                            title="Edit deadline"
                            onClick={() => {
                              const current = link.expires_at ? new Date(link.expires_at).toISOString().split('T')[0] : '';
                              setDeadlineDate(current);
                              setEditingDeadlineId(editingDeadlineId === link.id ? null : link.id);
                            }}
                            className="flex size-7 items-center justify-center rounded-md text-[#9a9a9a] transition-[color,background-color] duration-150 hover:bg-black/[0.04] hover:text-[#111]"
                          >
                            <Calendar className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <AnimatePresence>
                      {editingDeadlineId === link.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ type: 'spring', visualDuration: 0.3, bounce: 0 }}
                          className="overflow-hidden border-t border-black/[0.06]"
                        >
                          <div className="flex flex-col gap-2 p-3">
                            <p className="text-xs text-[#808080]">
                              Current expiry: {link.expires_at ? new Date(link.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'None'}
                            </p>
                            <DatePicker
                              value={deadlineDate}
                              onChange={setDeadlineDate}
                              minDate={(() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(0,0,0,0); return d; })()}
                              dateLabel="New deadline"
                            />
                            <div className="mt-1 flex items-center gap-2">
                              <button
                                type="button"
                                disabled={!deadlineDate || deadlineLoading}
                                onClick={() => handleUpdateDeadline(link.id, deadlineDate)}
                                className={cn(BTN_PRIMARY, 'inline-flex items-center gap-1.5 disabled:opacity-50')}
                              >
                                {deadlineLoading ? <Loader2 className="size-3 animate-spin" /> : null}
                                Update
                              </button>
                              <button
                                type="button"
                                onClick={() => { setEditingDeadlineId(null); setDeadlineDate(''); }}
                                className="rounded-full px-4 h-9 text-[13px] font-medium text-[#808080] transition-colors duration-150 hover:text-[#111]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
              ))}
              {sharedLinks.length > 3 && (
                <button
                  type="button"
                  onClick={() => setSharedExpanded(prev => !prev)}
                  className="py-1.5 text-[13px] text-[#808080] transition-colors duration-150 hover:text-[#111]"
                >
                  {sharedExpanded ? 'Show less' : `Show ${sharedLinks.length - 3} more`}
                </button>
              )}
            </>
          )}
        </motion.div>
      )}

      {viewMode !== 'shared' && (sortedDocs.length === 0 && docs.filter(d => viewMode === 'decks' ? d.type === 'deck' : d.type !== 'deck').length === 0 ? (
        <motion.div
          key={viewMode}
          custom={tabDirection}
          variants={tabSlideVariants}
          initial="enter"
          animate="active"
          exit="exit"
          transition={tabSlideTransition}
        >
          {/* Empty state — custom light (shared EmptyState bakes near-white text) */}
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-8 py-14 text-center shadow-seeko">
            <div className="flex size-12 items-center justify-center rounded-full bg-[#0d7aff]/10">
              <FileText className="size-5 text-[#0d7aff]" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-[15px] font-semibold text-[#111]">
                {viewMode === 'decks' ? 'No decks yet' : 'No documents yet'}
              </p>
              <p className="max-w-sm text-[13px] text-[#808080]">
                {isAdmin
                  ? (viewMode === 'decks'
                    ? 'Upload a PDF to create your first deck.'
                    : 'Create your first document to share specs and resources with the team.')
                  : (viewMode === 'decks'
                    ? 'Decks will appear here when the team uploads them.'
                    : 'Your lead can add team documents. Check back later or ask them to create one.')}
              </p>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={() => viewMode === 'decks' ? setEditingDeck('new') : setEditingDoc('new')}
                className={cn(BTN_PRIMARY, 'mt-1 inline-flex items-center gap-1.5 pl-3.5 pr-4')}
              >
                <Plus className="size-3.5" />
                {viewMode === 'decks' ? 'Upload a deck' : 'Create your first document'}
              </button>
            )}
          </div>
        </motion.div>
      ) : (
        <motion.div
          key={viewMode}
          custom={tabDirection}
          variants={tabSlideVariants}
          initial="enter"
          animate="active"
          exit="exit"
          transition={tabSlideTransition}
        >
          {/* Search + filter row */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#9a9a9a]" />
              <input
                type="search"
                placeholder={viewMode === 'decks' ? 'Search decks…' : 'Search documents…'}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className={cn(LIGHT_INPUT, 'h-9 w-full pl-9 pr-3 text-[13px] outline-none')}
              />
            </div>
            <FilterPill
              label="Department"
              value={departmentFilter}
              options={[
                { value: 'all', label: 'All' },
                ...DEPARTMENTS.map(d => ({ value: d, label: d })),
              ]}
              onChange={setDepartmentFilter}
            />
          </div>

          {sortedDocs.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-[#808080]">
              No documents match your search or filter.
            </p>
          ) : (
            <div className="flex flex-col gap-7">
              {/* Grouped unlocked docs — one white card per department, divide-y rows */}
              {grouped.groups.map(([dept, deptDocs]) => (
                <div key={dept}>
                  <div className="mb-2.5 flex items-center gap-2 px-1">
                    <span className="text-[13px] font-medium text-[#808080]">{dept}</span>
                    <span className="text-[12px] tabular-nums text-[#9a9a9a]">{deptDocs.length}</span>
                  </div>
                  <section className="overflow-hidden rounded-2xl bg-white shadow-seeko">
                    <Stagger
                      className="divide-y divide-black/[0.06]"
                      staggerMs={LIST.staggerMs / 1000}
                      delayMs={LIST.delayMs / 1000}
                    >
                      {deptDocs.map(renderDocRow)}
                    </Stagger>
                  </section>
                </div>
              ))}

              {/* Condensed locked docs */}
              {grouped.locked.length > 0 && (
                <div>
                  <div className="mb-2.5 flex items-center gap-2 px-1">
                    <span className="text-[13px] font-medium text-[#9a9a9a]">Restricted</span>
                    <span className="text-[12px] tabular-nums text-[#b0b0b0]">{grouped.locked.length}</span>
                  </div>
                  <section className="overflow-hidden rounded-2xl bg-white shadow-seeko">
                    <div className="divide-y divide-black/[0.06]">
                      {grouped.locked.map(doc => (
                        <div
                          key={doc.id}
                          className="flex cursor-default items-center gap-2.5 px-4 py-3"
                        >
                          <Lock className="size-3.5 shrink-0 text-[#b0b0b0]" />
                          <p className="flex-1 truncate text-[13px] text-[#9a9a9a]">{doc.title}</p>
                          {doc.restricted_department?.map(dept => (
                            <span key={dept} className="shrink-0 text-[11px] text-[#b0b0b0]">{dept}</span>
                          ))}
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}
            </div>
          )}
        </motion.div>
      ))}
      </AnimatePresence>

      {/* Read dialog */}
      <Dialog
        open={!!selected}
        onOpenChange={() => setSelected(null)}
        resizable
        light
        actions={isAdmin && selected ? (
          <button
            type="button"
            title="Share externally"
            onClick={() => setShareDoc(selected)}
            className="flex size-8 items-center justify-center rounded-md text-[#505050] transition-[background-color,opacity] duration-150 hover:bg-black/[0.04] focus:outline-none"
          >
            <Share2 className="size-3.5" />
          </button>
        ) : undefined}
      >
        {selected && (
          <>
            <DialogClose onClose={() => setSelected(null)} />
            <DialogHeader>
              <div className="flex items-center gap-2 pr-20">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#f4f4f4]">
                  {selected.type === 'deck' ? <Presentation className="size-4 text-[#808080]" /> : <FileText className="size-4 text-[#808080]" />}
                </div>
                <DialogTitle>{selected.title}</DialogTitle>
              </div>
            </DialogHeader>
            <div className="doc-read-body min-w-0 overflow-x-auto px-2 pt-4 pb-8 max-w-3xl mx-auto">
              {selected.type === 'deck' && selected.slides ? (
                <DeckViewer slides={selected.slides} title={selected.title} notes={selected.content} orientation={selected.deck_orientation} />
              ) : selected.content ? (
                <DocContent html={selected.content} />
              ) : (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-[#f4f4f4]">
                    <FileText className="size-5 text-[#9a9a9a]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#111]">No content yet</p>
                    <p className="text-xs text-[#808080] mt-1">Edit this document to add content.</p>
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => { setSelected(null); setEditingDoc(selected); }}
                      className="mt-2 text-xs font-medium text-[#0d7aff] hover:text-[#0a63cc] transition-colors"
                    >
                      Edit document
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </Dialog>

      {/* Edit / New document dialog */}
      <Dialog open={editingDoc !== null} onOpenChange={() => setEditingDoc(null)} resizable light>
        {editingDoc !== null && (
          <>
            <DialogClose onClose={() => setEditingDoc(null)} />
            <DialogHeader>
              <DialogTitle>{editingDoc === 'new' ? 'New Document' : 'Edit Document'}</DialogTitle>
            </DialogHeader>
            <DocEditor
              doc={editingDoc === 'new' ? undefined : editingDoc}
              onSave={handleSave}
              onCancel={() => setEditingDoc(null)}
              team={team}
            />
          </>
        )}
      </Dialog>

      {/* Edit / New deck dialog */}
      <Dialog open={editingDeck !== null} onOpenChange={() => setEditingDeck(null)} resizable light>
        {editingDeck !== null && (
          <>
            <DialogClose onClose={() => setEditingDeck(null)} />
            <DialogHeader>
              <DialogTitle>{editingDeck === 'new' ? 'New Deck' : 'Edit Deck'}</DialogTitle>
            </DialogHeader>
            <DeckEditor
              doc={editingDeck === 'new' ? undefined : editingDeck}
              onSave={handleSave}
              onCancel={() => setEditingDeck(null)}
              team={team}
            />
          </>
        )}
      </Dialog>

      {/* Share externally dialog */}
      {shareDoc && (
        <DocShareDialog
          open={!!shareDoc}
          onOpenChange={(open) => { if (!open) setShareDoc(null); }}
          docId={shareDoc.id}
          docTitle={shareDoc.title}
        />
      )}
    </>
  );
}
