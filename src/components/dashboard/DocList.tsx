'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { FileText, Lock, Pencil, Trash2, Plus, Search, Clock, ChevronDown, Circle, Presentation, Share2, XCircle, RotateCcw, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Doc } from '@/lib/types';
import type { Profile } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { motion, AnimatePresence } from 'motion/react';
import { Stagger, StaggerItem, HoverCard } from '@/components/motion';
import { EmptyState } from '@/components/ui/empty-state';
import { DocEditor } from './DocEditor';
import { DeckEditor } from './DeckEditor';
import { DeckViewer } from './DeckViewer';
import { DocDeleteConfirm } from './DocDeleteConfirm';
import { DocContent } from './DocContent';
import { DocShareDialog } from './DocShareDialog';
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

function isRecentlyUpdated(doc: Doc): boolean {
  const ts = doc.updated_at ?? doc.created_at;
  if (!ts) return false;
  return Date.now() - new Date(ts).getTime() < RECENTLY_UPDATED_MS;
}

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 *    0ms   list container visible
 *   70ms   stagger between each doc card (fade + rise)
 *  Hover   card lifts 2px (HoverCard)
 * ───────────────────────────────────────────────────────── */

const LIST = {
  staggerMs: 70,   // ms between each card
  delayMs:   0,    // ms before first card
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

const SHARE_STATUS_COLORS: Record<string, string> = {
  pending: 'border-yellow-500/30 text-yellow-400',
  verified: 'border-emerald-500/30 text-emerald-400',
  expired: 'border-muted-foreground/30 text-muted-foreground',
  revoked: 'border-red-500/30 text-red-400',
};

/* ─────────────────────────────────────────────────────────
 * FilterPill (matches Tasks page pattern)
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
            'inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-medium uppercase tracking-wide transition-colors',
            value !== 'all'
              ? 'border-foreground/20 bg-muted text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/20'
          )}
        >
          {value !== 'all' ? options.find(o => o.value === value)?.label ?? label : label}
          <ChevronDown className="size-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map(opt => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => onChange(opt.value)}
            selected={opt.value === value}
            className="text-xs"
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
  currentUserId?: string;
  team?: Pick<Profile, 'id' | 'display_name'>[];
}

export function DocList({ docs: initialDocs, userDepartment, isAdmin = false, currentUserId = '', team = [] }: DocListProps) {
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

  const isLocked = (d: Doc) => {
    if (isAdmin) return false;
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

  /* ── Render: unlocked doc/deck card ───────────────────── */
  const renderDocCard = (doc: Doc) => {
    const recent = isRecentlyUpdated(doc);
    const isDeck = doc.type === 'deck';
    const handleEdit = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isDeck) setEditingDeck(doc);
      else setEditingDoc(doc);
    };
    return (
      <StaggerItem key={doc.id}>
        {deletingId === doc.id ? (
          <DocDeleteConfirm
            docId={doc.id}
            docTitle={doc.title}
            onDelete={handleDelete}
            onCancel={() => setDeletingId(null)}
          />
        ) : (
          <HoverCard>
            <Card
              className="group cursor-pointer transition-colors hover:border-foreground/20"
              onClick={() => setSelected(doc)}
            >
              <CardContent className={cn("flex items-start gap-3.5 p-4", isDeck && doc.slides?.[0] && "flex-col p-0 pb-3")}>
                {/* Deck thumbnail — replaces icon when present */}
                {isDeck && doc.slides?.[0] && (
                  <div className="relative w-full aspect-[16/9] rounded-t-lg overflow-hidden bg-secondary">
                    <img src={doc.slides[0].url} alt="" className="w-full h-full object-cover" />
                    {recent && (
                      <span className="absolute top-2 right-2 size-2 rounded-full bg-seeko-accent" />
                    )}
                  </div>
                )}
                {/* Icon row — only for docs or decks without thumbnails */}
                {(!isDeck || !doc.slides?.[0]) && (
                  <div className="relative flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary">
                    {isDeck ? <Presentation className="size-4 text-foreground" /> : <FileText className="size-4 text-foreground" />}
                    {recent && (
                      <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-seeko-accent" />
                    )}
                  </div>
                )}
                <div className={cn("flex flex-col gap-1 min-w-0 flex-1", isDeck && doc.slides?.[0] && "px-3")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
                      {isDeck && doc.slides && (
                        <span className="text-[10px] text-muted-foreground/50 font-mono">{doc.slides.length} slides</span>
                      )}
                      {recent && (
                        <Badge variant="outline" className="text-[10px] font-medium text-seeko-accent border-seeko-accent/25 shrink-0">Updated</Badge>
                      )}
                      {doc.restricted_department?.map(dept => (
                        <Badge key={dept} variant="outline" className="text-xs font-normal text-muted-foreground shrink-0">{dept}</Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(doc.updated_at || doc.created_at) && (
                        <span className="text-[11px] text-muted-foreground/50 hidden sm:inline">
                          {timeAgo(doc.updated_at ?? doc.created_at!)}
                        </span>
                      )}
                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            title="Edit"
                            onClick={handleEdit}
                            className="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground opacity-0 group-hover:opacity-100"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Delete"
                            onClick={(e) => { e.stopPropagation(); setDeletingId(doc.id); }}
                            className="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {isAdmin && doc.granted_user_ids?.length ? (
                    <p className="text-[11px] text-muted-foreground/70">
                      Also granted: {team.filter(p => doc.granted_user_ids?.includes(p.id)).map(p => p.display_name ?? 'Unknown').join(', ')}
                    </p>
                  ) : null}
                  {!isDeck && doc.content ? (
                    <p className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-2">
                      {stripHtml(doc.content).slice(0, 200)}
                    </p>
                  ) : null}
                  {isDeck && doc.content ? (
                    <p className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-1">
                      {stripHtml(doc.content).slice(0, 100)}
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </HoverCard>
        )}
      </StaggerItem>
    );
  };

  const docCount = docs.filter(d => d.type !== 'deck').length;
  const deckCount = docs.filter(d => d.type === 'deck').length;
  const sharedCount = sharedLinks.length;

  return (
    <>
      {/* Tab toggle + New button */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1 rounded-lg bg-secondary/50 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('docs')}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              viewMode === 'docs'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Documents{docCount > 0 && <span className="ml-1 text-muted-foreground/60">{docCount}</span>}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('decks')}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              viewMode === 'decks'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Decks{deckCount > 0 && <span className="ml-1 text-muted-foreground/60">{deckCount}</span>}
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setViewMode('shared')}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                viewMode === 'shared'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Shared{sharedCount > 0 && <span className="ml-1 text-muted-foreground/60">{sharedCount}</span>}
            </button>
          )}
        </div>
        {isAdmin && viewMode !== 'shared' && (
          <Button
            size="sm"
            aria-label={viewMode === 'decks' ? 'New Deck' : 'New Document'}
            onClick={() => viewMode === 'decks' ? setEditingDeck('new') : setEditingDoc('new')}
          >
            <Plus className="size-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">{viewMode === 'decks' ? 'New Deck' : 'New Document'}</span>
          </Button>
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
              <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
            </div>
          ) : sharedLinks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No shared links yet</p>
          ) : (
            <>
              {(sharedExpanded ? sharedLinks : sharedLinks.slice(0, 3)).map(link => (
                  <Card key={link.id}>
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary">
                        {link.doc_type === 'deck' ? (
                          <Presentation className="size-3.5 text-foreground" />
                        ) : (
                          <FileText className="size-3.5 text-foreground" />
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">{link.doc_title ?? 'Untitled'}</p>
                          <Badge variant="outline" className={cn('text-[10px] font-medium capitalize', SHARE_STATUS_COLORS[link.status] ?? SHARE_STATUS_COLORS.expired)}>
                            {link.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground/70">
                          <span className="truncate">{link.recipient_email}</span>
                          <span className="flex items-center gap-1 shrink-0">
                            <Eye className="size-3" />
                            {link.view_count ?? 0}
                          </span>
                          <span className="shrink-0">{timeAgo(link.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {(link.status === 'pending' || link.status === 'verified') && (
                          <button
                            type="button"
                            title="Revoke"
                            onClick={() => handleRevoke(link.id)}
                            className="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          >
                            <XCircle className="size-3.5" />
                          </button>
                        )}
                        {link.status === 'pending' && (
                          <button
                            type="button"
                            title="Resend"
                            onClick={() => handleResend(link.id)}
                            className="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                          >
                            <RotateCcw className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
              ))}
              {sharedLinks.length > 3 && (
                <button
                  type="button"
                  onClick={() => setSharedExpanded(prev => !prev)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5"
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
        <EmptyState
          icon="FileText"
          title={viewMode === 'decks' ? 'No decks yet' : 'No documents yet'}
          description={isAdmin
            ? (viewMode === 'decks'
              ? 'Upload a PDF to create your first deck.'
              : 'Create your first document to share specs and resources with the team.')
            : (viewMode === 'decks'
              ? 'Decks will appear here when the team uploads them.'
              : 'Your lead can add team documents. Check back later or ask them to create one.')}
          action={isAdmin ? (
            <Button
              size="sm"
              onClick={() => viewMode === 'decks' ? setEditingDeck('new') : setEditingDoc('new')}
            >
              <Plus className="size-3.5 mr-1.5" />
              {viewMode === 'decks' ? 'Upload a deck' : 'Create your first document'}
            </Button>
          ) : undefined}
        />
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
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="search"
                placeholder={viewMode === 'decks' ? 'Search decks…' : 'Search documents…'}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 h-9 w-full"
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
            <p className="text-sm text-muted-foreground py-8 text-center">
              No documents match your search or filter.
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Grouped unlocked docs */}
              {grouped.groups.map(([dept, deptDocs]) => (
                <div key={dept}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">{dept}</p>
                    <div className="flex-1 h-px bg-border/50" />
                    <span className="text-[11px] text-muted-foreground/40">{deptDocs.length}</span>
                  </div>
                  <Stagger
                    className="flex flex-col gap-2"
                    staggerMs={LIST.staggerMs / 1000}
                    delayMs={LIST.delayMs / 1000}
                  >
                    {deptDocs.map(renderDocCard)}
                  </Stagger>
                </div>
              ))}

              {/* Condensed locked docs */}
              {grouped.locked.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/40">Restricted</p>
                    <div className="flex-1 h-px bg-border/50" />
                    <span className="text-[11px] text-muted-foreground/40">{grouped.locked.length}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {grouped.locked.map(doc => (
                      <div
                        key={doc.id}
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 bg-muted/10"
                      >
                        <Lock className="size-3.5 text-muted-foreground/40 shrink-0" />
                        <p className="text-sm text-muted-foreground/50 truncate flex-1">{doc.title}</p>
                        {doc.restricted_department?.map(dept => (
                          <span key={dept} className="text-[10px] text-muted-foreground/30 shrink-0">{dept}</span>
                        ))}
                      </div>
                    ))}
                  </div>
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
        actions={isAdmin && selected ? (
          <button
            type="button"
            title="Share externally"
            onClick={() => setShareDoc(selected)}
            className="flex size-8 items-center justify-center rounded-md opacity-60 transition-opacity hover:opacity-100 hover:bg-white/[0.06] focus:outline-none"
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
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary">
                  {selected.type === 'deck' ? <Presentation className="size-4 text-foreground" /> : <FileText className="size-4 text-foreground" />}
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
                  <div className="flex size-12 items-center justify-center rounded-xl bg-secondary">
                    <FileText className="size-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">No content yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Edit this document to add content.</p>
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => { setSelected(null); setEditingDoc(selected); }}
                      className="mt-2 text-xs font-medium text-seeko-accent hover:text-seeko-accent/80 transition-colors"
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
      <Dialog open={editingDoc !== null} onOpenChange={() => setEditingDoc(null)} resizable>
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
      <Dialog open={editingDeck !== null} onOpenChange={() => setEditingDeck(null)} resizable>
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
