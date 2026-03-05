# Collapsible Sidebar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a collapsible icon-rail sidebar to the desktop dashboard with localStorage persistence, spring animation, and 4-second hover tooltips.

**Architecture:** Single file change — `Sidebar.tsx` gains a `collapsed` boolean state (read/write `localStorage` key `seeko:sidebar-collapsed`), `motion.aside` animates width, labels conditionally render with opacity fade, and a chevron toggle appears on sidebar hover.

**Tech Stack:** `motion/react` (already in project), `lucide-react` (ChevronLeft/ChevronRight), Tailwind v4, localStorage

---

### Task 1: Add collapse state with localStorage persistence

**Files:**
- Modify: `src/components/layout/Sidebar.tsx:1-25`

**Step 1: Add imports**

Add `ChevronLeft`, `ChevronRight` to the lucide import block, and add `motion, AnimatePresence` import:

```tsx
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard, CheckSquare, Users, FileText,
  LogOut, Activity, Settings, ChevronLeft, ChevronRight,
} from 'lucide-react';
```

**Step 2: Add collapse state inside the Sidebar component (after existing useState)**

```tsx
const [collapsed, setCollapsed] = useState<boolean>(() => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('seeko:sidebar-collapsed') === 'true';
});
const [hovered, setHovered] = useState(false);

const toggleCollapsed = () => {
  setCollapsed(prev => {
    const next = !prev;
    localStorage.setItem('seeko:sidebar-collapsed', String(next));
    return next;
  });
};
```

**Step 3: Verify dev server still compiles**

Check `localhost:3000` — no errors.

**Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat(sidebar): add collapse state with localStorage persistence"
```

---

### Task 2: Animate sidebar width and swap static `<aside>` for `motion.aside`

**Files:**
- Modify: `src/components/layout/Sidebar.tsx:70-76`

**Step 1: Replace the `<aside>` opening tag**

Old:
```tsx
<aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar h-screen sticky top-0">
```

New:
```tsx
<motion.aside
  animate={{ width: collapsed ? 56 : 240 }}
  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
  onMouseEnter={() => setHovered(true)}
  onMouseLeave={() => setHovered(false)}
  className="relative hidden md:flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar h-screen sticky top-0 overflow-hidden"
>
```

**Step 2: Close tag — replace `</aside>` with `</motion.aside>`**

**Step 3: Check `localhost:3000` — sidebar should still be 240px wide**

**Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat(sidebar): animate width with motion.aside spring"
```

---

### Task 3: Add chevron toggle button

**Files:**
- Modify: `src/components/layout/Sidebar.tsx` — inside `motion.aside`, after the `<Separator />`

**Step 1: Add chevron button just inside the top of the sidebar, after the logo div**

```tsx
{/* Chevron toggle — visible on sidebar hover */}
<AnimatePresence>
  {hovered && (
    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={toggleCollapsed}
      className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 flex size-6 items-center justify-center rounded-full border border-sidebar-border bg-sidebar shadow-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <motion.span
        animate={{ rotate: collapsed ? 180 : 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="flex"
      >
        <ChevronLeft className="size-3.5" />
      </motion.span>
    </motion.button>
  )}
</AnimatePresence>
```

**Step 2: Test hover — chevron should appear on hover and click should toggle width**

**Step 3: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat(sidebar): add hover-reveal chevron toggle button"
```

---

### Task 4: Conditionally render labels with fade animation

**Files:**
- Modify: `src/components/layout/Sidebar.tsx` — logo area, nav items, user footer

**Step 1: Logo area — hide "SEEKO" text when collapsed**

Old:
```tsx
<div className="flex items-center gap-2.5 px-4 py-5">
  <div className="flex h-8 w-8 items-center justify-center shrink-0">
    <Image src="/seeko-s.png" alt="SEEKO" width={24} height={24} />
  </div>
  <span className="font-semibold text-base tracking-tight text-sidebar-foreground">SEEKO</span>
</div>
```

New:
```tsx
<div className={`flex items-center py-5 transition-all ${collapsed ? 'justify-center px-0' : 'gap-2.5 px-4'}`}>
  <div className="flex h-8 w-8 items-center justify-center shrink-0">
    <Image src="/seeko-s.png" alt="SEEKO" width={24} height={24} />
  </div>
  <AnimatePresence>
    {!collapsed && (
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="font-semibold text-base tracking-tight text-sidebar-foreground whitespace-nowrap"
      >
        SEEKO
      </motion.span>
    )}
  </AnimatePresence>
