# Sent Invites Organization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Organize the sent-invites table on `/admin/external-signing` in-place with search, status filters, recipient grouping, and archive separation — all inside the existing single card, no tabs, no new routes.

**Architecture:** Client-side filter/group logic extracted as pure functions in a new `lib` module (TDD-friendly), then wired into a rewritten `InviteTable.tsx` with staggered motion using existing `springs` from `@/lib/motion`. Doc-share rows are filtered out of this table.

**Tech Stack:** Next.js 16 · React 19 · Tailwind v4 · shadcn/ui · motion/react · Vitest + jsdom · Supabase client

**Design doc:** `docs/plans/2026-04-05-sent-invites-organization-design.md`

---

## Task 1: Extract and TDD the filter-logic module

**Rationale:** Component rendering is hard to TDD; pure filter/group functions are not. Extract first, test first.

**Files:**
- Create: `src/lib/invite-filters.ts`
- Create: `src/lib/__tests__/invite-filters.test.ts`

### Step 1.1: Write the failing test for `filterByStatus`

Create `src/lib/__tests__/invite-filters.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { filterByStatus, type FilterStatus } from '../invite-filters';
import type { ExternalSigningInvite } from '../types';

const makeInvite = (overrides: Partial<ExternalSigningInvite>): ExternalSigningInvite => ({
  id: 'x',
  token: 't',
  recipient_email: 'a@b.com',
  status: 'pending',
  template_type: 'preset',
  template_id: 'nda',
  custom_title: null,
  personal_note: null,
  expires_at: '2026-05-01T00:00:00Z',
  signed_at: null,
  created_at: '2026-04-01T00:00:00Z',
  verification_attempts: 0,
  created_by: 'u',
  signer_name: null,
  is_guardian_signing: false,
  ...overrides,
} as ExternalSigningInvite);

describe('filterByStatus', () => {
  const invites = [
    makeInvite({ id: '1', status: 'pending' }),
    makeInvite({ id: '2', status: 'verified' }),
    makeInvite({ id: '3', status: 'signed' }),
    makeInvite({ id: '4', status: 'expired' }),
    makeInvite({ id: '5', status: 'revoked' }),
  ];

  it('all → active statuses only (pending/verified/signed)', () => {
    const result = filterByStatus(invites, 'all');
    expect(result.map(i => i.id)).toEqual(['1', '2', '3']);
  });

  it('pending → only pending', () => {
    expect(filterByStatus(invites, 'pending').map(i => i.id)).toEqual(['1']);
  });

  it('verified → only verified', () => {
    expect(filterByStatus(invites, 'verified').map(i => i.id)).toEqual(['2']);
  });

  it('signed → only signed', () => {
    expect(filterByStatus(invites, 'signed').map(i => i.id)).toEqual(['3']);
  });

  it('archive → expired + revoked', () => {
    expect(filterByStatus(invites, 'archive').map(i => i.id)).toEqual(['4', '5']);
  });
});
```

### Step 1.2: Run to verify it fails

Run: `cd /Volumes/CODEUSER/seeko-studio && npx vitest run src/lib/__tests__/invite-filters.test.ts`
Expected: FAIL — cannot import `../invite-filters`

### Step 1.3: Implement minimal `filterByStatus`

Create `src/lib/invite-filters.ts`:

```ts
import type { ExternalSigningInvite } from './types';

export type FilterStatus = 'all' | 'pending' | 'verified' | 'signed' | 'archive';

const ACTIVE_STATUSES = new Set(['pending', 'verified', 'signed']);
const ARCHIVE_STATUSES = new Set(['expired', 'revoked']);

export function filterByStatus(
  invites: ExternalSigningInvite[],
  status: FilterStatus,
): ExternalSigningInvite[] {
  if (status === 'all') return invites.filter(i => ACTIVE_STATUSES.has(i.status));
  if (status === 'archive') return invites.filter(i => ARCHIVE_STATUSES.has(i.status));
  return invites.filter(i => i.status === status);
}
```

### Step 1.4: Run tests to verify they pass

Run: `npx vitest run src/lib/__tests__/invite-filters.test.ts`
Expected: 5 passing

### Step 1.5: Add `filterBySearch` test + impl

