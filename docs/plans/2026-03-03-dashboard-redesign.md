# Dashboard Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the existing HeroUI v3 dashboard with a shadcn/ui component system matching the reference design at `/Users/user/Downloads/b_mR6QCGZfaIg-1772590204787` — dark OKLCH tokens, 240px sidebar, Card/Badge/Avatar patterns across all 5 pages.

**Architecture:** Shell-first approach — install shadcn/ui + rewrite globals.css + sidebar layout first, then replace each page. All Notion data fetchers (`lib/notion.ts`) and types (`lib/types.ts`) are unchanged. Server components remain server components.

**Tech Stack:** Next.js 16 App Router · React 19 · shadcn/ui · Tailwind v4 (CSS config) · Lucide React · Supabase (auth only, no data changes)

---

## Task 1: Install shadcn/ui and remove HeroUI

**Files:**
- Modify: `package.json`
- Create: `src/lib/utils.ts`
- Create: `src/components/ui/card.tsx`
- Create: `src/components/ui/badge.tsx`
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/avatar.tsx`
- Create: `src/components/ui/separator.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/select.tsx`

**Step 1: Install dependencies**

Run from `/Volumes/CODEUSER/seeko-studio`:

```bash
npm install clsx tailwind-merge lucide-react class-variance-authority
npm uninstall @heroui/react framer-motion
```

Expected: `package.json` now has `clsx`, `tailwind-merge`, `lucide-react`, `class-variance-authority`. No `@heroui/react` or `framer-motion`.

**Step 2: Create `src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Step 3: Create `src/components/ui/card.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-xl border border-border bg-card text-card-foreground shadow-sm', className)}
      {...props}
    />
  )
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-sm font-medium leading-none text-muted-foreground', className)} {...props} />
  )
);
CardTitle.displayName = 'CardTitle';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

export { Card, CardHeader, CardTitle, CardContent };
```

**Step 4: Create `src/components/ui/badge.tsx`**

```tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        outline: 'border border-border text-foreground',
        destructive: 'bg-destructive text-destructive-foreground',
      },
    },
    defaultVariants: { variant: 'secondary' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
```

**Step 5: Create `src/components/ui/button.tsx`**

```tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        outline: 'border border-border bg-transparent hover:bg-accent',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  )
);
Button.displayName = 'Button';

export { Button, buttonVariants };
```

**Step 6: Create `src/components/ui/avatar.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Avatar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full', className)}
      {...props}
    />
  )
);
Avatar.displayName = 'Avatar';

const AvatarFallback = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex h-full w-full items-center justify-center rounded-full bg-secondary text-secondary-foreground text-xs font-medium', className)}
      {...props}
    />
  )
);
AvatarFallback.displayName = 'AvatarFallback';

export { Avatar, AvatarFallback };
```

**Step 7: Create `src/components/ui/separator.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Separator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { orientation?: 'horizontal' | 'vertical' }
>(({ className, orientation = 'horizontal', ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'shrink-0 bg-border',
      orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
      className
    )}
    {...props}
  />
));
Separator.displayName = 'Separator';

export { Separator };
```

**Step 8: Create `src/components/ui/input.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export { Input };
```

**Step 9: Create `src/components/ui/select.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = 'Select';

export { Select };
```

**Step 10: Verify no TypeScript errors**

```bash
cd /Volumes/CODEUSER/seeko-studio && npx tsc --noEmit
```

Expected: no errors in the new `src/components/ui/` or `src/lib/utils.ts` files.

**Step 11: Commit**

```bash
cd /Volumes/CODEUSER/seeko-studio
git add src/lib/utils.ts src/components/ui/ package.json package-lock.json
git commit -m "feat: install shadcn/ui component primitives, remove HeroUI"
```

---

## Task 2: Rewrite globals.css with OKLCH token system

**Files:**
- Modify: `src/app/globals.css`

**Step 1: Replace the entire file**

