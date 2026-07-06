import type { AgentTool } from './tool-contract';
import { READ_TOOLS } from './tools/read-tools';
import { TASK_WRITE_TOOLS } from './tools/task-write-tools';
import { MILESTONE_AREA_WRITE_TOOLS } from './tools/milestone-area-write-tools';

export const AGENT_TOOLS: AgentTool[] = [
  ...READ_TOOLS,
  ...TASK_WRITE_TOOLS,
  ...MILESTONE_AREA_WRITE_TOOLS,
];

export function getToolById(id: string): AgentTool | undefined {
  return AGENT_TOOLS.find((tool) => tool.id === id);
}