Append to test file:

```ts
describe('filterBySearch', () => {
  const invites = [
    makeInvite({ id: '1', recipient_email: 'alice@example.com' }),
    makeInvite({ id: '2', recipient_email: 'BOB@example.com' }),
    makeInvite({ id: '3', recipient_email: 'carol@other.org' }),
  ];

  it('returns all when query is empty', () => {
    expect(filterBySearch(invites, '').length).toBe(3);
    expect(filterBySearch(invites, '   ').length).toBe(3);
  });

  it('matches case-insensitively on recipient_email', () => {
    expect(filterBySearch(invites, 'BOB').map(i => i.id)).toEqual(['2']);
    expect(filterBySearch(invites, 'alice').map(i => i.id)).toEqual(['1']);
  });

  it('matches partial substring', () => {
    expect(filterBySearch(invites, 'example').map(i => i.id)).toEqual(['1', '2']);
  });
});
```

Add import at top: `import { filterByStatus, filterBySearch, type FilterStatus } from '../invite-filters';`

Append to `invite-filters.ts`:

```ts
export function filterBySearch(
  invites: ExternalSigningInvite[],
  query: string,
): ExternalSigningInvite[] {
  const q = query.trim().toLowerCase();
  if (!q) return invites;
  return invites.filter(i => i.recipient_email.toLowerCase().includes(q));
}
```

Run: `npx vitest run src/lib/__tests__/invite-filters.test.ts` → 8 passing

### Step 1.6: Add `excludeDocShare` test + impl

Append test:

```ts
describe('excludeDocShare', () => {
  it('removes rows where template_type is doc_share', () => {
    const invites = [
      makeInvite({ id: '1', template_type: 'preset' }),
      makeInvite({ id: '2', template_type: 'custom' }),
      makeInvite({ id: '3', template_type: 'invoice' }),
      makeInvite({ id: '4', template_type: 'doc_share' }),
    ];
    expect(excludeDocShare(invites).map(i => i.id)).toEqual(['1', '2', '3']);
  });
});
```

Update import: add `excludeDocShare`. Append to `invite-filters.ts`:

```ts
export function excludeDocShare(invites: ExternalSigningInvite[]): ExternalSigningInvite[] {
  return invites.filter(i => i.template_type !== 'doc_share');
}
```

Run tests → 9 passing

### Step 1.7: Add `groupByRecipient` test + impl

Append test:

```ts
describe('groupByRecipient', () => {
  const invites = [
    makeInvite({ id: '1', recipient_email: 'a@x.com', created_at: '2026-04-03' }),
    makeInvite({ id: '2', recipient_email: 'a@x.com', created_at: '2026-04-01' }),
    makeInvite({ id: '3', recipient_email: 'b@x.com', created_at: '2026-04-02' }),
  ];

  it('groups invites by recipient_email', () => {
    const groups = groupByRecipient(invites);
    expect(groups.length).toBe(2);
    expect(groups[0].email).toBe('a@x.com');
    expect(groups[0].invites.length).toBe(2);
    expect(groups[1].email).toBe('b@x.com');
  });

  it('sorts group members newest-first', () => {
    const groups = groupByRecipient(invites);
    expect(groups[0].invites.map(i => i.id)).toEqual(['1', '2']);
  });

  it('orders groups by most-recent invite', () => {
    const groups = groupByRecipient(invites);
    expect(groups.map(g => g.email)).toEqual(['a@x.com', 'b@x.com']);
  });
});
```

Update import: add `groupByRecipient`. Append to `invite-filters.ts`:

```ts
export type InviteGroup = {
  email: string;
  invites: ExternalSigningInvite[];
};

export function groupByRecipient(invites: ExternalSigningInvite[]): InviteGroup[] {
  const map = new Map<string, ExternalSigningInvite[]>();
  for (const inv of invites) {
    const list = map.get(inv.recipient_email) ?? [];
    list.push(inv);
    map.set(inv.recipient_email, list);
  }
  const groups: InviteGroup[] = [];
  for (const [email, list] of map) {
    list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    groups.push({ email, invites: list });
  }
  groups.sort((a, b) => b.invites[0].created_at.localeCompare(a.invites[0].created_at));
  return groups;
}
```

