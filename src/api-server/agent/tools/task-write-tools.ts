import type { WriteTool, ToolContext, StageResult, CommitResult } from '../tool-contract';
import { getServiceClient } from '@/lib/supabase/service';
import { TASK_STATUSES, type Priority, type TaskStatus } from '@/lib/types';
import {
  buildTaskIndex,
  buildStaffIndex,
  resolveTaskRef,
  resolveStaffRef,
} from '../entity-index';
import { AgentActionError } from '../errors';
import {
  normalizeDueDate,
  markLatestTaskActivityAsEko,
  hideLatestHumanAssignedEcho,
  markLatestDeletedTaskActivityAsEko,
} from '../eko-activity';

const PRIORITIES: readonly Priority[] = ['Urgent', 'High', 'Medium', 'Low'];

function asString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  return typeof value === 'string' ? value.trim() : '';
}

function resolveTask(input: Record<string, unknown>, ctx: ToolContext) {
  return resolveTaskRef(asString(input, 'task'), buildTaskIndex(ctx.board));
}

// --- create_task -----------------------------------------------------------

const createTask: WriteTool = {
  id: 'create_task',
  gated: true,
  description:
    'Create a new issue. Requires title, status, and priority; dueDate is optional (omit for no deadline). The issue is staged for the user to approve — never claim it was created.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Issue title' },
      status: { type: 'string', enum: [...TASK_STATUSES], description: 'Initial status' },
      priority: { type: 'string', enum: [...PRIORITIES], description: 'Priority' },
      dueDate: { type: 'string', description: 'ISO date (YYYY-MM-DD) or omit for no deadline' },
    },
    required: ['title', 'status', 'priority'],
    additionalProperties: false,
  },
  async stage(input): Promise<StageResult> {
    const title = asString(input, 'title');
    const status = asString(input, 'status') as TaskStatus;
    const priority = asString(input, 'priority') as Priority;
    const missing = [
      title ? null : 'title',
      TASK_STATUSES.includes(status) ? null : 'a valid status',
      PRIORITIES.includes(priority) ? null : 'a valid priority',
    ].filter(Boolean);
    if (missing.length) return { ok: false, error: `create_task needs ${missing.join(', ')}.` };
    const dueToken = asString(input, 'dueDate');
    const deadline = dueToken ? normalizeDueDate(dueToken) : null;
    return {
      ok: true,
      resolvedArgs: { name: title, status, priority, deadline },
      summary: `Create "${title}" as ${status}, ${priority} priority${deadline ? `, due ${deadline}` : ''}`,
    };
  },
  async commit(args, user): Promise<CommitResult> {
    const service = getServiceClient();
    const { data, error } = await service
      .from('tasks')
      .insert({
        name: args.name,
        department: 'Coding',
        status: args.status,
        priority: args.priority,
        deadline: args.deadline ?? null,
        description: null,
      } as never)
      .select('id, task_number, name, status, priority, deadline')
      .single();
    if (error) throw new AgentActionError('EKO could not create the issue.', 500);
    const created = data as unknown as { id: string; task_number?: number | null } | null;
    if (created) await markLatestTaskActivityAsEko({ taskId: created.id, kind: 'created', userId: user.id });
    return {
      reply: `Created issue "${args.name}" in ${args.status}.`,
      target: created
        ? { kind: 'task', taskId: created.id, taskNumber: created.task_number, name: String(args.name), action: 'create' }
        : undefined,
    };
  },
};

// --- set_task_status -------------------------------------------------------

