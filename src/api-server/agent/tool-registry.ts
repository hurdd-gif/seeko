import type { AgentTool } from './tool-contract';
import { READ_TOOLS } from './tools/read-tools';
import { TASK_WRITE_TOOLS } from './tools/task-write-tools';

// Read tools + task write tools. Keep this the single source the loop,
// the approval executor, and the system prompt all read from.
export const AGENT_TOOLS: AgentTool[] = [...READ_TOOLS, ...TASK_WRITE_TOOLS];

export function getToolById(id: string): AgentTool | undefined {
  return AGENT_TOOLS.find((tool) => tool.id === id);
}
