import type { ReadTool } from '../tool-contract';
import { EMPTY_SCHEMA } from '../tool-contract';
import type { TaskWithAssignee } from '@/lib/types';

/** UTC day-bucket overdue count — deterministic regardless of server tz. */
function daysOverdue(dateIso: string | undefined, now: Date): number {
  if (!dateIso) return 0;
  const target = Date.parse(dateIso);
  if (Number.isNaN(target)) return 0;
  return Math.floor(now.getTime() / 86_400_000) - Math.floor(target / 86_400_000);
}

function taskIsOverdue(task: TaskWithAssignee, now: Date): boolean {
  if (!task.deadline || task.status === 'Done' || task.status === 'Canceled' || task.status === 'Duplicate') {
    return false;
  }
  return daysOverdue(task.deadline, now) > 0;
}

export const READ_TOOLS: ReadTool[] = [
  {
    id: 'list_tasks',
    gated: false,
    description:
      'List every issue on the board with its task number, name, status, priority, assignee, due date, and whether it is overdue. Call this before proposing any task write.',
    inputSchema: EMPTY_SCHEMA,
    async run(_input, ctx) {
      const now = new Date();
      return (ctx.board?.tasks ?? []).map((task) => ({
        number: typeof task.task_number === 'number' ? task.task_number : null,
        name: task.name,
        status: task.status,
        priority: task.priority,
        assignee: task.assignee?.display_name ?? null,
        due: task.deadline ?? null,
        overdue: taskIsOverdue(task, now),
      }));
    },
  },
  {
    id: 'list_milestones',
    gated: false,
    description:
      'List project milestones with their stored health (on_track | at_risk | off_track), target date, and how many days overdue they are. Use this to decide whether a milestone is on track.',
    inputSchema: EMPTY_SCHEMA,
    async run(_input, ctx) {
      const now = new Date();
      return (ctx.board?.projectMilestones ?? []).map((milestone) => ({
        name: milestone.name,
        health: milestone.health ?? null,
        targetDate: milestone.target_date ?? null,
        overdueDays: milestone.target_date ? Math.max(0, daysOverdue(milestone.target_date, now)) : 0,
      }));
    },
  },
  {
    id: 'list_areas',
    gated: false,
    description: 'List game areas with their status (Active | Planned | Complete), phase, and progress percent.',
    inputSchema: EMPTY_SCHEMA,
    async run(_input, ctx) {
      return (ctx.board?.areas ?? []).map((area) => ({
        name: area.name,
        status: area.status,
        phase: area.phase ?? null,
        progress: typeof area.progress === 'number' ? area.progress : null,
      }));
    },
  },
  {
    id: 'list_staff',
    gated: false,
    description: 'List roster members EKO can assign tasks to, by display name and department.',
    inputSchema: EMPTY_SCHEMA,
    async run(_input, ctx) {
      return (ctx.board?.team ?? [])
        .filter((member) => member.display_name)
        .map((member) => ({ name: member.display_name, department: member.department ?? null }));
    },
  },
];
