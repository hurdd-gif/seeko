import type { WriteTool, ToolContext, StageResult, CommitResult } from '../tool-contract';
import { getServiceClient } from '@/lib/supabase/service';
import type { MilestoneHealth } from '@/lib/types';
import { buildMilestoneIndex, buildAreaIndex, resolveMilestoneRef, resolveAreaRef } from '../entity-index';
import { AgentActionError } from '../errors';

const MILESTONE_HEALTHS: readonly MilestoneHealth[] = ['on_track', 'at_risk', 'off_track'];
const AREA_STATUSES = ['Active', 'Planned', 'Complete'] as const;

function asString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  return typeof value === 'string' ? value.trim() : '';
}

const setMilestoneHealth: WriteTool = {
  id: 'set_milestone_health',
  gated: true,
  description:
    'Set a project milestone\'s health to on_track, at_risk, or off_track. Use this when a milestone is or is not on track. Staged for approval.',
  inputSchema: {
    type: 'object',
    properties: {
      milestone: { type: 'string', description: 'Milestone name (exact or contained)' },
      health: { type: 'string', enum: [...MILESTONE_HEALTHS] },
    },
    required: ['milestone', 'health'],
    additionalProperties: false,
  },
  async stage(input, ctx): Promise<StageResult> {
    const health = asString(input, 'health') as MilestoneHealth;
    if (!MILESTONE_HEALTHS.includes(health)) {
      return { ok: false, error: `Unknown health "${input.health}". Use on_track, at_risk, or off_track.` };
    }
    const milestone = resolveMilestoneRef(asString(input, 'milestone'), buildMilestoneIndex(ctx.board));
    if (!milestone) return { ok: false, error: `Could not find milestone "${asString(input, 'milestone')}".` };
    return {
      ok: true,
      resolvedArgs: { milestoneId: milestone.id, milestoneName: milestone.name, health },
      summary: `Set milestone "${milestone.name}" health to ${health}`,
    };
  },
  async commit(args): Promise<CommitResult> {
    // milestones isn't in the generated Database types — same cast as tasks-board.ts.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = getServiceClient() as any;
    const { error } = await service.from('milestones').update({ health: args.health }).eq('id', args.milestoneId);
    if (error) throw new AgentActionError('EKO could not update the milestone health.', 500);
    return { reply: `Set milestone "${args.milestoneName}" health to ${args.health}.` };
  },
};

const setAreaStatus: WriteTool = {
  id: 'set_area_status',
  gated: true,
  description: 'Set a game area status to Active, Planned, or Complete. Staged for approval.',
  inputSchema: {
    type: 'object',
    properties: { area: { type: 'string' }, status: { type: 'string', enum: [...AREA_STATUSES] } },
    required: ['area', 'status'],
    additionalProperties: false,
  },
  async stage(input, ctx): Promise<StageResult> {
    const status = asString(input, 'status');
    if (!AREA_STATUSES.includes(status as (typeof AREA_STATUSES)[number])) {
      return { ok: false, error: `Unknown area status "${input.status}".` };
    }
    const area = resolveAreaRef(asString(input, 'area'), buildAreaIndex(ctx.board));
    if (!area) return { ok: false, error: `Could not find area "${asString(input, 'area')}".` };
    return {
      ok: true,
      resolvedArgs: { areaId: area.id, areaName: area.name, status },
      summary: `Set area "${area.name}" status to ${status}`,
    };
  },
  async commit(args): Promise<CommitResult> {
    const service = getServiceClient();
    const { error } = await service.from('areas').update({ status: args.status } as never).eq('id', String(args.areaId));
    if (error) throw new AgentActionError('EKO could not update the area status.', 500);
    return { reply: `Set area "${args.areaName}" status to ${args.status}.` };
  },
};

const setAreaProgress: WriteTool = {
  id: 'set_area_progress',
  gated: true,
  description: 'Set a game area progress percent (0–100). Staged for approval.',
  inputSchema: {
    type: 'object',
    properties: { area: { type: 'string' }, progress: { type: 'number' } },
    required: ['area', 'progress'],
    additionalProperties: false,
  },
  async stage(input, ctx): Promise<StageResult> {
    const raw = input.progress;
    const progress = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      return { ok: false, error: 'progress must be an integer between 0 and 100.' };
    }
    const area = resolveAreaRef(asString(input, 'area'), buildAreaIndex(ctx.board));
    if (!area) return { ok: false, error: `Could not find area "${asString(input, 'area')}".` };
    return {
      ok: true,
      resolvedArgs: { areaId: area.id, areaName: area.name, progress },
      summary: `Set area "${area.name}" progress to ${progress}%`,
    };
  },
  async commit(args): Promise<CommitResult> {
    const service = getServiceClient();
    const { error } = await service.from('areas').update({ progress: args.progress } as never).eq('id', String(args.areaId));
    if (error) throw new AgentActionError('EKO could not update the area progress.', 500);
    return { reply: `Set area "${args.areaName}" progress to ${args.progress}%.` };
  },
};

export const MILESTONE_AREA_WRITE_TOOLS: WriteTool[] = [setMilestoneHealth, setAreaStatus, setAreaProgress];