Run tests → 12 passing

### Step 1.8: Add `sortByActivePriority` test + impl

Append test:

```ts
describe('sortByActivePriority', () => {
  it('orders pending → verified → signed, newest-first within each', () => {
    const invites = [
      makeInvite({ id: '1', status: 'signed', created_at: '2026-04-03' }),
      makeInvite({ id: '2', status: 'pending', created_at: '2026-04-01' }),
      makeInvite({ id: '3', status: 'verified', created_at: '2026-04-02' }),
      makeInvite({ id: '4', status: 'pending', created_at: '2026-04-04' }),
    ];
    const sorted = sortByActivePriority(invites);
    expect(sorted.map(i => i.id)).toEqual(['4', '2', '3', '1']);
  });
});
```

Update import: add `sortByActivePriority`. Append to `invite-filters.ts`:

```ts
const STATUS_ORDER: Record<string, number> = { pending: 0, verified: 1, signed: 2, expired: 3, revoked: 4 };

export function sortByActivePriority(invites: ExternalSigningInvite[]): ExternalSigningInvite[] {
  return [...invites].sort((a, b) => {
    const orderDiff = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    if (orderDiff !== 0) return orderDiff;
    return b.created_at.localeCompare(a.created_at);
  });
}
```

Run tests → 13 passing

### Step 1.9: Commit

```bash
cd /Volumes/CODEUSER/seeko-studio
git add src/lib/invite-filters.ts src/lib/__tests__/invite-filters.test.ts
git commit -m "feat(invites): add filter/group/sort utilities for sent-invites view

- filterByStatus: supports all/pending/verified/signed/archive
- filterBySearch: case-insensitive recipient_email match
- excludeDocShare: strips doc_share rows from signing-table view
- groupByRecipient: groups invites per email, newest-first
- sortByActivePriority: pending → verified → signed ordering"
```

---

## Task 2: Rewrite `InviteTable.tsx` — baseline + type tag

**Files:**
- Modify: `src/components/external-signing/InviteTable.tsx` (full rewrite)

### Step 2.1: Add the new toolbar + type tag (no filters wired yet)

Rewrite `InviteTable.tsx`. Keep existing data-fetch and action handlers; change render:

```tsx
'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { RotateCw, Ban, Download, Loader2, Send, Search, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { ExternalSigningInvite } from '@/lib/types';
import {
  filterByStatus,
  filterBySearch,
  excludeDocShare,
  sortByActivePriority,
  type FilterStatus,
} from '@/lib/invite-filters';

interface InviteTableProps { refreshKey: number; }

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'outline', verified: 'secondary', signed: 'default', expired: 'secondary', revoked: 'destructive',
};

const STATUS_CHIPS: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
  { value: 'signed', label: 'Signed' },
  { value: 'archive', label: 'Archive' },
];

function getTypeTag(invite: ExternalSigningInvite): { label: string; doc: string } {
  if (invite.template_type === 'invoice') {
    return { label: 'Invoice', doc: invite.custom_title || 'Invoice request' };
  }
  if (invite.template_type === 'preset') {
    return { label: 'Signing', doc: invite.template_id || 'Preset' };
  }
  return { label: 'Signing', doc: invite.custom_title || 'Custom' };
}

export function InviteTable({ refreshKey }: InviteTableProps) {
  const [invites, setInvites] = useState<ExternalSigningInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<FilterStatus>('all');

  const fetchInvites = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('external_signing_invites')
      .select('id, token, recipient_email, status, template_type, template_id, custom_title, personal_note, expires_at, signed_at, created_at, verification_attempts, created_by, signer_name, is_guardian_signing')
      .order('created_at', { ascending: false });
    setInvites((data as ExternalSigningInvite[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchInvites(); }, [fetchInvites, refreshKey]);

  // Keep existing handleAction and handleDownload (copy from current file)
  async function handleAction(inviteId: string, action: 'revoke' | 'resend') {
    setActionLoading(inviteId);
    try {
      const res = await fetch(`/api/external-signing/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_id: inviteId }),
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error); }
      toast.success(action === 'revoke' ? 'Invite revoked' : 'Invite resent');
      fetchInvites();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally { setActionLoading(null); }
  }

  async function handleDownload(inviteId: string) {
    setActionLoading(inviteId);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.storage.from('agreements').download(`external/${inviteId}/agreement.pdf`);
      if (error || !data) throw new Error('Failed to download');
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url; a.download = `agreement-${inviteId}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Download failed');
    } finally { setActionLoading(null); }
  }

  const signingInvites = useMemo(() => excludeDocShare(invites), [invites]);
  const filtered = useMemo(() => {
    const byStatus = filterByStatus(signingInvites, status);
    const bySearch = filterBySearch(byStatus, search);
    return status === 'all' ? sortByActivePriority(bySearch) : bySearch;
  }, [signingInvites, status, search]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  if (signingInvites.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted ring-1 ring-border">
          <Send className="size-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">No invites sent yet</p>
          <p className="text-xs text-muted-foreground/60">Send your first invite using the form above</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium text-muted-foreground">
          Sent Invites
          <span className="ml-2 text-xs text-muted-foreground/60 tabular-nums">({filtered.length})</span>
        </h2>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recipient…"
            className="h-8 w-full rounded-md border border-border bg-muted/20 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-seeko-accent/40"
          />
        </div>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_CHIPS.map((chip) => {
          const active = status === chip.value;
          return (
            <button
              key={chip.value}
              onClick={() => setStatus(chip.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-[background-color,color,transform] active:scale-[0.96] ${
                active
                  ? 'bg-foreground text-background'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Recipient</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Type</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Document</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Sent</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Expires</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((invite) => {
              const { label: typeLabel, doc } = getTypeTag(invite);
              return (
                <tr key={invite.id} className="border-b border-border/50 transition-[background-color] hover:bg-muted/20">
                  <td className="px-4 py-3 text-foreground font-mono text-xs">
                    {invite.recipient_email}
                    {invite.is_guardian_signing && (
                      <Badge variant="outline" className="ml-2 text-[10px]">Guardian</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {typeLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs" style={{ textWrap: 'pretty' }}>{doc}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[invite.status] || 'secondary'}>{invite.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs tabular-nums">
                    {new Date(invite.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs tabular-nums">
                    {new Date(invite.expires_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {(invite.status === 'pending' || invite.status === 'verified') && (
                        <>
                          <button
                            onClick={() => handleAction(invite.id, 'resend')}
                            disabled={actionLoading === invite.id}
                            title="Resend invite"
                            className="relative rounded p-1.5 transition-[background-color,transform] hover:bg-muted active:scale-[0.96] group before:absolute before:inset-0 before:-m-2 before:content-['']"
                          >
                            <RotateCw className="size-3.5 text-muted-foreground group-hover:text-foreground transition-[color]" />
                          </button>
                          <button
                            onClick={() => handleAction(invite.id, 'revoke')}
                            disabled={actionLoading === invite.id}
                            title="Revoke invite"
                            className="relative rounded p-1.5 transition-[background-color,transform] hover:bg-destructive/10 active:scale-[0.96] group before:absolute before:inset-0 before:-m-2 before:content-['']"
                          >
                            <Ban className="size-3.5 text-muted-foreground group-hover:text-destructive transition-[color]" />
                          </button>
                        </>
                      )}
                      {invite.status === 'signed' && (
                        <button
                          onClick={() => handleDownload(invite.id)}
                          disabled={actionLoading === invite.id}
                          title="Download signed PDF"
                          className="relative rounded p-1.5 transition-[background-color,transform] hover:bg-seeko-accent/10 active:scale-[0.96] group before:absolute before:inset-0 before:-m-2 before:content-['']"
                        >
                          <Download className="size-3.5 text-muted-foreground group-hover:text-seeko-accent transition-[color]" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### Step 2.2: Manually verify in browser

Run: `npm run dev` → open `http://localhost:3000/admin/external-signing`
Expected:
- Search input filters as you type
- Status chips switch filter; "All" excludes archive; "Archive" shows only expired/revoked
- Type column shows `Signing` or `Invoice` tag
- No doc_share rows visible
- Dates use tabular figures

### Step 2.3: Commit

```bash
git add src/components/external-signing/InviteTable.tsx
git commit -m "feat(invites): add search, status chips, and type tag to sent-invites table

- Client-side search on recipient_email
- Status filter chips (All/Pending/Verified/Signed/Archive)
- New Type column distinguishes Signing vs Invoice rows
- Excludes doc_share rows (handled in /docs)
- Tabular numerals on dates, scale-on-press on chip/action buttons
- Extended hit areas on row action icons via pseudo-element"
```

---

## Task 3: Debounce search input

**Files:**
- Modify: `src/components/external-signing/InviteTable.tsx`

### Step 3.1: Add debounced search state

Below `const [search, setSearch] = useState('');` add:

```tsx
const [debouncedSearch, setDebouncedSearch] = useState('');
useEffect(() => {
  const t = setTimeout(() => setDebouncedSearch(search), 150);
  return () => clearTimeout(t);
}, [search]);
```

Change the `filterBySearch` call to use `debouncedSearch` instead of `search`.

### Step 3.2: Verify typing feels snappy, no layout thrash

Run dev server, type quickly in the search box. Rows should only re-filter after 150ms of no typing.

### Step 3.3: Commit

```bash
git add src/components/external-signing/InviteTable.tsx
git commit -m "perf(invites): debounce search input by 150ms"
```

---

## Task 4: Add row enter/exit motion with stagger

**Files:**
- Modify: `src/components/external-signing/InviteTable.tsx`

### Step 4.1: Replace `<tbody>` rows with `motion.tr` inside `AnimatePresence`

Add imports:

```tsx
import { AnimatePresence, motion } from 'motion/react';
```

Wrap the `.map()` in `<AnimatePresence initial={false} mode="popLayout">` and change each `<tr>` to `<motion.tr>` with:

```tsx
<motion.tr
  key={invite.id}
  layout
  initial={{ opacity: 0, y: 8, scale: 0.98 }}
  animate={{ opacity: 1, y: 0, scale: 1 }}
  exit={{ opacity: 0, y: -4 }}
  transition={{ type: 'spring', duration: 0.3, bounce: 0, delay: index * 0.03 }}
  className="border-b border-border/50 transition-[background-color] hover:bg-muted/20"
>
```

Change the map signature to `{filtered.map((invite, index) => {`. Cap the stagger delay for larger lists: `delay: Math.min(index, 10) * 0.03`.

### Step 4.2: Verify interruptible animation

Run dev server. Click filter chips rapidly. Rows should smoothly interrupt and restart without queueing.

### Step 4.3: Commit

```bash
git add src/components/external-signing/InviteTable.tsx
git commit -m "feat(invites): animate row transitions with staggered spring motion

- AnimatePresence with initial={false} to skip on page-load
- Spring (bounce: 0) for enter, subtle y:-4 exit
- 30ms stagger capped at 10 rows to keep filter changes snappy"
```

---

## Task 5: Add recipient grouping toggle

**Files:**
- Modify: `src/components/external-signing/InviteTable.tsx`

### Step 5.1: Add group state + toggle button

Under the search input, add a group toggle button. Add state:

```tsx
const [grouped, setGrouped] = useState(false);
```

In the header, right after the search input, add:

```tsx
<button
  onClick={() => setGrouped(g => !g)}
  title={grouped ? 'Ungroup' : 'Group by recipient'}
  className={`flex size-8 items-center justify-center rounded-md border transition-[background-color,color,border-color,transform] active:scale-[0.96] ${
    grouped ? 'border-seeko-accent/40 bg-seeko-accent/10 text-seeko-accent' : 'border-border bg-muted/20 text-muted-foreground hover:text-foreground'
  }`}
>
  <Users className="size-3.5" />
</button>
```

Wrap the search + toggle in a `<div className="flex items-center gap-2">`.

### Step 5.2: Add grouped rendering

Import `groupByRecipient` and `InviteGroup` from `@/lib/invite-filters`.

Add a `groupedData` memo:

```tsx
const groupedData = useMemo(() => grouped ? groupByRecipient(filtered) : null, [grouped, filtered]);
const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
```

When `groupedData` exists, render parent rows with expand chevrons + child rows inside `AnimatePresence`. Each parent row shows:
- Recipient email
- Count badge: `{group.invites.length} invites`
- Status of the most recent invite
- Chevron that rotates 90° when expanded

Toggle expansion:

```tsx
function toggleGroup(email: string) {
  setExpandedGroups(prev => {
    const next = new Set(prev);
    if (next.has(email)) next.delete(email); else next.add(email);
    return next;
  });
}
```

Implementation (conditional tbody):

```tsx
{groupedData ? (
  groupedData.map(group => (
    <GroupRow
      key={group.email}
      group={group}
      expanded={expandedGroups.has(group.email)}
      onToggle={() => toggleGroup(group.email)}
      renderRow={(inv, i) => /* same row render as flat path */}
    />
  ))
) : (
  filtered.map((invite, index) => /* same row render */)
)}
```

Extract the row render into a reusable `renderInviteRow(invite, index, { handleAction, handleDownload, actionLoading })` helper inside the component file.

### Step 5.3: Verify grouping works

Run dev. Click the group button. Rows collapse by email. Click chevron to expand a group.

### Step 5.4: Commit

```bash
git add src/components/external-signing/InviteTable.tsx
git commit -m "feat(invites): add recipient grouping toggle with expand/collapse"
```

---

## Task 6: Add archive footer link

**Files:**
- Modify: `src/components/external-signing/InviteTable.tsx`

### Step 6.1: Compute archive count + render footer link

After the table, when `status !== 'archive'`, compute and render:

```tsx
const archiveCount = useMemo(
  () => filterByStatus(filterBySearch(signingInvites, debouncedSearch), 'archive').length,
  [signingInvites, debouncedSearch],
);
const [showArchive, setShowArchive] = useState(false);

// after the table:
{status !== 'archive' && archiveCount > 0 && (
  <button
    onClick={() => setShowArchive(s => !s)}
    className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs text-muted-foreground hover:text-foreground transition-[color]"
  >
    {showArchive ? 'Hide archived' : `Show archived (${archiveCount})`}
  </button>
)}
```

When `showArchive` is true, render a second table (or second `<tbody>`) with the archive rows using the same row renderer, visually muted (`opacity-60`).

### Step 6.2: Verify archive reveal

Run dev. The footer appears when there are archived items. Clicking expands them inline.

### Step 6.3: Commit

```bash
git add src/components/external-signing/InviteTable.tsx
git commit -m "feat(invites): add inline archive expand footer"
```

---

## Task 7: Run critique + visual QA

**Step 7.1:** Take a screenshot of the finished table at `/admin/external-signing`.

**Step 7.2:** Invoke `/interface-craft critique` with the screenshot. Address any P0/P1 findings.

**Step 7.3:** Verify the craft checklist:
- [ ] Concentric radius (card → table → badges)
- [ ] Tabular numerals on dates
- [ ] Scale-on-press on chips + action buttons
- [ ] 40×40 hit areas on action icons
- [ ] No `transition: all`
- [ ] `initial={false}` on AnimatePresence
- [ ] Search debounced
- [ ] doc_share excluded
- [ ] Archive hidden by default
- [ ] Group toggle works

**Step 7.4:** Commit any craft fixes.

```bash
git add -u && git commit -m "polish(invites): craft fixes from critique pass"
```

---

## Task 8: Verification

**Step 8.1:** Run tests
`cd /Volumes/CODEUSER/seeko-studio && npx vitest run src/lib/__tests__/invite-filters.test.ts`
Expected: all pass

**Step 8.2:** Run typecheck
`npx tsc --noEmit`
Expected: no errors

**Step 8.3:** Run lint (if configured)
`npm run lint`
Expected: no errors introduced

**Step 8.4:** Manual acceptance
- Search finds a recipient by partial email
- Each status chip shows the expected subset
- "All" excludes archive; "Archive" shows only expired/revoked
- Group toggle collapses correctly; expand chevrons work
- Archive footer appears when applicable; click expands inline
- Row actions (resend/revoke/download) still work
- No doc_share rows visible
- Filter changes feel instant, animations interruptible

---

## Summary

- **8 tasks**, each committable independently
- **13 TDD tests** covering all filter/group/sort logic
- **Single-file rewrite** for `InviteTable.tsx`; no API, schema, or route changes
- **Craft checklist** enforced via critique pass in Task 7
