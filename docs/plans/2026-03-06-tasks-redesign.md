# Tasks Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the TaskList component from a grouped, feature-heavy layout to a clean 3-column flat table with pill filters, matching the reference image aesthetic in dark theme.

**Architecture:** Replace the current TaskList render (department-grouped cards with checkboxes, inline department/priority editing, search bar) with a single Card containing a header row, 3 pill-filter dropdowns, and a clean table with Name/Assignees/Status columns. All business logic (Supabase mutations, deliverable flow, handoff flow, notifications) stays intact — only the render and filter state change.

**Tech Stack:** React 19, Next.js 16, Tailwind v4, shadcn/ui (Card, Badge, Avatar, DropdownMenu, Button), Framer Motion (motion/react), Supabase browser client.

---

### Task 1: Add `FilterPill` component inline in TaskList

**Files:**
- Modify: `src/components/dashboard/TaskList.tsx`

**Step 1: Define FilterPill component at the top of TaskList.tsx (after imports, before STATUS_ICONS)**

Add this component inside TaskList.tsx (not a separate file — it's only used here):

```tsx
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
            value !== 'All'
              ? 'border-foreground/20 bg-muted text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/20'
          )}
        >
          {value !== 'All' ? options.find(o => o.value === value)?.label ?? label : label}
          <ChevronDown className="size-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map(opt => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn('text-xs', opt.value === value && 'font-medium')}
          >
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

**Step 2: Add `cn` import**

Add `cn` to imports (from `@/lib/utils`). Also add `ChevronDown` to the lucide import list.

**Step 3: Verify it compiles**

Run: `cd /Volumes/CODEUSER/seeko-studio && npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds (FilterPill is defined but not yet used — tree-shaking is fine).

**Step 4: Commit**

```bash
git add src/components/dashboard/TaskList.tsx
git commit -m "feat(tasks): add FilterPill component for redesign"
```

---

### Task 2: Replace filter state and filter bar

**Files:**
- Modify: `src/components/dashboard/TaskList.tsx:118-123` (state declarations)
- Modify: `src/components/dashboard/TaskList.tsx:582-602` (filter bar render)

**Step 1: Replace state declarations**

Remove `search` and `filter` state. Add three new filter states:

```tsx
// Remove these:
// const [search, setSearch] = useState('');
// const [filter, setFilter] = useState('All');

// Add these:
const [filterAssignee, setFilterAssignee] = useState('All');
const [filterStatus, setFilterStatus] = useState('All');
const [filterPriority, setFilterPriority] = useState('All');
```

**Step 2: Update the `filtered` useMemo (around line 261-269)**

Replace the filtered computation:

```tsx
const filtered = useMemo(() => {
  return allTasks.filter(t => {
    if (deleted.has(t.id)) return false;
    const status = getEffectiveStatus(t);
    const priority = getEffectivePriority(t);
    const matchesStatus = filterStatus === 'All' || status === filterStatus;
    const matchesPriority = filterPriority === 'All' || priority === filterPriority;
    const matchesAssignee = filterAssignee === 'All' || (() => {
      const assignee = getAssignee(t);
      return assignee?.id === filterAssignee;
    })();
    return matchesStatus && matchesPriority && matchesAssignee;
  });
}, [allTasks, filterStatus, filterPriority, filterAssignee, deleted, getEffectiveStatus, getEffectivePriority]);
```

**Step 3: Remove the `counts` useMemo (lines 271-280)**

Delete the `counts` useMemo entirely — it was used for the status filter labels which are being removed.

**Step 4: Build assignee options list**

Add a memo for assignee dropdown options (after the `filtered` memo):

```tsx
const assigneeOptions = useMemo(() => {
  const seen = new Map<string, string>();
  for (const t of allTasks) {
    if (deleted.has(t.id)) continue;
    const a = getAssignee(t);
    if (a?.id && a.display_name && !seen.has(a.id)) {
      seen.set(a.id, a.display_name);
    }
  }
  return [
    { value: 'All', label: 'All' },
    ...Array.from(seen, ([id, name]) => ({ value: id, label: name })),
  ];
}, [allTasks, deleted]);
```

**Step 5: Replace the filter bar render (the first `<div>` inside the return)**

Replace the entire filter bar section (lines ~582-602) with:

```tsx
<div className="flex items-center gap-2 flex-wrap">
  <FilterPill
    label="Assignee"
    value={filterAssignee}
    options={assigneeOptions}
    onChange={setFilterAssignee}
  />
  <FilterPill
    label="Status"
    value={filterStatus}
    options={[
      { value: 'All', label: 'All' },
      ...ALL_STATUSES.map(s => ({ value: s, label: s })),
    ]}
    onChange={setFilterStatus}
  />
  <FilterPill
    label="Priority"
    value={filterPriority}
    options={[
      { value: 'All', label: 'All' },
      ...PRIORITIES.map(p => ({ value: p, label: p })),
    ]}
    onChange={setFilterPriority}
  />
</div>
```

**Step 6: Remove the Add Task form block (lines ~604-650)**

Delete the entire `<AnimatePresence>{showAddForm && ...}</AnimatePresence>` block. Also remove the state variables: `showAddForm`, `newName`, `newDept`, `newPriority`, `newDeadline`, `adding`. The add task functionality moves to a kebab menu (Task 3).

**Step 7: Verify it compiles**

Run: `cd /Volumes/CODEUSER/seeko-studio && npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds.

**Step 8: Commit**

```bash
git add src/components/dashboard/TaskList.tsx
git commit -m "feat(tasks): replace search+status filter with 3 pill filters"
```

---

### Task 3: Add header with title and kebab menu

**Files:**
- Modify: `src/components/dashboard/TaskList.tsx` (return block)
- Modify: `src/app/(dashboard)/tasks/page.tsx` (remove page-level header)

**Step 1: Wrap the table in a Card with header**

In the `return` statement of TaskList, wrap everything in a Card and add a header row before the filter pills:

```tsx
return (
  <div className="flex flex-col gap-4">
    <Card>
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          {isAdmin ? 'All Tasks' : 'My Tasks'}
        </h2>
        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreVertical className="size-4" />
                <span className="sr-only">Task options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowAddForm(true)} className="flex items-center gap-2">
                <Plus className="size-3.5" />
                Add Task
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap px-4 pb-3">
        {/* FilterPill components here */}
      </div>

      {/* Table content here */}
    </Card>

    {/* Dialogs (TaskDetail, Deliverables, Handoff) stay outside the Card */}
  </div>
);
```

**Step 2: Add `MoreVertical` to lucide imports**

```tsx
import { MoreVertical, ... } from 'lucide-react';
```

**Step 3: Bring back minimal add-task state**

Keep `showAddForm` state and the `handleAddTask` callback — but render the add form as a simple inline row inside the Card when triggered (or as a modal). For now, keep the inline form but move it inside the Card, below the filters.

**Step 4: Update the tasks page to remove duplicate header**

In `src/app/(dashboard)/tasks/page.tsx`, remove the `<div>` with `<h1>` and `<p>` tags (lines 24-30). The title is now inside TaskList.

```tsx
return (
  <Suspense>
    <TaskList
      tasks={tasks}
      isAdmin={isAdmin}
      team={team}
      docs={docs}
      currentUserId={user?.id ?? ''}
    />
  </Suspense>
);
```

**Step 5: Verify it compiles**

Run: `cd /Volumes/CODEUSER/seeko-studio && npx next build --no-lint 2>&1 | tail -5`

**Step 6: Commit**

```bash
git add src/components/dashboard/TaskList.tsx src/app/\(dashboard\)/tasks/page.tsx
git commit -m "feat(tasks): add card header with kebab menu, remove page-level heading"
```

---

### Task 4: Rewrite the table layout — column headers + rows

**Files:**
- Modify: `src/components/dashboard/TaskList.tsx` — `renderTaskRow` function and `renderContent` function

**Step 1: Add column headers inside the Card, after the filter pills**

```tsx
<div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-border px-4 py-2">
  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</span>
  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground w-24 text-center hidden sm:block">Assignees</span>
  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground w-32 text-center hidden sm:block">Status</span>
