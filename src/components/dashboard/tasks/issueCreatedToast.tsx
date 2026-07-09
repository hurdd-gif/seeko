/**
 * issueCreatedToast — the first consumer of the canonical rich-toast anatomy.
 *
 * Bridges a freshly-created `Task` into the structured success toast shown in
 * the reference: a green success glyph + "Issue created", the issue identifier
 * + name on the subject row (with the real status circle), and a "View issue"
 * link that navigates to the task detail page.
 *
 * Fire it right after `createTask(...)` resolves:
 *   const created = await createTask(input);
 *   issueCreatedToast(created);
 */

import { showRichToast } from '@/components/ui/rich-toast';
import { appNavigate } from '@/lib/app-navigate';
import type { Task } from '@/lib/types';
import { StatusDot } from './StatusDot';

/**
 * Issue-key prefix. The board displays the bare `task_number`, but issues are
 * referenced with the team key (Linear team DIH; the milestone search strips a
 * `dih-` prefix). Centralised here so the identifier format has one home —
 * change this constant if the real prefix differs.
 */
export const ISSUE_KEY_PREFIX = 'DIH';

/** "DIH-29" for a numbered task, or undefined if the row has no number yet. */
export function issueIdentifier(task: Pick<Task, 'task_number'>): string | undefined {
  return task.task_number != null ? `${ISSUE_KEY_PREFIX}-${task.task_number}` : undefined;
}

export function issueCreatedToast(task: Task): void {
  const href = `/tasks/${task.id}`;
  showRichToast({
    variant: 'success',
    title: 'Issue created',
    subject: {
      statusIcon: <StatusDot status={task.status} size="lg" />,
      identifier: issueIdentifier(task),
      label: task.name,
    },
    action: {
      label: 'View issue',
      href,
      onClick: () => appNavigate(href),
    },
  });
}
