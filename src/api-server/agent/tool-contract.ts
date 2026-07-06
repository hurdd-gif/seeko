import type { AuthenticatedUser } from '../supabase';
import type { TasksBoardData } from '@/lib/tasks-board';

export type ToolContext = {
  user: AuthenticatedUser;
  board: TasksBoardData | null;
  conversationId: string;
};

export type ToolJsonSchema = {
  type: 'object';
  properties: Record<string, { type: string; description?: string; enum?: string[] }>;
  required?: string[];
  additionalProperties?: boolean;
};

/**
 * Deep-link target for an executed write. Pure UI-choreography metadata for the
 * tray's post-write receipt — never carries or triggers a mutation. Deletes and
 * milestone/area writes return no target.
 */
export type AgentWriteTarget = {
  kind: 'task';
  taskId: string;
  taskNumber?: number | null;
  name: string;
  action: 'create' | 'status' | 'assignee' | 'priority' | 'dueDate';
};

export type CommitResult = { reply: string; target?: AgentWriteTarget };

export type StageResult =
  | { ok: true; resolvedArgs: Record<string, unknown>; summary: string }
  | { ok: false; error: string };

export type ReadTool = {
  id: string;
  gated: false;
  description: string;
  inputSchema: ToolJsonSchema;
  run(input: Record<string, unknown>, ctx: ToolContext): Promise<unknown>;
};

export type WriteTool = {
  id: string;
  gated: true;
  description: string;
  inputSchema: ToolJsonSchema;
  /** Resolve entity refs against the board + validate. NO mutation. */
  stage(input: Record<string, unknown>, ctx: ToolContext): Promise<StageResult>;
  /** Execute the stored, already-resolved write. */
  commit(resolvedArgs: Record<string, unknown>, user: AuthenticatedUser): Promise<CommitResult>;
};

export type AgentTool = ReadTool | WriteTool;

const EMPTY_SCHEMA: ToolJsonSchema = { type: 'object', properties: {}, additionalProperties: false };
export { EMPTY_SCHEMA };