</div>
```

**Step 2: Rewrite `renderTaskRow`**

Replace the entire `renderTaskRow` function with a clean 3-column grid row:

```tsx
const renderTaskRow = (task: Task | TaskWithAssignee) => {
  const status = getEffectiveStatus(task);
  const assignee = getAssignee(task);
  const isComplete = status === 'Complete';

  const statusStyles: Record<string, string> = {
    'In Progress': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    'Complete':    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    'In Review':   'bg-blue-500/10 text-blue-400 border-blue-500/20',
    'Blocked':     'bg-red-500/10 text-red-400 border-red-500/20',
  };

  const statusIcons: Record<string, typeof Circle> = {
    'In Progress': Timer,
    'Complete':    CheckCircle2,
    'In Review':   AlertCircle,
    'Blocked':     Circle,
  };

  const StatusIcon = statusIcons[status] ?? Circle;

  const statusBadge = (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide whitespace-nowrap',
      statusStyles[status] ?? statusStyles['In Progress']
    )}>
      <StatusIcon className="size-3" />
      {status}
    </span>
  );

  return (
    <StaggerItem
      key={task.id}
      className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-4 transition-colors hover:bg-muted/30"
    >
      <button
        onClick={() => setSelectedTask(task)}
        className={cn(
          'min-w-0 truncate text-sm text-left hover:underline',
          isComplete ? 'text-muted-foreground line-through' : 'text-foreground'
        )}
      >
        {task.name}
      </button>

      <div className="w-24 flex justify-center hidden sm:flex">
        {assignee ? (
          <div className="flex -space-x-2">
            <Avatar className="size-8 border-2 border-card">
              <AvatarImage src={assignee.avatar_url ?? undefined} alt={assignee.display_name ?? ''} />
              <AvatarFallback className="text-[9px] bg-secondary">
                {getInitials(assignee.display_name ?? '?')}
              </AvatarFallback>
            </Avatar>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>

      <div className="w-32 flex justify-center hidden sm:flex">
        {isAdmin ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="focus:outline-none">
                {statusBadge}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {ALL_STATUSES.map(s => {
                const Icon = statusIcons[s] ?? Circle;
                return (
                  <DropdownMenuItem
                    key={s}
                    onClick={() => handleStatusChange(task.id, s)}
                    className={cn('flex items-center gap-2 text-xs', s === status && 'font-medium')}
                  >
                    <Icon className="size-3.5" />
                    {s}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          statusBadge
        )}
      </div>
    </StaggerItem>
  );
};
```

**Step 3: Simplify `renderContent` — remove department grouping**

Replace the entire `renderContent` function. Remove the admin department-grouping branch entirely:

```tsx
const renderContent = () => (
  <>
    <Stagger className="flex flex-col divide-y divide-border">
      {filtered.map(t => renderTaskRow(t))}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CheckCircle2 className="size-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-foreground">No tasks found</p>
          <p className="text-xs text-muted-foreground">Try adjusting your filters.</p>
        </div>
      )}
    </Stagger>

    {selectedTask && (
      <TaskDetail
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={open => { if (!open) setSelectedTask(null); }}
        team={team}
        docs={docs}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
      />
    )}

    {deliverableTask && (
      <DeliverablesUploadDialog
        open
        onOpenChange={open => { if (!open) setDeliverableTask(null); }}
        task={deliverableTask}
        onSubmit={async (files) => {
          for (const file of files) {
            const form = new FormData();
            form.append('file', file);
            const res = await fetch(`/api/tasks/${deliverableTask.id}/deliverables`, { method: 'POST', body: form });
            if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
          }
          await doCompleteTask(deliverableTask.id);
          notifyAdminsTaskCompleted(
            deliverableTask.id,
            deliverableTask.name,
            team.find(m => m.id === currentUserId)?.display_name ?? 'Someone'
          );
        }}
        onHandoff={async (files) => {
          for (const file of files) {
            const form = new FormData();
            form.append('file', file);
            const res = await fetch(`/api/tasks/${deliverableTask.id}/deliverables`, { method: 'POST', body: form });
            if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
          }
          const task = deliverableTask;
          setDeliverableTask(null);
          setTimeout(() => setHandoffTask(task), 150);
        }}
        onSkip={async () => {
          await doCompleteTask(deliverableTask.id);
          notifyAdminsTaskCompleted(
            deliverableTask.id,
            deliverableTask.name,
            team.find(m => m.id === currentUserId)?.display_name ?? 'Someone'
          );
        }}
      />
    )}

    {handoffTask && (
      <HandoffDialog
        task={handoffTask}
        team={team}
        currentUserId={currentUserId}
        open={!!handoffTask}
        onOpenChange={open => { if (!open) setHandoffTask(null); }}
        onHandoffComplete={(toUserId) => {
          setAssignments(prev => ({ ...prev, [handoffTask.id]: toUserId }));
          setHandoffTask(null);
        }}
      />
    )}
  </>
);
```

**Step 4: Verify it compiles**

Run: `cd /Volumes/CODEUSER/seeko-studio && npx next build --no-lint 2>&1 | tail -5`

**Step 5: Commit**

```bash
git add src/components/dashboard/TaskList.tsx
git commit -m "feat(tasks): rewrite table to 3-column grid with status badges"
```

---

### Task 5: Clean up unused imports, constants, and state

**Files:**
- Modify: `src/components/dashboard/TaskList.tsx`

**Step 1: Remove unused imports**

Remove from lucide imports: `Search`, `Clock`, `UserPlus`, `Trash2`, `ArrowRightLeft` (these are only used in the old row or handled in dialogs).

Remove unused component imports: `Input`, `Select`, `Checkbox`.

**Step 2: Remove unused constants**

Delete: `PRIORITY_STYLE`, `DEPT_COLOR`, `DEPT_SECTION_COLOR`, `FILTER_STATUSES`.

**Step 3: Remove unused state and callbacks**

Remove state: `showAddForm`, `newName`, `newDept`, `newPriority`, `newDeadline`, `adding`.

Remove callbacks that are no longer used from the table: `handleToggleComplete`, `handleDeptChange`, `handlePriorityChange`, `handleDelete`, `getEffectiveDept`.

Remove state: `taskDepts`, `taskPriorities`.

Keep: `handleStatusChange`, `doCompleteTask`, `handleAssign`, `getEffectiveStatus`, `getEffectivePriority` (still used for filtering), `handleAddTask` (used from kebab menu), `getAssignee`.

**Step 4: Remove the exported `filterTasks` function**

Check if `filterTasks` is used elsewhere:

Run: `grep -r "filterTasks" /Volumes/CODEUSER/seeko-studio/src --include="*.tsx" --include="*.ts" -l`

If only used in TaskList.tsx, remove it (filtering is now inline in the `filtered` memo).

**Step 5: Verify it compiles**

Run: `cd /Volumes/CODEUSER/seeko-studio && npx next build --no-lint 2>&1 | tail -5`

**Step 6: Commit**

```bash
git add src/components/dashboard/TaskList.tsx
git commit -m "refactor(tasks): remove unused imports, constants, and state from old layout"
```

---

### Task 6: Add member status editing in TaskDetail

**Files:**
- Modify: `src/components/dashboard/TaskDetail.tsx:606-609` (status display section)

**Step 1: Check if status editing exists for non-admins in TaskDetail**

Currently the detail panel shows status as display-only. Members need to be able to change status here since they can't do it inline.

**Step 2: Add status dropdown for task owner in TaskDetail**

In TaskDetail, replace the static status display (around line 607) with a conditional:

```tsx
{(isAdmin || task.assignee_id === currentUserId) ? (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button className={`flex items-center gap-1.5 ${statusCfg.className} hover:opacity-80 transition-opacity`}>
        <StatusIcon className="size-3.5" />
        <span className="text-xs font-medium">{statusCfg.label}</span>
        <ChevronDown className="size-3 ml-0.5" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      {(['Complete', 'In Progress', 'In Review', 'Blocked'] as const).map(s => {
        const cfg = STATUS_DISPLAY[s];
        const Icon = cfg.icon;
        return (
          <DropdownMenuItem
            key={s}
            onClick={async () => {
              await supabase.from('tasks').update({ status: s }).eq('id', task.id);
            }}
            className={`flex items-center gap-2 text-xs ${s === task.status ? 'font-medium' : ''}`}
          >
            <Icon className={`size-3.5 ${cfg.className}`} />
            {s}
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuContent>
  </DropdownMenu>
) : (
  <div className={`flex items-center gap-1.5 ${statusCfg.className}`}>
    <StatusIcon className="size-3.5" />
    <span className="text-xs font-medium">{statusCfg.label}</span>
  </div>
)}
```

**Step 3: Add missing imports to TaskDetail**

Add `ChevronDown` to the lucide imports. Add `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem` imports.

**Step 4: Verify it compiles**

Run: `cd /Volumes/CODEUSER/seeko-studio && npx next build --no-lint 2>&1 | tail -5`

**Step 5: Commit**

```bash
git add src/components/dashboard/TaskDetail.tsx
git commit -m "feat(tasks): add status editing for task assignees in detail panel"
```

---

### Task 7: Visual polish and responsive mobile handling

**Files:**
- Modify: `src/components/dashboard/TaskList.tsx`

**Step 1: Add mobile row layout**

On mobile (`sm:` breakpoint and below), the Assignees and Status columns are hidden (`hidden sm:flex`). Add a mobile-friendly view that shows status below the task name:

```tsx
{/* Mobile-only: status badge below task name */}
<div className="flex items-center gap-2 sm:hidden col-span-full pl-0 -mt-1">
  {isAdmin ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="focus:outline-none">{statusBadge}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {ALL_STATUSES.map(s => {
          const Icon = statusIcons[s] ?? Circle;
          return (
            <DropdownMenuItem key={s} onClick={() => handleStatusChange(task.id, s)}>
              <Icon className="size-3.5 mr-2" />{s}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    statusBadge
  )}
  {assignee && (
    <Avatar className="size-6 border-2 border-card">
      <AvatarImage src={assignee.avatar_url ?? undefined} />
      <AvatarFallback className="text-[7px] bg-secondary">{getInitials(assignee.display_name ?? '?')}</AvatarFallback>
    </Avatar>
  )}
</div>
```

**Step 2: Verify it compiles and test responsiveness**

Run: `cd /Volumes/CODEUSER/seeko-studio && npx next build --no-lint 2>&1 | tail -5`

**Step 3: Commit**

```bash
git add src/components/dashboard/TaskList.tsx
git commit -m "feat(tasks): add mobile-responsive task row layout"
```

---

### Task 8: Manual testing and final verification

**Step 1: Start dev server**

Run: `cd /Volumes/CODEUSER/seeko-studio && npm run dev`

**Step 2: Test checklist**

Verify each of these manually at `localhost:3000/tasks`:

- [ ] Card renders with title and kebab menu (admin)
- [ ] 3 filter pills display: Assignee, Status, Priority
- [ ] Each filter pill opens a dropdown and filters correctly
- [ ] Table shows 3 columns: Name, Assignees, Status
- [ ] Clicking task name opens TaskDetail side panel
- [ ] Admin can click status badge to change status inline
- [ ] Member sees status badge as display-only
- [ ] Member can change status from detail panel
- [ ] "Complete" status triggers deliverable upload dialog
- [ ] Handoff flow still works from detail panel
- [ ] Empty state shows when no tasks match filters
- [ ] Mobile: columns collapse, status shown below name
- [ ] Add Task works from kebab menu (admin)
- [ ] Deep-link `?task=<id>` still opens detail panel

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix(tasks): address issues found during manual testing"
```