```css
@import "tailwindcss";

@theme inline {
  /* Surfaces */
  --color-background:        oklch(0.10 0 0);
  --color-foreground:        oklch(0.95 0 0);
  --color-card:              oklch(0.14 0 0);
  --color-card-foreground:   oklch(0.95 0 0);
  --color-border:            oklch(0.22 0 0);
  --color-input:             oklch(0.22 0 0);
  --color-muted:             oklch(0.18 0 0);
  --color-muted-foreground:  oklch(0.49 0 0);
  --color-secondary:         oklch(0.18 0 0);
  --color-secondary-foreground: oklch(0.95 0 0);
  --color-accent:            oklch(0.18 0 0);
  --color-accent-foreground: oklch(0.95 0 0);
  --color-primary:           oklch(0.95 0 0);
  --color-primary-foreground: oklch(0.10 0 0);
  --color-destructive:       oklch(0.65 0.22 27);
  --color-destructive-foreground: oklch(0.95 0 0);
  --color-ring:              oklch(0.95 0 0);

  /* Sidebar */
  --color-sidebar:           oklch(0.12 0 0);
  --color-sidebar-foreground: oklch(0.95 0 0);
  --color-sidebar-accent:    oklch(0.18 0 0);
  --color-sidebar-border:    oklch(0.22 0 0);

  /* Seeko accent */
  --color-seeko-accent:      #6ee7b7;

  /* Status dots (used inline, not as badges) */
  --color-status-complete:   #6ee7b7;
  --color-status-progress:   #fbbf24;
  --color-status-review:     #93c5fd;
  --color-status-blocked:    #f87171;

  /* Fonts */
  --font-sans: var(--font-outfit);
  --font-mono: var(--font-jetbrains-mono);

  /* Border radius */
  --radius: 0.5rem;
}

body {
  background-color: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-sans), Arial, sans-serif;
}
```

**Note:** Tailwind v4 maps `--color-*` variables automatically to `bg-*`, `text-*`, `border-*` utilities. So `bg-card` uses `--color-card`, `text-muted-foreground` uses `--color-muted-foreground`, etc. This is how shadcn's utility class names (`bg-card`, `text-foreground`, `border-border`) work with Tailwind v4.

**Step 2: Verify the dev server builds without errors**

```bash
cd /Volumes/CODEUSER/seeko-studio && npm run dev
```

Open `http://localhost:3000`. Expected: page loads, background is near-black (not broken white/default).

**Step 3: Commit**

```bash
cd /Volumes/CODEUSER/seeko-studio
git add src/app/globals.css
git commit -m "feat: replace HeroUI CSS with OKLCH dark token system"
```

---

## Task 3: Rewrite sidebar layout

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`

The current layout is a basic flex row with a 208px (`w-52`) sidebar. Replace it with the 240px reference design including Lucide icons, active state detection, and mobile support.

**Step 1: Rewrite the layout**

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import {
  LayoutDashboard,
  CheckSquare,
  Map,
  Users,
  FileText,
  LogOut,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const NAV = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/tasks', label: 'My Tasks', icon: CheckSquare },
  { href: '/areas', label: 'Game Areas', icon: Map },
  { href: '/team', label: 'Team', icon: Users },
  { href: '/docs', label: 'Docs', icon: FileText },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '/';

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 py-5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-seeko-accent text-black text-xs font-bold">
            S
          </div>
          <span className="font-semibold text-sm tracking-tight text-sidebar-foreground">
            SEEKO Studio
          </span>
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Nav */}
        <nav className="flex flex-col gap-0.5 p-2 flex-1 mt-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={[
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-foreground font-medium'
                    : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
                ].join(' ')}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border">
          <p className="text-xs text-muted-foreground truncate mb-2">{user.email}</p>
          <form action="/auth/signout" method="post">
            <Button variant="ghost" size="sm" className="w-full justify-start text-xs text-muted-foreground px-0 hover:text-foreground">
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
```

**Note on active state:** Next.js 16 App Router doesn't expose `pathname` in server components directly. The `x-pathname` header trick requires a proxy.ts rewrite rule OR we can pass it via a client component. **Use a client sidebar component instead** to access `usePathname()`:

Replace the layout with a server component that renders a `<Sidebar>` client component:

