'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from '@/lib/react-router-adapters';
import { FileText, Pencil, Trash2, Plus, Search, Clock, ChevronDown, Presentation, Share2, XCircle, RotateCcw, Eye, Calendar, Loader2, MoreHorizontal, Lock, Braces, Palette, PenTool, Clapperboard, Package, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Doc } from '@/lib/types';
import type { Profile } from '@/lib/types';
import { Dialog, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { SidePanel } from '@/components/ui/side-panel';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { dynamic } from '@/lib/react-router-adapters';
import { TAB_PILL_SPRING } from '@/lib/motion';
import { Stagger, StaggerItem } from '@/components/motion';
import { BTN_PRIMARY, LIGHT_SIGNING_STATUS } from '@/components/dashboard/lightKit';
import { DocDeleteConfirm } from './DocDeleteConfirm';
import { DocContent } from './DocContent';
import { DocShareDialog } from './DocShareDialog';
import { DatePicker } from '@/components/ui/date-picker';
import { useHaptics } from '@/components/HapticsProvider';

/* ─────────────────────────────────────────────────────────
 * Code-split the heavy editor/viewer surfaces. DocEditor and
 * DeckEditor pull in TipTap/ProseMirror; DeckViewer pulls in
 * its own slide machinery. All three are only mounted behind
 * user interaction (Edit/New, or opening a doc) and live behind
 * auth, so we lazy-load their JS and skip SSR — they are never
 * present in the server-rendered or first-paint client tree
 * (deep-link `?doc=` opens the viewer only post-mount via a
 * client effect, never on initial render).
 * ───────────────────────────────────────────────────────── */
const EditorFallback = () => (
  <div className="flex items-center justify-center py-16">
    <Loader2 className="size-5 animate-spin text-ink-faint" />
  </div>
);

const DocEditor = dynamic(() => import('./DocEditor').then(m => m.DocEditor), {
  loading: EditorFallback,
  ssr: false,
});
const DeckEditor = dynamic(() => import('./DeckEditor').then(m => m.DeckEditor), {
  loading: EditorFallback,
  ssr: false,
});
const DeckViewer = dynamic(() => import('./DeckViewer').then(m => m.DeckViewer), {
  loading: EditorFallback,
  ssr: false,
});

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
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
 *    0ms   ledger card visible
 *   50ms   stagger between each doc row (fade + rise)
 *  Hover   row tints; trailing "…" menu fades in (opacity only)
 * ───────────────────────────────────────────────────────── */

const LIST = {
  staggerMs: 50,   // ms between each row
  delayMs:   0,    // ms before first row
};

const TAB_ORDER: Record<string, number> = { docs: 0, decks: 1, shared: 2 };

/* Tab continuity: outgoing and incoming content overlap (popLayout) and
   cross-slide with a light blur so the swap reads as one motion, not two. */
const tabSlideVariants = {
  enter: (d: number) => ({ opacity: 0, x: d * 32, filter: 'blur(2px)' }),
  active: { opacity: 1, x: 0, filter: 'blur(0px)' },
  exit: (d: number) => ({ opacity: 0, x: d * -32, filter: 'blur(2px)' }),
};

const tabFadeVariants = {
  enter: { opacity: 0 },
  active: { opacity: 1 },
  exit: { opacity: 0 },
};

const tabSlideTransition = {
  duration: 0.26,
  ease: [0.77, 0, 0.175, 1] as const,
};

/* Document glyphs relay the owning team. Color is hover-revealed: `hoverInk`
   colors the glyph and `glow` tints the glass overlay when the row is hovered. */
const DEPT_DOC_ICON: Record<string, { Icon: LucideIcon; ink: string; hoverInk: string; glow: string }> = {
  'Coding':         { Icon: Braces,       ink: 'text-seeko-accent', hoverInk: 'group-hover:text-seeko-accent group-focus-visible:text-seeko-accent', glow: '#0d7aff' },
  'Visual Art':     { Icon: Palette,      ink: 'text-[#4757e6] dark:text-dept-ink-visual-art', hoverInk: 'group-hover:text-[#4757e6] group-focus-visible:text-[#4757e6] dark:group-hover:text-dept-ink-visual-art dark:group-focus-visible:text-dept-ink-visual-art', glow: '#4757e6' },
  'UI/UX':          { Icon: PenTool,      ink: 'text-[#7c3aed] dark:text-dept-ink-ui-ux', hoverInk: 'group-hover:text-[#7c3aed] group-focus-visible:text-[#7c3aed] dark:group-hover:text-dept-ink-ui-ux dark:group-focus-visible:text-dept-ink-ui-ux', glow: '#7c3aed' },
  'Animation':      { Icon: Clapperboard, ink: 'text-[#b45309] dark:text-dept-ink-animation', hoverInk: 'group-hover:text-[#b45309] group-focus-visible:text-[#b45309] dark:group-hover:text-dept-ink-animation dark:group-focus-visible:text-dept-ink-animation', glow: '#f59e0b' },
  'Asset Creation': { Icon: Package,      ink: 'text-[#e0447e] dark:text-dept-ink-asset-creation', hoverInk: 'group-hover:text-[#e0447e] group-focus-visible:text-[#e0447e] dark:group-hover:text-dept-ink-asset-creation dark:group-focus-visible:text-dept-ink-asset-creation', glow: '#e0447e' },
};

/* Glass-chip icon tile. On a flat light canvas there is nothing behind the
   chip to refract, so the color lives INSIDE the glass: a tinted body the
   dept hue soaks through, a defined crescent glare across the top (the
   light-catch that makes it read as glass rather than a gradient), grain,
   and a bright inner ring + dense tinted bottom edge (pane thickness).
   No drop shadow — the chip sits flush on the canvas (user call). */
const GLASS_TILE =
  'relative flex shrink-0 items-center justify-center rounded-[12px]';

const GLASS_NOISE =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='96' height='96' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E")`;

function glassTileStyle(glow?: string): React.CSSProperties {
  const tintTop = glow ? `${glow}1c` : 'rgba(0,0,0,0.02)';
  const tintBottom = glow ? `${glow}40` : 'rgba(0,0,0,0.05)';
  return {
    background: [
      GLASS_NOISE,
      'radial-gradient(130% 95% at 50% -35%, rgba(255,255,255,0.8) 38%, rgba(255,255,255,0.06) 68%, rgba(255,255,255,0) 75%)',
      `linear-gradient(180deg, ${tintTop}, ${tintBottom})`,
    ].join(', '),
    boxShadow: [
      'inset 0 1px 1px rgba(255,255,255,0.9)',
      'inset 0 0 0 1px rgba(255,255,255,0.45)',
      glow ? `inset 0 -2px 3px ${glow}52` : 'inset 0 -2px 3px rgba(0,0,0,0.05)',
      glow ? `0 0 0 1px ${glow}47` : '0 0 0 1px rgba(0,0,0,0.07)',
    ].join(', '),
  };
}

/* Icon-button used across the Shared table rows */
const ROW_ICON_BTN =
  'flex size-8 items-center justify-center rounded-[10px] text-ink-muted transition-[color,background-color,transform] duration-150 hover:bg-wash-5 hover:text-ink-title active:scale-[0.97]';

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
            'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full pl-4 pr-3 text-[13px] font-medium transition-[color,background-color] duration-150',
            value !== 'all'
              ? 'bg-wash-6 text-ink-title'
              : 'bg-wash-4 text-ink-muted hover:bg-wash-6 hover:text-ink-title'
          )}
        >
          {value !== 'all' ? options.find(o => o.value === value)?.label ?? label : label}
          <ChevronDown className="size-3 text-ink-faint" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent light align="end" className="min-w-[176px]">
        {options.map(opt => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => onChange(opt.value)}
            selected={opt.value === value}
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
  // is_investor rides along (optional — the investor docs payload omits it) so
  // the admin editors can label investor entries in the grant picker.
  team?: Pick<Profile, 'id' | 'display_name' | 'is_investor'>[];
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
  const reduce = useReducedMotion();

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
  // Last non-null selection — keeps the read panel populated during its exit slide.
  const lastSelectedRef = useRef<Doc | null>(null);
  if (selected) lastSelectedRef.current = selected;
  const readDoc = selected ?? lastSelectedRef.current;
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
    // If the deleted doc is open in the read panel, slide it closed too.
    setSelected(prev => (prev?.id === id ? null : prev));
    setDeletingId(null);
    toast.success('Document deleted');
    trigger('success');
  };

  /* ── Render: one two-line row inside the ledger card.
   * The whole row opens the read dialog (Quartz/Linear pattern);
   * admin actions live in a hover/focus-revealed "…" menu so the
   * resting state carries zero button chrome. ── */
  const renderDocRow = (doc: Doc) => {
    const recent = isRecentlyUpdated(doc);
    const isDeck = doc.type === 'deck';
    const thumb = isDeck ? doc.slides?.[0] : undefined;
    const locked = isLocked(doc);
    const updated = doc.updated_at ?? doc.created_at;
    const restrictedTo = doc.restricted_department ?? [];
    const deptIcon = !isDeck && !locked ? DEPT_DOC_ICON[restrictedTo[0] ?? ''] : undefined;
    const DocGlyph = deptIcon?.Icon ?? FileText;
    const openDoc = () => { if (!locked) setSelected(doc); };
    return (
      <StaggerItem key={doc.id}>
        {deletingId === doc.id ? (
          <div className="px-5 py-3">
            <DocDeleteConfirm
              docId={doc.id}
              docTitle={doc.title}
              onDelete={handleDelete}
              onCancel={() => setDeletingId(null)}
            />
          </div>
        ) : (
          <div
            role={locked ? undefined : 'button'}
            tabIndex={locked ? undefined : 0}
            onClick={openDoc}
            onKeyDown={(e) => { if (!locked && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDoc(); } }}
            className={cn(
              'group flex items-center gap-4 rounded-[14px] px-4 py-3.5 transition-[background-color] duration-150 focus-visible:outline-none',
              locked
                ? 'cursor-default'
                : 'cursor-pointer hover:bg-wash-3 active:bg-wash-5 focus-visible:bg-wash-4',
            )}
          >
            {thumb ? (
              <div className="relative shrink-0">
                {/* back sheet — peeks below multi-slide decks so they read as a stack */}
                {(doc.slides?.length ?? 0) > 1 && (
                  <div className="absolute inset-x-1.5 -bottom-[3px] h-full rounded-[10px] bg-surface-1 shadow-[0_0_0_1px_rgba(0,0,0,0.05)]" />
                )}
                <div className="relative h-14 w-[100px] overflow-hidden rounded-[10px] bg-surface-1 shadow-[0_0_0_1px_rgba(0,0,0,0.07),0_1px_3px_rgba(0,0,0,0.06)]">
                  <img
                    src={thumb.thumbnail_url ?? thumb.url}
                    alt=""
                    width={100}
                    height={56}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.04]"
                  />
                  {recent && (
                    <span className="absolute right-1 top-1 size-2 rounded-full bg-seeko-accent ring-2 ring-white" />
                  )}
                </div>
              </div>
            ) : (
              <div
                className={cn(GLASS_TILE, 'size-10', locked && 'opacity-60')}
                style={glassTileStyle(undefined)}
              >
                {/* Tiles rest uniform-neutral; the dept tint lives on an overlay
                    that fades in on row hover (gradients can't transition, opacity can). */}
                {!locked && deptIcon && (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-[12px] opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 group-focus-visible:opacity-100"
                    style={glassTileStyle(deptIcon.glow)}
                  />
                )}
                {locked
                  ? <Lock className="size-[15px] text-ink-faint" />
                  : isDeck
                    ? <Presentation className="relative size-4 text-ink-muted" />
                    : (
                      <DocGlyph
                        className={cn(
                          'relative size-4 text-ink-muted transition-colors duration-200 ease-out',
                          deptIcon?.hoverInk,
                        )}
                      />
                    )}
                {recent && (
                  <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-seeko-accent ring-2 ring-white" />
                )}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className={cn('truncate text-[14px] font-medium', locked ? 'text-ink-faint' : 'text-ink-title')}>
                {doc.title}
              </p>
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-faint">
                <span>{isDeck ? (doc.slides?.length ? `Deck · ${doc.slides.length} ${doc.slides.length === 1 ? 'slide' : 'slides'}` : 'Deck') : 'Document'}</span>
                {locked ? (
                  <>
                    <span className="text-[#d0d0d0] dark:text-ink-ghost">·</span>
                    <span>Restricted</span>
                  </>
                ) : restrictedTo.length > 0 ? (
                  <>
                    <span className="text-[#d0d0d0] dark:text-ink-ghost">·</span>
                    <span className="truncate">{restrictedTo[0]}</span>
                  </>
                ) : null}
              </div>
            </div>

            <span className="shrink-0 text-[12px] tabular-nums text-[#a0a0a0] dark:text-ink-faint">
              {updated ? timeAgo(updated) : ''}
            </span>

            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Actions for ${doc.title}`}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      ROW_ICON_BTN,
                      'shrink-0 opacity-0 transition-[opacity,color,background-color,transform] group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100',
                    )}
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent light align="end" className="min-w-[152px]">
                  <DropdownMenuItem onClick={() => setSelected(doc)}>
                    <Eye className="size-3.5 text-ink-faint" />
                    Open
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => isDeck ? setEditingDeck(doc) : setEditingDoc(doc)}>
                    <Pencil className="size-3.5 text-ink-faint" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShareDoc(doc)}>
                    <Share2 className="size-3.5 text-ink-faint" />
                    Share
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setDeletingId(doc.id)}
                    className="text-[#b4432f] dark:text-danger hover:bg-danger/[0.08] hover:text-[#b4432f] dark:hover:text-danger focus:bg-danger/[0.08] focus:text-[#b4432f] dark:focus:text-danger"
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </StaggerItem>
    );
  };

  const sharedCount = sharedLinks.length;
  const baseModeCount = docs.filter(d => viewMode === 'decks' ? d.type === 'deck' : d.type !== 'deck').length;

  /* Light segmented tab. The active chip is a single shared-layout element
     (layoutId) that springs between tabs instead of cross-fading per-button —
     it auto-resizes to each tab's width as it slides. */
  const TABS = [
    { key: 'docs' as const, label: 'Documents' },
    { key: 'decks' as const, label: 'Decks' },
    ...(isAdmin ? [{ key: 'shared' as const, label: 'Shared' }] : []),
  ];
  const pillTransition = reduce ? { duration: 0 } : TAB_PILL_SPRING;

  return (
    <>
      <div className="relative">
        {/* ── Toolbar row — tabs left, search + filter + create right, all on canvas ── */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-1 rounded-full bg-wash-4 p-1">
            {TABS.map(({ key, label }) => {
              const active = viewMode === key;
              return (
                <button
                  key={key}
                  type="button"
                  data-testid={`${label} tab`}
                  onClick={() => setViewMode(key)}
                  className={cn(
                    'relative inline-flex h-8 items-center justify-center rounded-full px-3.5 text-[13px] font-medium transition-[color,transform] duration-150 active:scale-[0.97]',
                    active ? 'text-ink-title' : 'text-ink-muted hover:text-ink-title'
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="docsTabPill"
                      initial={false}
                      transition={pillTransition}
                      className="absolute inset-0 rounded-full bg-surface-1 shadow-seeko"
                    />
                  )}
                  <span className="relative z-10">{label}</span>
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {viewMode !== 'shared' && (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
                  <input
                    type="search"
                    placeholder={viewMode === 'decks' ? 'Search decks...' : 'Search documents...'}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="h-9 w-[210px] rounded-full bg-wash-4 pl-9 pr-4 text-[13px] text-ink-strong outline-none transition-[background-color] duration-150 placeholder:text-ink-faint hover:bg-wash-6 focus:bg-wash-6 focus-visible:ring-2 focus-visible:ring-seeko-accent/40 max-sm:w-[150px]"
                  />
                </div>
                <FilterPill
                  label="Department"
                  value={departmentFilter}
                  options={[
                    { value: 'all', label: 'All departments' },
                    ...DEPARTMENTS.map(d => ({ value: d, label: d })),
                  ]}
                  onChange={setDepartmentFilter}
                />
              </>
            )}
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(BTN_PRIMARY, 'inline-flex shrink-0 items-center gap-1.5 pl-3.5')}
                  >
                    <Plus className="size-3.5" />
                    New
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent light align="end" className="min-w-[152px]">
                  <DropdownMenuItem onClick={() => setEditingDoc('new')}>
                    <FileText className="size-3.5 text-ink-faint" />
                    Document
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setEditingDeck('new')}>
                    <Presentation className="size-3.5 text-ink-faint" />
                    Deck
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* ── Content — one white ledger card per tab ── */}
        <AnimatePresence mode="popLayout" custom={tabDirection} initial={false}>
          {viewMode === 'shared' && isAdmin && (
            <motion.div
              key="shared"
              custom={tabDirection}
              variants={reduce ? tabFadeVariants : tabSlideVariants}
              initial="enter"
              animate="active"
              exit="exit"
              transition={tabSlideTransition}
              className="mt-4 rounded-[20px] bg-surface-1 p-5 shadow-seeko"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-medium text-ink-title">External access</h2>
                  <p className="mt-0.5 text-[12px] text-ink-muted">Share links, recipient state, and expiry controls.</p>
                </div>
                <span className="rounded-full bg-wash-4 px-2.5 py-1 text-[12px] tabular-nums text-[#777777] dark:text-ink-muted">{sharedCount} total</span>
              </div>

              {sharedLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="size-5 animate-spin rounded-full border-2 border-black/10 border-t-ink-muted" />
                </div>
              ) : sharedLinks.length === 0 ? (
                <p className="rounded-[14px] bg-wash-3 py-10 text-center text-[13px] text-ink-muted">No shared links yet</p>
              ) : (
                <div className="overflow-hidden rounded-[14px] bg-surface-1 shadow-[0_0_0_1px_rgba(0,0,0,0.06)]">
                  <div className="grid grid-cols-[minmax(0,1fr)_160px_104px_112px] gap-4 border-b border-wash-6 px-4 py-2 text-[12px] font-medium text-ink-faint max-lg:hidden">
                    <span>Document</span>
                    <span>Recipient</span>
                    <span>Status</span>
                    <span className="text-right">Actions</span>
                  </div>
                  <div className="divide-y divide-wash-6">
                    {(sharedExpanded ? sharedLinks : sharedLinks.slice(0, 6)).map(link => (
                      <div key={link.id} className="grid grid-cols-[minmax(0,1fr)_160px_104px_112px] items-center gap-4 px-4 py-3 max-lg:grid-cols-[minmax(0,1fr)_112px]">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-control-fill">
                            {link.doc_type === 'deck' ? (
                              <Presentation className="size-4 text-ink-muted" />
                            ) : (
                              <FileText className="size-4 text-ink-muted" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[13.5px] font-medium text-ink-title">{link.doc_title ?? 'Untitled'}</p>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-faint">
                              <span className="flex items-center gap-1 tabular-nums"><Eye className="size-3" />{link.view_count ?? 0}</span>
                              <span className="tabular-nums">{timeAgo(link.created_at)}</span>
                              {link.expires_at && (link.status === 'pending' || link.status === 'verified') && (
                                <span className="flex items-center gap-1 tabular-nums"><Clock className="size-3" />{timeUntil(link.expires_at)}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <span className="truncate text-[12px] text-[#777777] dark:text-ink-muted max-lg:hidden">{link.recipient_email}</span>
                        <span className={cn('w-fit rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize', LIGHT_SIGNING_STATUS[link.status] ?? LIGHT_SIGNING_STATUS.expired)}>
                          {link.status}
                        </span>
                        <div className="flex justify-end gap-1.5">
                          {(link.status === 'pending' || link.status === 'verified') && (
                            <button type="button" title="Revoke" onClick={() => handleRevoke(link.id)} className={cn(ROW_ICON_BTN, 'hover:bg-danger/10 hover:text-danger')}>
                              <XCircle className="size-3.5" />
                            </button>
                          )}
                          {link.status === 'pending' && (
                            <button type="button" title="Resend" onClick={() => handleResend(link.id)} className={ROW_ICON_BTN}>
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
                              className={ROW_ICON_BTN}
                            >
                              <Calendar className="size-3.5" />
                            </button>
                          )}
                        </div>
                        <AnimatePresence>
                          {editingDeadlineId === link.id && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ type: 'spring', visualDuration: 0.3, bounce: 0 }}
                              className="col-span-full overflow-hidden border-t border-wash-6"
                            >
                              <div className="flex flex-col gap-2 py-3">
                                <p className="text-xs text-ink-muted">
                                  Current expiry: {link.expires_at ? new Date(link.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'None'}
                                </p>
                                <DatePicker
                                  value={deadlineDate}
                                  onChange={setDeadlineDate}
                                  minDate={(() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(0,0,0,0); return d; })()}
                                  dateLabel="New deadline"
                                />
                                <div className="mt-1 flex items-center gap-2">
                                  <button type="button" disabled={!deadlineDate || deadlineLoading} onClick={() => handleUpdateDeadline(link.id, deadlineDate)} className={cn(BTN_PRIMARY, 'inline-flex items-center gap-1.5 disabled:opacity-50')}>
                                    {deadlineLoading ? <Loader2 className="size-3 animate-spin" /> : null}
                                    Update
                                  </button>
                                  <button type="button" onClick={() => { setEditingDeadlineId(null); setDeadlineDate(''); }} className="h-9 rounded-full px-4 text-[13px] font-medium text-ink-muted transition-colors duration-150 hover:text-ink-title">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {sharedLinks.length > 6 && (
                <button type="button" onClick={() => setSharedExpanded(prev => !prev)} className="mt-3 py-1.5 text-[13px] text-ink-muted transition-colors duration-150 hover:text-ink-title">
                  {sharedExpanded ? 'Show less' : `Show ${sharedLinks.length - 6} more`}
                </button>
              )}
            </motion.div>
          )}

          {viewMode !== 'shared' && (
            <motion.div
              key={viewMode}
              custom={tabDirection}
              variants={reduce ? tabFadeVariants : tabSlideVariants}
              initial="enter"
              animate="active"
              exit="exit"
              transition={tabSlideTransition}
              className="mt-4"
            >
              {baseModeCount === 0 ? (
                <div className="flex flex-col items-center rounded-[20px] bg-surface-1 px-8 py-16 text-center shadow-seeko">
                  <p className="text-balance text-[15px] font-semibold text-ink-title">{viewMode === 'decks' ? 'No decks yet' : 'No documents yet'}</p>
                  <p className="mt-1.5 max-w-[44ch] text-pretty text-[13px] leading-relaxed text-ink-muted">
                    {isAdmin
                      ? (viewMode === 'decks' ? 'Upload a PDF to create your first deck.' : 'Create your first document to share specs and resources with the team.')
                      : (viewMode === 'decks' ? 'Decks will appear here when the team uploads them.' : 'Your lead can add team documents. Check back later or ask them to create one.')}
                  </p>
                  {isAdmin && (
                    <button type="button" onClick={() => viewMode === 'decks' ? setEditingDeck('new') : setEditingDoc('new')} className={cn(BTN_PRIMARY, 'mt-6 inline-flex items-center gap-1.5 pl-3.5 pr-4')}>
                      <Plus className="size-3.5" />
                      {viewMode === 'decks' ? 'Upload a deck' : 'Create your first document'}
                    </button>
                  )}
                </div>
              ) : sortedDocs.length === 0 ? (
                <div className="rounded-[20px] bg-surface-1 py-14 text-center shadow-seeko">
                  <p className="text-[13px] text-ink-muted">No {viewMode === 'decks' ? 'decks' : 'documents'} match your search or filter.</p>
                </div>
              ) : (
                <section>
                  <Stagger className="divide-y divide-wash-5" staggerMs={LIST.staggerMs / 1000} delayMs={LIST.delayMs / 1000}>
                    {sortedDocs.map(renderDocRow)}
                  </Stagger>
                </section>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Read panel — left slide-over. `readDoc` snapshots the last opened doc
          so content stays mounted while the panel eases back out; switching
          docs while open crossfades header + body (keyed on doc id). */}
      <SidePanel
        open={!!selected}
        onOpenChange={() => setSelected(null)}
        scrollKey={readDoc?.id}
        header={readDoc && (
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={readDoc.id}
              className="flex min-w-0 items-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.06, ease: 'easeOut' } }}
              transition={{ duration: 0.1, ease: 'easeOut' }}
            >
              {(() => {
                const di = readDoc.type === 'deck' ? undefined : DEPT_DOC_ICON[readDoc.restricted_department?.[0] ?? ''];
                const Glyph = readDoc.type === 'deck' ? Presentation : (di?.Icon ?? FileText);
                return (
                  <div className={cn(GLASS_TILE, 'size-7 rounded-[8px]')} style={glassTileStyle(di?.glow)}>
                    <Glyph className={cn('size-3.5', di ? di.ink : 'text-ink-muted')} />
                  </div>
                );
              })()}
              <h2 className="truncate text-[13px] font-medium text-[#575757] dark:text-ink-body">{readDoc.title}</h2>
            </motion.div>
          </AnimatePresence>
        )}
        actions={isAdmin && readDoc ? (
          <>
            <button
              type="button"
              title="Share externally"
              onClick={() => setShareDoc(readDoc)}
              className="flex size-8 items-center justify-center rounded-lg text-[#6f6f6f] transition-[background-color,color] duration-150 ease-out hover:bg-wash-5 hover:text-ink-title active:bg-wash-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/15 dark:text-ink-muted dark:focus-visible:ring-white/25"
            >
              <Share2 className="size-4" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Actions for ${readDoc.title}`}
                  className="flex size-8 items-center justify-center rounded-lg text-[#6f6f6f] transition-[background-color,color] duration-150 ease-out hover:bg-wash-5 hover:text-ink-title active:bg-wash-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/15 dark:text-ink-muted dark:focus-visible:ring-white/25"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent light align="end" className="min-w-[152px]">
                <DropdownMenuItem onClick={() => readDoc.type === 'deck' ? setEditingDeck(readDoc) : setEditingDoc(readDoc)}>
                  <Pencil className="size-3.5 text-ink-faint" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShareDoc(readDoc)}>
                  <Share2 className="size-3.5 text-ink-faint" />
                  Share
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setDeletingId(readDoc.id)}
                  className="text-[#b4432f] dark:text-danger hover:bg-danger/[0.08] hover:text-[#b4432f] dark:hover:text-danger focus:bg-danger/[0.08] focus:text-[#b4432f] dark:focus:text-danger"
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : undefined}
      >
        {readDoc && (
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={readDoc.id}
              /* Frameless: the document sits directly on the grey pane — no
                 white sheet behind it (user call, matching the frameless
                 list rows). */
              className="doc-read-body min-w-0 overflow-x-auto px-3 pt-2 pb-9"
              initial={{ opacity: 0, filter: 'blur(2px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, filter: 'blur(2px)', transition: { duration: 0.06, ease: 'easeOut' } }}
              transition={{ duration: 0.1, ease: 'easeOut' }}
            >
              {readDoc.type === 'deck' && readDoc.slides ? (
                <DeckViewer slides={readDoc.slides} title={readDoc.title} notes={readDoc.content} orientation={readDoc.deck_orientation} />
              ) : readDoc.content ? (
                <DocContent html={readDoc.content} />
              ) : (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-surface-4">
                    <FileText className="size-5 text-ink-faint" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink-title">No content yet</p>
                    <p className="text-xs text-ink-muted mt-1">Edit this document to add content.</p>
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => { setSelected(null); setEditingDoc(readDoc); }}
                      className="mt-2 text-xs font-medium text-seeko-accent-ink hover:text-[#08509f] dark:hover:text-seeko-accent-strong transition-colors"
                    >
                      Edit document
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </SidePanel>

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
