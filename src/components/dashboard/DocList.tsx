'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileText, Lock, Pencil, Trash2, Plus, Search, Clock, ChevronDown, Circle, Presentation } from 'lucide-react';
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
import { Stagger, StaggerItem, HoverCard } from '@/components/motion';
import { EmptyState } from '@/components/ui/empty-state';
import { DocEditor } from './DocEditor';
import { DeckEditor } from './DeckEditor';
import { DeckViewer } from './DeckViewer';
import { DocDeleteConfirm } from './DocDeleteConfirm';
import { DocContent } from './DocContent';
import { useHaptics } from '@/components/HapticsProvider';

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
  const [viewMode, setViewMode] = useState<'docs' | 'decks'>('docs');
  const [selected, setSelected] = useState<Doc | null>(null);
  const [editingDoc, setEditingDoc] = useState<Doc | 'new' | null>(null);
  const [editingDeck, setEditingDeck] = useState<Doc | 'new' | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const searchParams = useSearchParams();

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
              <CardContent className={cn("flex items-start gap-3.5 p-4", isDeck && "flex-col")}>
                {/* Deck thumbnail */}
                {isDeck && doc.slides?.[0] && (
                  <div className="w-full aspect-[16/9] rounded-md overflow-hidden bg-secondary">
                    <img src={doc.slides[0].url} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className={cn("flex items-start gap-3.5", isDeck ? "w-full" : "")}>
                  <div className="relative flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary">
                    {isDeck ? <Presentation className="size-4 text-foreground" /> : <FileText className="size-4 text-foreground" />}
                    {recent && (
                      <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-seeko-accent" />
                    )}
                  </div>
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
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
                        {doc.content.replace(/<[^>]*>/g, '').slice(0, 200)}
                      </p>
                    ) : null}
                    {isDeck && doc.content ? (
                      <p className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-1">
                        {doc.content.replace(/<[^>]*>/g, '').slice(0, 100)}
                      </p>
                    ) : null}
                  </div>
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

  return (
    <>
      {/* Tab toggle + New button */}
      <div className="flex items-center justify-between mb-3">
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
        </div>
        {isAdmin && (
          <Button
            size="sm"
            onClick={() => viewMode === 'decks' ? setEditingDeck('new') : setEditingDoc('new')}
          >
            <Plus className="size-3.5 mr-1.5" />
            {viewMode === 'decks' ? 'New Deck' : 'New Document'}
          </Button>
        )}
      </div>

      {sortedDocs.length === 0 && docs.filter(d => viewMode === 'decks' ? d.type === 'deck' : d.type !== 'deck').length === 0 ? (
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
      ) : (
        <>
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
        </>
      )}

      {/* Read dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)} resizable>
        {selected && (
          <>
            <DialogClose onClose={() => setSelected(null)} />
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary">
                  {selected.type === 'deck' ? <Presentation className="size-4 text-foreground" /> : <FileText className="size-4 text-foreground" />}
                </div>
                <DialogTitle>{selected.title}</DialogTitle>
              </div>
            </DialogHeader>
            <div className="doc-read-body -mx-1 min-w-0 overflow-x-auto pt-1 pr-1">
              {selected.type === 'deck' && selected.slides ? (
                <DeckViewer slides={selected.slides} title={selected.title} />
              ) : selected.content ? (
                <DocContent html={selected.content} />
              ) : (
                <p className="text-sm text-muted-foreground">No content yet.</p>
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
    </>
  );
}