**Step 2: Create `src/components/layout/Sidebar.tsx` (client component)**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CheckSquare,
  Map,
  Users,
  FileText,
  LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const NAV = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/tasks', label: 'My Tasks', icon: CheckSquare },
  { href: '/areas', label: 'Game Areas', icon: Map },
  { href: '/team', label: 'Team', icon: Users },
  { href: '/docs', label: 'Docs', icon: FileText },
];

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-seeko-accent text-black text-xs font-bold shrink-0">
          S
        </div>
        <span className="font-semibold text-sm tracking-tight text-sidebar-foreground">
          SEEKO Studio
        </span>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 p-2 flex-1 mt-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-foreground font-medium'
                  : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
              ].join(' ')}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <p className="text-xs text-muted-foreground truncate mb-2">{email}</p>
        <form action="/auth/signout" method="post">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-xs text-muted-foreground px-0 hover:text-foreground"
            type="submit"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  );
}
```

**Step 3: Rewrite `src/app/(dashboard)/layout.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/Sidebar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar email={user.email ?? ''} />
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
```

**Step 4: Verify the layout renders**

```bash
cd /Volumes/CODEUSER/seeko-studio && npm run dev
```

Open `http://localhost:3000` (login first if needed). Expected: 240px dark sidebar with SEEKO S logo, 5 nav items with Lucide icons, active item highlighted.

**Step 5: Commit**

```bash
cd /Volumes/CODEUSER/seeko-studio
git add src/app/(dashboard)/layout.tsx src/components/layout/
git commit -m "feat: redesign dashboard sidebar with shadcn/ui + Lucide icons"
```

---

## Task 4: Rewrite Overview page (`/`)

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`
- Delete: `src/components/dashboard/StatsRow.tsx`
- Delete: `src/components/dashboard/DepartmentsCard.tsx`
- Delete: `src/components/dashboard/GameAreasCard.tsx`
- Delete: `src/components/dashboard/TasksTable.tsx`

The Overview page imports 4 components that will be deleted. Rewrite the page as a single self-contained server component.

**Step 1: Rewrite `src/app/(dashboard)/page.tsx`**

```tsx
import { fetchTasks, fetchAreas } from '@/lib/notion';
import { Task, Area } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

const STATUS_DOT: Record<string, string> = {
  'Complete':    'var(--color-status-complete)',
  'In Progress': 'var(--color-status-progress)',
  'In Review':   'var(--color-status-review)',
  'Blocked':     'var(--color-status-blocked)',
};

