import type { TasksBoardData } from '@/lib/tasks-board';

export type TaskIndexEntry = {
  id: string;
  name: string;
  status?: string;
  assigneeName?: string;
  taskNumber?: number;
};

export type StaffIndexEntry = { id: string; name: string };

/** Complete, structured task index straight from the board — every task, real id, no truncation. */
export function buildTaskIndex(board: TasksBoardData | null): TaskIndexEntry[] {
  if (!board) return [];
  return board.tasks.map((task) => ({
    id: task.id,
    name: task.name,
    status: task.status ?? undefined,
    assigneeName: task.assignee?.display_name ?? undefined,
    taskNumber: typeof task.task_number === 'number' ? task.task_number : undefined,
  }));
}

export function buildStaffIndex(board: TasksBoardData | null): StaffIndexEntry[] {
  if (!board) return [];
  return board.team
    .filter((member) => member.display_name)
    .map((member) => ({ id: member.id, name: member.display_name as string }));
}

/**
 * Explicit task-number reference in a message: "task 22", "issue #22", "#22".
 * A bare number with no noun or # marker never matches — dates/quantities would false-positive.
 */
export function parseTaskNumberRef(value: string): number | null {
  const match = value.match(/(?:\b(?:task|issue|todo|ticket)\s*#?|#)(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

/** Resolve a single task from a message: unique number wins, else longest contained name. */
export function resolveTaskRef(value: string, index: TaskIndexEntry[]): TaskIndexEntry | undefined {
  const numberRef = parseTaskNumberRef(value);
  if (numberRef != null) {
    const byNumber = index.find((task) => task.taskNumber === numberRef);
    if (byNumber) return byNumber;
  }
  const normalized = value.toLowerCase();
  return [...index]
    .sort((a, b) => b.name.length - a.name.length)
    .find((task) => normalized.includes(task.name.toLowerCase()));
}