const setTaskStatus: WriteTool = {
  id: 'set_task_status',
  gated: true,
  description: 'Move an existing issue to a different status. Staged for approval.',
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'Task number ("task 22"/"#22") or exact/contained task name' },
      status: { type: 'string', enum: [...TASK_STATUSES] },
    },
    required: ['task', 'status'],
    additionalProperties: false,
  },
  async stage(input, ctx): Promise<StageResult> {
    const status = asString(input, 'status') as TaskStatus;
    if (!TASK_STATUSES.includes(status)) return { ok: false, error: `Unknown status "${input.status}".` };
    const task = resolveTask(input, ctx);
    if (!task) return { ok: false, error: `Could not find task "${asString(input, 'task')}".` };
    return {
      ok: true,
      resolvedArgs: { taskId: task.id, taskName: task.name, taskNumber: task.taskNumber ?? null, status },
      summary: `Move "${task.name}" to ${status}`,
    };
  },
  async commit(args, user): Promise<CommitResult> {
    const service = getServiceClient();
    const { error } = await service.from('tasks').update({ status: args.status } as never).eq('id', String(args.taskId));
    if (error) throw new AgentActionError('EKO could not update the issue status.', 500);
    await markLatestTaskActivityAsEko({ taskId: String(args.taskId), kind: 'status_changed', userId: user.id });
    return {
      reply: `Moved "${args.taskName}" to ${args.status}.`,
      target: { kind: 'task', taskId: String(args.taskId), taskNumber: (args.taskNumber as number | null) ?? null, name: String(args.taskName), action: 'status' },
    };
  },
};

// --- set_task_assignee -----------------------------------------------------

const setTaskAssignee: WriteTool = {
  id: 'set_task_assignee',
  gated: true,
  description: 'Assign an existing issue to a roster member. Staged for approval.',
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string' },
      assignee: { type: 'string', description: 'Roster member display name' },
    },
    required: ['task', 'assignee'],
    additionalProperties: false,
  },
  async stage(input, ctx): Promise<StageResult> {
    const task = resolveTask(input, ctx);
    if (!task) return { ok: false, error: `Could not find task "${asString(input, 'task')}".` };
    const member = resolveStaffRef(asString(input, 'assignee'), buildStaffIndex(ctx.board));
    if (!member) return { ok: false, error: `Could not find "${asString(input, 'assignee')}" on the roster.` };
    return {
      ok: true,
      resolvedArgs: {
        taskId: task.id, taskName: task.name, taskNumber: task.taskNumber ?? null,
        assigneeId: member.id, assigneeName: member.name,
      },
      summary: `Assign "${task.name}" to ${member.name}`,
    };
  },
  async commit(args, user): Promise<CommitResult> {
    const service = getServiceClient();
    const { error } = await service.from('tasks').update({ assignee_id: args.assigneeId } as never).eq('id', String(args.taskId));
    if (error) throw new AgentActionError('EKO could not assign the issue.', 500);
    await markLatestTaskActivityAsEko({ taskId: String(args.taskId), kind: 'assignee_changed', userId: user.id });
    await hideLatestHumanAssignedEcho({ taskId: String(args.taskId), taskName: String(args.taskName), userId: user.id });
    return {
      reply: `Assigned "${args.taskName}" to ${args.assigneeName}.`,
      target: { kind: 'task', taskId: String(args.taskId), taskNumber: (args.taskNumber as number | null) ?? null, name: String(args.taskName), action: 'assignee' },
    };
  },
};

// --- set_task_priority -----------------------------------------------------

const setTaskPriority: WriteTool = {
  id: 'set_task_priority',
  gated: true,
  description: 'Change an existing issue priority. Staged for approval.',
  inputSchema: {
    type: 'object',
    properties: { task: { type: 'string' }, priority: { type: 'string', enum: [...PRIORITIES] } },
    required: ['task', 'priority'],
    additionalProperties: false,
  },
  async stage(input, ctx): Promise<StageResult> {
    const priority = asString(input, 'priority') as Priority;
    if (!PRIORITIES.includes(priority)) return { ok: false, error: `Unknown priority "${input.priority}".` };
    const task = resolveTask(input, ctx);
    if (!task) return { ok: false, error: `Could not find task "${asString(input, 'task')}".` };
    return {
      ok: true,
      resolvedArgs: { taskId: task.id, taskName: task.name, taskNumber: task.taskNumber ?? null, priority },
      summary: `Set "${task.name}" to ${priority} priority`,
    };
  },
  async commit(args, user): Promise<CommitResult> {
    const service = getServiceClient();
    const { error } = await service.from('tasks').update({ priority: args.priority } as never).eq('id', String(args.taskId));
    if (error) throw new AgentActionError('EKO could not update the issue priority.', 500);
    await markLatestTaskActivityAsEko({ taskId: String(args.taskId), action: 'Changed priority', userId: user.id });
    return {
      reply: `Set "${args.taskName}" to ${args.priority} priority.`,
      target: { kind: 'task', taskId: String(args.taskId), taskNumber: (args.taskNumber as number | null) ?? null, name: String(args.taskName), action: 'priority' },
    };
  },
};

