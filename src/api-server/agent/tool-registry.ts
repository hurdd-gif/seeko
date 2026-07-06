import type { AgentTool } from './tool-contract';
import { READ_TOOLS } from './tools/read-tools';

// Write tools are appended in Tasks 4–5. Keep this the single source the loop,
// the approval executor, and the system prompt all read from.
export const AGENT_TOOLS: AgentTool[] = [...READ_TOOLS];

export function getToolById(id: string): AgentTool | undefined {
  return AGENT_TOOLS.find((tool) => tool.id === id);
}
