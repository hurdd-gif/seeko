'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileText, Lock, Pencil, Trash2, Plus, Search, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Doc } from '@/lib/types';
import type { Profile } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Stagger, StaggerItem, HoverCard } from '@/components/motion';
import { EmptyState } from '@/components/ui/empty-state';
import { DocEditor } from './DocEditor';
import { DocDeleteConfirm } from './DocDeleteConfirm';
import { DocContent } from './DocContent';
import { useHaptics } from '@/components/HapticsProvider';

const DEPARTMENTS = ['Coding', 'Visual Art', 'UI/UX', 'Animation', 'Asset Creation'] as const;

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
  const [selected, setSelected] = useState<Doc | null>(null);
  const [editingDoc, setEditingDoc] = useState<Doc | 'new' | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [isQuickCreating, setIsQuickCreating] = useState(false);
  const [quickCreateTitle, setQuickCreateTitle] = useState('');
  const [quickCreateLoading, setQuickCreateLoading] = useState(false);
  const quickCreateRef = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();

  const isLocked = (d: Doc) => {
    if (isAdmin) return false;
    const hasDeptRestriction = !!d.restricted_department?.length;
    const inDept = hasDeptRestriction && d.restricted_department!.includes(userDepartment ?? '');
    const granted = !!d.granted_user_ids?.length && d.granted_user_ids.includes(currentUserId);
    return hasDeptRestriction && !inDept && !granted;
  };
  const sortedDocs = useMemo(() => {
    const byLock = [...docs].sort((a, b) =>
      isLocked(a) === isLocked(b) ? 0 : isLocked(a) ? 1 : -1
    );
    const q = searchQuery.trim().toLowerCase();
    const bySearch = q
      ? byLock.filter(d => d.title.toLowerCase().includes(q))
      : byLock;
    if (departmentFilter === 'all') return bySearch;
    return bySearch.filter(d => d.restricted_department?.includes(departmentFilter));
  }, [docs, searchQuery, departmentFilter, isAdmin, userDepartment, currentUserId]);

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
    toast.success(editingDoc === 'new' ? 'Document created' : 'Document saved');
    trigger('success');
  };

  const handleDelete = (id: string) => {
    setDocs(prev => prev.filter(d => d.id !== id));
    setDeletingId(null);
    toast.success('Document deleted');
    trigger('success');
  };

  const handleQuickCreate = async () => {
    const title = quickCreateTitle.trim();
    if (!title) return;
    setQuickCreateLoading(true);
    try {
      const res = await fetch('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content: '' }),
      });
      if (!res.ok) throw new Error('Failed to create');
      const doc = await res.json();
      setDocs(prev => [...prev, doc]);
      setQuickCreateTitle('');
      setIsQuickCreating(false);
      toast.success(`Created "${doc.title}"`);
      trigger('success');
    } catch {
      toast.error('Failed to create document');
    } finally {
      setQuickCreateLoading(false);
    }
  };

  useEffect(() => {
    if (isQuickCreating) {
      setTimeout(() => quickCreateRef.current?.focus(), 50);
    }
  }, [isQuickCreating]);

  useEffect(() => {
    if (!isAdmin) return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'n') {
        e.preventDefault();
        setIsQuickCreating(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAdmin]);

  return (
    <>
      {/* Admin: New Document button + quick create */}
      {isAdmin && (
        <div className="flex items-center justify-end gap-2 mb-3">
          <button
            onClick={() => setIsQuickCreating(true)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="h-4 w-4" />
            Quick create
          </button>
          <Button size="sm" onClick={() => setEditingDoc('new')}>
            <Plus className="size-3.5 mr-1.5" />
            New Document
          </Button>
        </div>
      )}
      {isQuickCreating && (
        <div className="flex items-center gap-2 mb-3">
          <input
            ref={quickCreateRef}
            value={quickCreateTitle}
            onChange={(e) => setQuickCreateTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleQuickCreate(); if (e.key === 'Escape') { setIsQuickCreating(false); setQuickCreateTitle(''); } }}
            placeholder="Document title..."
            disabled={quickCreateLoading}
            className="flex-1 rounded-lg border border-border bg-muted px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-seeko-accent/40"
          />
          <button
            onClick={handleQuickCreate}
            disabled={quickCreateLoading || !quickCreateTitle.trim()}
            className="text-sm text-seeko-accent hover:underline disabled:opacity-50"
          >
            {quickCreateLoading ? 'Creating...' : 'Create'}
          </button>
          <button
            onClick={() => { setIsQuickCreating(false); setQuickCreateTitle(''); }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}

      {docs.length === 0 ? (
        <EmptyState
          icon="FileText"
          title="No documents yet"
          description={isAdmin
            ? 'Create your first document to share specs and resources with the team.'
            : 'Your lead can add team documents. Check back later or ask them to create one.'}
          action={isAdmin ? (
            <Button size="sm" onClick={() => setEditingDoc('new')}>
              <Plus className="size-3.5 mr-1.5" />
              Create your first document
            </Button>
          ) : undefined}
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 mb-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="search"
                placeholder="Search documents…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 h-9 w-full"
              />
            </div>
            <Select
              value={departmentFilter}
              onChange={e => setDepartmentFilter(e.target.value)}
              className="w-full sm:w-[180px] h-9"
            >
              <option value="all">All departments</option>
              {DEPARTMENTS.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </Select>
          </div>

          {sortedDocs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No documents match your search or filter.
            </p>
          ) : (
        <Stagger
          className="flex flex-col gap-3"
          staggerMs={LIST.staggerMs / 1000}
          delayMs={LIST.delayMs / 1000}
        >
          {sortedDocs.map(doc => {
            const locked = isLocked(doc);
            return (
              <StaggerItem key={doc.id}>
                {deletingId === doc.id ? (
                  <DocDeleteConfirm
                    docId={doc.id}
                    docTitle={doc.title}
                    onDelete={handleDelete}
                    onCancel={() => setDeletingId(null)}
                  />
                ) : locked ? (
                  <Card
                    className="cursor-default bg-muted/20 transition-colors"
                  >
                    <CardContent className="flex items-start gap-3.5 p-4">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted/80">
                        <Lock className="size-4 text-muted-foreground" />
                      </div>
                      <div className="flex flex-col gap-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-muted-foreground">{doc.title}</p>
                          {doc.restricted_department?.map(dept => (
                            <Badge key={dept} variant="outline" className="text-xs font-normal text-muted-foreground">{dept} only</Badge>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground/60">
                          Restricted to: {doc.restricted_department?.join(', ')}.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <HoverCard>
                    <Card
                      className="group cursor-pointer transition-colors hover:border-foreground/20"
                      onClick={() => setSelected(doc)}
                    >
                    <CardContent className="flex items-start gap-3.5 p-4">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary">
                        <FileText className="size-4 text-foreground" />
                      </div>
                      <div className="flex flex-col gap-1 min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
                            {doc.restricted_department?.length
                              ? doc.restricted_department.map(dept => (
                                  <Badge key={dept} variant="outline" className="text-xs font-normal text-muted-foreground shrink-0">{dept} only</Badge>
                                ))
                              : <Badge variant="outline" className="text-xs font-normal shrink-0">Document</Badge>
                            }
                          </div>
                          {isAdmin && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                title="Edit"
                                onClick={(e) => { e.stopPropagation(); setEditingDoc(doc); }}
                                className="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                              >
                                <Pencil className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Delete"
                                onClick={(e) => { e.stopPropagation(); setDeletingId(doc.id); }}
                                className="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                        {doc.granted_user_ids?.length ? (
                          <p className="text-[11px] text-muted-foreground/70">
                            Also: {team.filter(p => doc.granted_user_ids?.includes(p.id)).map(p => `@${p.display_name ?? 'Unknown'}`).join(', ')}
                          </p>
                        ) : null}
                        {(doc.updated_at || doc.created_at) && (
                          <p className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                            <Clock className="size-3" />
                            Updated {timeAgo(doc.updated_at ?? doc.created_at!)}
                          </p>
                        )}
                        {doc.content ? (
                          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                            {doc.content.replace(/<[^>]*>/g, '').slice(0, 200)}
                          </p>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </HoverCard>
                )}
              </StaggerItem>
            );
          })}
        </Stagger>
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
                  <FileText className="size-4 text-foreground" />
                </div>
                <DialogTitle>{selected.title}</DialogTitle>
              </div>
            </DialogHeader>
            <div className="doc-read-body -mx-1 min-w-0 overflow-x-auto pt-1 pr-1">
              {selected.content ? (
                <DocContent html={selected.content} />
              ) : (
                <p className="text-sm text-muted-foreground">No content yet.</p>
              )}
            </div>
          </>
        )}
      </Dialog>

      {/* Edit / New dialog */}
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
    </>
  );
}