// --- set_task_due ----------------------------------------------------------

const setTaskDue: WriteTool = {
  id: 'set_task_due',
  gated: true,
  description: 'Set or clear an existing issue due date. Pass an ISO date, or "no date" to clear. Staged for approval.',
  inputSchema: {
    type: 'object',
    properties: { task: { type: 'string' }, dueDate: { type: 'string', description: 'ISO date or "no date"' } },
    required: ['task', 'dueDate'],
    additionalProperties: false,
  },
  async stage(input, ctx): Promise<StageResult> {
    const task = resolveTask(input, ctx);
    if (!task) return { ok: false, error: `Could not find task "${asString(input, 'task')}".` };
    const deadline = normalizeDueDate(asString(input, 'dueDate'));
    // Carry the prior deadline so commit's activity_log row keeps the live
    // executor's before_value (task.deadline ?? null) — resolveTaskRef's index
    // entry drops the deadline column, so read it off the full board task here.
    const previousDeadline = ctx.board?.tasks.find((entry) => entry.id === task.id)?.deadline ?? null;
    return {
      ok: true,
      resolvedArgs: { taskId: task.id, taskName: task.name, taskNumber: task.taskNumber ?? null, deadline, previousDeadline },
      summary: deadline ? `Set "${task.name}" due date to ${deadline}` : `Clear the due date for "${task.name}"`,
    };
  },
  async commit(args, user): Promise<CommitResult> {
    const service = getServiceClient();
    const deadline = (args.deadline as string | null) ?? null;
    const { error } = await service.from('tasks').update({ deadline } as never).eq('id', String(args.taskId));
    if (error) throw new AgentActionError('EKO could not update the issue due date.', 500);
    await service.from('activity_log').insert({
      user_id: user.id,
      action: 'Due date changed',
      target: deadline ? `task: ${args.taskName} → ${deadline}` : `task: ${args.taskName} → no date`,
      task_id: args.taskId,
      before_value: (args.previousDeadline as string | null) ?? null,
      after_value: deadline,
      source: 'eko',
    } as never);
    return {
      reply: deadline ? `Set "${args.taskName}" due date to ${deadline}.` : `Cleared the due date for "${args.taskName}".`,
      target: { kind: 'task', taskId: String(args.taskId), taskNumber: (args.taskNumber as number | null) ?? null, name: String(args.taskName), action: 'dueDate' },
    };
  },
};

// --- delete_task -----------------------------------------------------------

const deleteTask: WriteTool = {
  id: 'delete_task',
  gated: true,
  description: 'Delete an existing issue. Destructive and irreversible — always staged for approval.',
  inputSchema: {
    type: 'object',
    properties: { task: { type: 'string' } },
    required: ['task'],
    additionalProperties: false,
  },
  async stage(input, ctx): Promise<StageResult> {
    const task = resolveTask(input, ctx);
    if (!task) return { ok: false, error: `Could not find task "${asString(input, 'task')}".` };
    return {
      ok: true,
      resolvedArgs: { taskId: task.id, taskName: task.name },
      summary: `Delete "${task.name}" from Issues (cannot be undone)`,
    };
  },
  async commit(args, user): Promise<CommitResult> {
    const service = getServiceClient();
    const { data, error } = await service.from('tasks').delete().eq('id', String(args.taskId)).select('id');
    if (error) throw new AgentActionError('EKO could not delete the issue.', 500);
    if (!(data as Array<unknown> | null)?.length) {
      return { reply: `"${args.taskName}" was already removed. No changes were made.` };
    }
    await markLatestDeletedTaskActivityAsEko({ taskName: String(args.taskName), userId: user.id });
    return { reply: `Deleted "${args.taskName}" from Issues.` };
  },
};

export const TASK_WRITE_TOOLS: WriteTool[] = [
  createTask,
  setTaskStatus,
  setTaskAssignee,
  setTaskPriority,
  setTaskDue,
  deleteTask,
];
