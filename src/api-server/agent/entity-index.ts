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

export type MilestoneIndexEntry = { id: string; name: string; health?: string; targetDate?: string };
export type AreaIndexEntry = {
  id: string;
  name: string;
  status?: string;
  progress?: number;
  phase?: string;
};

export function buildMilestoneIndex(board: TasksBoardData | null): MilestoneIndexEntry[] {
  if (!board) return [];
  return board.projectMilestones.map((milestone) => ({
    id: milestone.id,
    name: milestone.name,
    health: milestone.health ?? undefined,
    targetDate: milestone.target_date ?? undefined,
  }));
}

export function buildAreaIndex(board: TasksBoardData | null): AreaIndexEntry[] {
  if (!board) return [];
  return board.areas.map((area) => ({
    id: area.id,
    name: area.name,
    status: area.status ?? undefined,
    progress: typeof area.progress === 'number' ? area.progress : undefined,
    phase: area.phase ?? undefined,
  }));
}

/** Longest-contained-name match — the shared name-resolution idiom. */
function resolveByName<T extends { name: string }>(value: string, index: T[]): T | undefined {
  const normalized = value.toLowerCase();
  return [...index]
    .sort((a, b) => b.name.length - a.name.length)
    .find((entry) => normalized.includes(entry.name.toLowerCase()));
}

export function resolveMilestoneRef(
  value: string,
  index: MilestoneIndexEntry[],
): MilestoneIndexEntry | undefined {
  return resolveByName(value, index);
}

export function resolveAreaRef(value: string, index: AreaIndexEntry[]): AreaIndexEntry | undefined {
  return resolveByName(value, index);
}

export function resolveStaffRef(value: string, index: StaffIndexEntry[]): StaffIndexEntry | undefined {
  return resolveByName(value, index);
}
