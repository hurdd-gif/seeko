import { HiddenColumnsStack } from '@/components/dashboard/tasks/HiddenColumnsStack';
import type { TaskStatus } from '@/lib/types';

/* No-backend visual-QA preview for the Hidden columns rollup, reachable at
 * /tasks/hidden-columns-qa WITHOUT the loader's auth gate. Mounts the REAL
 * <HiddenColumnsStack> on the board's light canvas so the expand/collapse
 * motion (width tween + row cascade + popLayout exit) can be exercised in a
 * fresh browser session. NOT a migration target — deliberately absent from
 * routeInventory. */

const HIDDEN: TaskStatus[] = ['Backlog', 'Todo', 'In Review', 'Canceled', 'Duplicate'];

const COUNTS = Object.fromEntries(HIDDEN.map((s) => [s, 0])) as Record<TaskStatus, number>;

export function HiddenColumnsQaRoute() {
  // flex row mirrors the board rail's real layout context (width:auto = content width)
  return (
    <div className="flex min-h-screen items-start bg-[#f5f5f5] p-12">
      <HiddenColumnsStack hiddenStatuses={HIDDEN} countsByStatus={COUNTS} defaultOpen={false} />
    </div>
  );
}