const PRIORITY_VARIANT: Record<string, 'secondary' | 'outline' | 'destructive'> = {
  High:   'destructive',
  Medium: 'secondary',
  Low:    'outline',
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold tracking-tight text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

export default async function OverviewPage() {
  const [tasks, areas] = await Promise.all([
    fetchTasks().catch((): Task[] => []),
    fetchAreas().catch((): Area[] => []),
  ]);

  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'Complete').length;
  const inProgress = tasks.filter(t => t.status === 'In Progress').length;
  const blocked = tasks.filter(t => t.status === 'Blocked').length;

  const depts = ['Coding', 'Visual Art', 'UI/UX', 'Animation', 'Asset Creation'];
  const deptCounts = depts.map(dept => ({
    name: dept,
    count: tasks.filter(t => t.department === dept).length,
  })).sort((a, b) => b.count - a.count);

  const recent = tasks.slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Studio-wide tasks and game area progress</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Tasks" value={total} />
        <StatCard label="Completed" value={completed} />
        <StatCard label="In Progress" value={inProgress} />
        <StatCard label="Blocked" value={blocked} />
      </div>

      {/* Departments + Areas split */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Departments — 3/5 */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Departments</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {deptCounts.map(({ name, count }) => (
                <div key={name} className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-foreground">{name}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
              {deptCounts.every(d => d.count === 0) && (
                <p className="text-sm text-muted-foreground py-2">No tasks yet.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Game Areas — 2/5 */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Game Areas</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-4">
              {areas.map(area => (
                <div key={area.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-foreground">{area.name}</span>
                    <span className="text-xs font-mono text-muted-foreground">{area.progress}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${area.progress}%`, backgroundColor: 'var(--color-seeko-accent)' }}
                    />
                  </div>
                </div>
              ))}
              {areas.length === 0 && (
                <p className="text-sm text-muted-foreground">No areas found.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Tasks */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Tasks</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground px-6 pb-6">No tasks found.</p>
          ) : (
            <div className="divide-y divide-border">
              {recent.map(task => (
                <div key={task.id} className="flex items-center gap-3 px-6 py-3 hover:bg-muted/50 transition-colors">
                  {/* Status dot */}
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: STATUS_DOT[task.status] ?? '#6b7280' }}
                  />
                  {/* Name */}
                  <span className="text-sm text-foreground flex-1 min-w-0 truncate">{task.name}</span>
                  {/* Dept */}
                  <Badge variant="secondary" className="hidden sm:inline-flex shrink-0">
                    {task.department}
                  </Badge>
                  {/* Priority */}
                  <Badge variant={PRIORITY_VARIANT[task.priority] ?? 'outline'} className="shrink-0">
                    {task.priority}
                  </Badge>
                  {/* Deadline */}
                  {task.deadline && (
                    <span className="text-xs text-muted-foreground font-mono shrink-0 hidden md:block">
                      {task.deadline}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 2: Delete old dashboard components**

```bash
cd /Volumes/CODEUSER/seeko-studio
rm src/components/dashboard/StatsRow.tsx
rm src/components/dashboard/DepartmentsCard.tsx
rm src/components/dashboard/GameAreasCard.tsx
rm src/components/dashboard/TasksTable.tsx
```

If the `src/components/dashboard/` directory is now empty, also run:
```bash
rmdir src/components/dashboard/
```

**Step 3: Verify**

```bash
cd /Volumes/CODEUSER/seeko-studio && npm run dev
```

Open `http://localhost:3000`. Expected: 4 stat cards, departments list with counts, areas progress bars, recent tasks with status dots and badges.

**Step 4: Commit**

```bash
cd /Volumes/CODEUSER/seeko-studio
git add src/app/(dashboard)/page.tsx
git rm src/components/dashboard/StatsRow.tsx src/components/dashboard/DepartmentsCard.tsx src/components/dashboard/GameAreasCard.tsx src/components/dashboard/TasksTable.tsx
git commit -m "feat: rewrite Overview page with shadcn/ui Card/Badge layout"
```

---

## Task 5: Rewrite Tasks page (`/tasks`)

**Files:**
- Modify: `src/app/(dashboard)/tasks/page.tsx`
- Create: `src/components/dashboard/TaskList.tsx`

The current tasks page is a server component that renders `<TasksTable>`. Replace with a server component that passes data to a client component (for search/filter interactivity).

**Step 1: Create `src/components/dashboard/TaskList.tsx`**

```tsx
'use client';

import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { Task } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

const STATUS_DOT: Record<string, string> = {
  'Complete':    'var(--color-status-complete)',
  'In Progress': 'var(--color-status-progress)',
  'In Review':   'var(--color-status-review)',
  'Blocked':     'var(--color-status-blocked)',
};

const PRIORITY_VARIANT: Record<string, 'secondary' | 'outline' | 'destructive'> = {
  High:   'destructive',
  Medium: 'secondary',
  Low:    'outline',
};

const STATUSES = ['All', 'Complete', 'In Progress', 'In Review', 'Blocked'] as const;

export function TaskList({ tasks, assigneeName }: { tasks: Task[]; assigneeName?: string }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string>('All');

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      const matchesQuery = !query || t.name.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = status === 'All' || t.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [tasks, query, status]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 flex-col sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            className="pl-9"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <Select value={status} onChange={e => setStatus(e.target.value)} className="w-full sm:w-40">
          {STATUSES.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
      </div>

      {/* Task list */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-foreground">No tasks found</p>
              <p className="text-xs text-muted-foreground mt-1">Try adjusting your search or filter</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(task => (
                <div key={task.id} className="flex items-center gap-3 px-6 py-3 hover:bg-muted/50 transition-colors">
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: STATUS_DOT[task.status] ?? '#6b7280' }}
                  />
                  <span className="text-sm text-foreground flex-1 min-w-0 truncate">{task.name}</span>
                  <Badge variant="secondary" className="hidden sm:inline-flex shrink-0">
                    {task.department}
                  </Badge>
                  <Badge variant="outline" className="shrink-0 hidden sm:inline-flex">
                    {task.status}
                  </Badge>
                  <Badge variant={PRIORITY_VARIANT[task.priority] ?? 'outline'} className="shrink-0">
                    {task.priority}
                  </Badge>
                  {task.deadline && (
                    <span className="text-xs text-muted-foreground font-mono shrink-0 hidden lg:block">
                      {task.deadline}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? 'task' : 'tasks'}
        {assigneeName ? ` for ${assigneeName}` : ''}
      </p>
    </div>
  );
}
```

**Step 2: Rewrite `src/app/(dashboard)/tasks/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server';
import { fetchTasks } from '@/lib/notion';
import { TaskList } from '@/components/dashboard/TaskList';

export default async function TasksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let assigneeName: string | undefined;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('notion_assignee_name')
      .eq('id', user.id)
      .single();
    assigneeName = profile?.notion_assignee_name;
  }

  const tasks = await fetchTasks(assigneeName).catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">My Tasks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {assigneeName ? `Showing tasks for ${assigneeName}` : 'All tasks'}
        </p>
      </div>
      <TaskList tasks={tasks} assigneeName={assigneeName} />
    </div>
  );
}
```

**Step 3: Verify**

```bash
cd /Volumes/CODEUSER/seeko-studio && npm run dev
```

Open `http://localhost:3000/tasks`. Expected: search bar + status dropdown, task rows with dots/badges, empty state when filtered to nothing.

**Step 4: Commit**

```bash
cd /Volumes/CODEUSER/seeko-studio
git add src/app/(dashboard)/tasks/page.tsx src/components/dashboard/TaskList.tsx
git commit -m "feat: rewrite Tasks page with search/filter and shadcn/ui patterns"
```

---

## Task 6: Rewrite Areas page (`/areas`)

**Files:**
- Modify: `src/app/(dashboard)/areas/page.tsx`

The existing areas page already has the right structure (3-col card grid). Rewrite using `<Card>` and `<Badge>`.

**Step 1: Rewrite `src/app/(dashboard)/areas/page.tsx`**

```tsx
import { fetchAreas } from '@/lib/notion';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default async function AreasPage() {
  const areas = await fetchAreas().catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Game Areas</h1>
        <p className="text-sm text-muted-foreground mt-1">Dojo · Battleground · Fighting Club</p>
      </div>

      {areas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No game areas found. Add them to the Notion Areas database.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {areas.map(area => (
            <Card key={area.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base font-semibold text-foreground">
                    {area.name}
                  </CardTitle>
                  {area.phase && (
                    <Badge variant="outline" className="shrink-0">{area.phase}</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {area.description && (
                  <p className="text-sm text-muted-foreground mb-4">{area.description}</p>
                )}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-muted-foreground">Progress</span>
                    <span className="text-xs font-mono text-muted-foreground">{area.progress}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${area.progress}%`, backgroundColor: 'var(--color-seeko-accent)' }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify**

```bash
cd /Volumes/CODEUSER/seeko-studio && npm run dev
```

Open `http://localhost:3000/areas`. Expected: 3-column card grid, phase badges, emerald progress bars.

**Step 3: Commit**

```bash
cd /Volumes/CODEUSER/seeko-studio
git add src/app/(dashboard)/areas/page.tsx
git commit -m "feat: rewrite Areas page with shadcn/ui Card and progress bars"
```

---

## Task 7: Rewrite Team page (`/team`)

**Files:**
- Modify: `src/app/(dashboard)/team/page.tsx`

Replace the card grid with an avatar list card (reference pattern: single Card with divide-y rows).

**Step 1: Rewrite `src/app/(dashboard)/team/page.tsx`**

```tsx
import { fetchTeam } from '@/lib/notion';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default async function TeamPage() {
  const team = await fetchTeam().catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Team</h1>
        <p className="text-sm text-muted-foreground mt-1">{team.length} members</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {team.length === 0 ? (
            <p className="text-sm text-muted-foreground px-6 pb-6">
              No team members found. Add them to the Notion Team database.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {team.map(member => (
                <div key={member.id} className="flex items-center gap-3 px-6 py-3 hover:bg-muted/50 transition-colors">
                  <Avatar>
                    <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{member.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{member.role}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">{member.department}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 2: Verify**

```bash
cd /Volumes/CODEUSER/seeko-studio && npm run dev
```

Open `http://localhost:3000/team`. Expected: single card, avatar with initials, member name + role, dept badge.

**Step 3: Commit**

```bash
cd /Volumes/CODEUSER/seeko-studio
git add src/app/(dashboard)/team/page.tsx
git commit -m "feat: rewrite Team page with Avatar list card"
```

---

## Task 8: Rewrite Docs page (`/docs`)

**Files:**
- Modify: `src/app/(dashboard)/docs/page.tsx`

The existing docs page renders raw Notion blocks via `<NotionRenderer>`. Wrap the renderer in the new card styling — keep `NotionRenderer` itself unchanged (it's not being redesigned).

**Step 1: Rewrite `src/app/(dashboard)/docs/page.tsx`**

```tsx
import { fetchDocBlocks } from '@/lib/notion';
import { NotionRenderer } from '@/components/notion/NotionRenderer';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default async function DocsPage() {
  const blocks = await fetchDocBlocks().catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Docs</h1>
        <p className="text-sm text-muted-foreground mt-1">SEEKO Studio documentation</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Studio Docs</CardTitle>
        </CardHeader>
        <CardContent>
          {blocks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No docs found. Add pages under &quot;SEEKO Docs&quot; in Notion.
            </p>
          ) : (
            <NotionRenderer blocks={blocks} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 2: Verify**

```bash
cd /Volumes/CODEUSER/seeko-studio && npm run dev
```

Open `http://localhost:3000/docs`. Expected: card wrapping Notion content, consistent heading style.

**Step 3: Commit**

```bash
cd /Volumes/CODEUSER/seeko-studio
git add src/app/(dashboard)/docs/page.tsx
git commit -m "feat: rewrite Docs page with Card wrapper"
```

---

## Task 9: Update CLAUDE.md and persona docs to reflect stack change

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/personas/ux.md`

The stack references HeroUI throughout — update to reflect shadcn/ui.

**Step 1: Update `CLAUDE.md` line 4 (stack line)**

Find:
```
- Stack: Next.js 14 (App Router) · HeroUI v3 beta · Tailwind CSS · Supabase Auth · Notion API
```

Replace with:
```
- Stack: Next.js 16 (App Router) · shadcn/ui · Tailwind v4 · Supabase Auth · Notion API
```

Also update the routing table — change the UX persona trigger:

Find:
```
| HeroUI v3, Tailwind, components, animations      | @docs/personas/ux.md       |
```

Replace with:
```
| shadcn/ui, Tailwind, components, animations      | @docs/personas/ux.md       |
```

**Step 2: Rewrite `docs/personas/ux.md` key sections**

Replace the "HeroUI v3 Components" section with a "shadcn/ui Components" section documenting the actual components in `src/components/ui/`. Remove all HeroUI references. Update the "Tailwind v4 + HeroUI Setup" section to remove the `@import "@heroui/styles"` line.

The key things to update in `docs/personas/ux.md`:
- Remove HeroUI component list and patterns
- Add shadcn/ui components (Card, Badge, Button, Avatar, Input, Select, Separator) with their import paths and usage patterns
- Update setup instructions to not import `@heroui/styles`
- Update `globals.css` code example to the new OKLCH token system
- Update component file locations to reflect no `src/components/dashboard/StatsRow.tsx` etc.

**Step 3: Commit**

```bash
cd /Volumes/CODEUSER/seeko-studio
git add CLAUDE.md docs/personas/ux.md
git commit -m "docs: update stack references from HeroUI to shadcn/ui"
```

---

## Task 10: Final verification

**Step 1: Build check**

```bash
cd /Volumes/CODEUSER/seeko-studio && npm run build
```

Expected: build succeeds, no TypeScript errors, no missing module errors.

**Step 2: TypeScript check**

```bash
cd /Volumes/CODEUSER/seeko-studio && npx tsc --noEmit
```

Expected: 0 errors.

**Step 3: Run tests**

```bash
cd /Volumes/CODEUSER/seeko-studio && npm test
```

Expected: all existing tests pass (or previously failing tests still fail at same rate — no regressions).

**Step 4: Manual smoke test checklist**

With `npm run dev` running, verify:
- [ ] `http://localhost:3000` → redirects to `/login` (not logged in)
- [ ] Login → redirects to `/`
- [ ] Sidebar shows: SEEKO logo, 5 nav items with icons, active item highlighted
- [ ] Overview `/`: 4 stat cards, departments list, areas progress bars, recent tasks
- [ ] Tasks `/tasks`: search and filter work, task rows with badges
- [ ] Areas `/areas`: card grid with emerald progress bars and phase badges
- [ ] Team `/team`: avatar list with names, roles, dept badges
- [ ] Docs `/docs`: card wrapping Notion content
- [ ] No white flash, no broken HeroUI imports

**Step 5: Invoke finishing-a-development-branch skill**

Run: `superpowers:finishing-a-development-branch`