</div>
```

**Step 2: Nav items — center icons when collapsed, hide labels**

Old nav link inner content:
```tsx
<Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-seeko-accent' : ''}`} />
{navLabel}
```

New:
```tsx
<Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-seeko-accent' : ''}`} />
<AnimatePresence>
  {!collapsed && (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="whitespace-nowrap"
    >
      {navLabel}
    </motion.span>
  )}
</AnimatePresence>
```

Also update nav link className to center when collapsed:
```tsx
className={[
  'flex items-center rounded-md px-3 py-2.5 text-sm transition-colors',
  collapsed ? 'justify-center px-0 w-full' : 'gap-3',
  isActive
    ? 'bg-white/5 text-seeko-accent font-medium'
    : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
].join(' ')}
```

**Step 3: User footer — hide name/email/sign-out when collapsed**

Wrap the name/email block and sign-out/settings links in `{!collapsed && (...)}` (no animation needed — they're below the fold):

```tsx
<div className="p-4 border-t border-sidebar-border">
  <div className={`flex items-center mb-3 ${collapsed ? 'justify-center' : 'gap-2.5'}`}>
    <Avatar className="size-8">
      <AvatarImage src={avatarUrl} alt={label} />
      <AvatarFallback className="bg-secondary text-foreground text-[10px]">
        {getInitials(label)}
      </AvatarFallback>
    </Avatar>
    <AnimatePresence>
      {!collapsed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="flex-1 min-w-0"
        >
          {displayName && (
            <p className="text-sm font-medium text-sidebar-foreground truncate">{displayName}</p>
          )}
          <p className="text-xs text-muted-foreground truncate">{email}</p>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
  {!collapsed && (
    <>
      {/* existing Settings link */}
      {/* existing sign-out button */}
    </>
  )}
</div>
```

**Step 4: Verify collapsed state looks correct at localhost:3000**

**Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat(sidebar): conditional label rendering with fade animation"
```

---

### Task 5: 4-second hover tooltips (collapsed only)

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

**Step 1: Add tooltip state**

```tsx
const [tooltip, setTooltip] = useState<{ label: string; y: number } | null>(null);
const tooltipTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
```

Add `useRef` to imports if not already present: `import { useState, useRef } from 'react';`

**Step 2: Add tooltip handlers**

```tsx
const handleNavMouseEnter = (e: React.MouseEvent<HTMLAnchorElement>, label: string) => {
  if (!collapsed) return;
  const rect = e.currentTarget.getBoundingClientRect();
  tooltipTimerRef.current = setTimeout(() => {
    setTooltip({ label, y: rect.top + rect.height / 2 });
  }, 4000);
};

const handleNavMouseLeave = () => {
  if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
  setTooltip(null);
};
```

**Step 3: Wire handlers onto each nav `<Link>`**

```tsx
<Link
  ...
  onMouseEnter={e => handleNavMouseEnter(e, navLabel)}
  onMouseLeave={handleNavMouseLeave}
>
```

**Step 4: Render tooltip via portal**

At the bottom of the `motion.aside`, before closing tag:

```tsx
{typeof document !== 'undefined' && tooltip && createPortal(
  <div
    className="fixed z-[9999] pointer-events-none"
    style={{ left: 64, top: tooltip.y, transform: 'translateY(-50%)' }}
  >
    <div className="rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md whitespace-nowrap">
      {tooltip.label}
    </div>
  </div>,
  document.body
)}
```

Add `createPortal` to imports: `import { createPortal } from 'react-dom';`

**Step 5: Test — collapse sidebar, hover a nav icon for 4+ seconds, tooltip should appear**

**Step 6: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat(sidebar): 4-second hover tooltips in collapsed state"
```

---

### Task 6: Final polish + push

**Step 1: Verify full flow**
- Collapse → icons only, chevron rotates
- Hover nav icon 4s → tooltip appears to the right
- Expand → labels fade back in
- Navigate to another page → collapsed state preserved
- Refresh → state restored from localStorage

**Step 2: Push to main**

```bash
git push origin main
```
