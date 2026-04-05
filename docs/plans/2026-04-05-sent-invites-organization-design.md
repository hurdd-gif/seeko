# Sent Invites Organization — Design

**Date:** 2026-04-05
**Page:** `/admin/external-signing`
**Component:** `src/components/external-signing/InviteTable.tsx`

## Problem

The sent-invites table is a flat list of all rows from `external_signing_invites` (currently 29 rows, growing). Four pain points:

- **A.** Hard to find a specific invite in the flat list
- **B.** Signing and Invoice rows both render as "Custom" — indistinguishable
- **C.** Expired/revoked invites clutter the active ones
- **D.** Multiple invites to the same recipient are scattered

## Scope

Organize sent invites **in place** inside the existing single card — no tabs, no new pages, no new routes. Client-side filtering and grouping only. Doc-share invites are excluded (handled in `/docs`).

## Structure

One `<Card>` with three stacked regions:

```
┌─ Sent Invites (29)         [🔍 Search recipient…]  [⌘ Group] ─┐
│  ● All  ○ Pending  ○ Verified  ○ Signed  ○ Archive           │
│ ─────────────────────────────────────────────────────────── │
│  Recipient              Type    Document        Status   Sent │
│  …                                                             │
│                                                               │
│  Show archived (12) ↓                                        │
└───────────────────────────────────────────────────────────────┘
```

1. **Header row** — title + count on left, search input and group toggle on right
2. **Status filter chip row** — single-select, `All · Pending · Verified · Signed · Archive`
3. **Table** — same columns as today + new `Type` tag column
4. **Archive footer** — inline expand link when archive filter is inactive and archived rows exist

## Filter logic

| Control | Behavior |
|---|---|
| Search | Client-side filter on `recipient_email`, case-insensitive, debounced 150ms |
| Status chip `All` | Shows pending + verified + signed |
| Status chip `Pending` / `Verified` / `Signed` | Single status only |
| Status chip `Archive` | Shows expired + revoked only |
| Group toggle (off) | Flat rows, sorted pending → verified → signed, newest-first within each |
| Group toggle (on) | Collapses rows sharing `recipient_email`; parent shows count + latest status; click chevron to expand |
| Archive footer link | Inline expand (no modal); appears only when status ≠ `Archive` and archived rows exist |

## New: Type column

Replaces the ambiguous "Custom" label with a small muted tag next to the document name:

- `template_type === 'invoice'` → `Invoice` tag
- `template_type === 'preset'` → `Signing` tag + preset template id
- `template_type === 'custom'` → `Signing` tag + custom title
- `template_type === 'doc_share'` → filtered out of this table

## State model

```ts
type SortedStatus = 'all' | 'pending' | 'verified' | 'signed' | 'archive';

const [filters, setFilters] = useState({
  search: '',
  status: 'all' as SortedStatus,
  groupByRecipient: false,
  showArchived: false,
});
```

All derived data (filtered list, grouped list, archive count) is `useMemo`'d off `invites + filters`.

## Motion

```
   0ms   card mounts (initial={false} — no entrance on page load)
   0ms   rows render in current filter state
 →user action: filter chip clicked
   0ms   AnimatePresence exits old rows (opacity → 0, y: -4px, 120ms)
 120ms   new rows enter, staggered 30ms per row
         opacity 0→1, y: 8→0, scale 0.98→1
         spring: { type: 'spring', duration: 0.3, bounce: 0 }
 →user action: group toggle
   0ms   layout animation collapses/expands
         spring: { type: 'spring', duration: 0.35, bounce: 0 }
 →user action: chevron expand
   0ms   child rows slide down, opacity 0→1, staggered 20ms
```

## Craft details

- **Tabular numerals** on `Sent` and `Expires` date columns
- **Text-wrap: pretty** on document titles
- **Concentric radius**: card `rounded-xl` (12px) → table `rounded-lg` (8px) → status badges `rounded-full`
- **Shadows over borders** on card
- **Scale 0.96 on press** for chip buttons and row action icons
- **40×40 hit areas** on row action icons (extend with pseudo-element)
- **No `transition: all`** — explicit `opacity, transform, background-color`
- **`initial={false}`** on the outer `AnimatePresence`
- **Font smoothing** `-webkit-font-smoothing: antialiased` (inherited from root, verify)

## Files touched

- `src/components/external-signing/InviteTable.tsx` — rewrite: add toolbar, filter state, grouping, archive section, type tag, motion

No changes to:
- Supabase schema
- API routes
- `src/app/(dashboard)/admin/external-signing/page.tsx` or `client.tsx`
- `src/lib/types.ts`

## Out of scope (YAGNI)

- Pagination — 29 rows is fine; revisit at 200+
- Server-side filtering — client-side is adequate at this scale
- Bulk actions
- CSV export
- Sortable columns
- Unified view including doc-share

## Success criteria

1. A user can find any specific recipient's invite in ≤ 2 interactions (search OR group-expand)
2. Signing vs Invoice rows are visually distinguishable at a glance
3. Default view shows only active invites; archive is one click away
4. Filter changes feel instant and interruptible (no queued animations)
5. Per `/interface-craft critique`, the card passes craft checklist post-implementation
