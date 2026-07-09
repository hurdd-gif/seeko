import Anthropic from '@anthropic-ai/sdk';
import type { AgentTool, ToolContext, ToolJsonSchema } from './tool-contract';
import { stagePendingAction } from './pending-actions';
import { AgentActionError } from './errors';

export type AssistantBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

export type AssistantMessage = { stop_reason: string; content: AssistantBlock[] };

export type AnthropicToolSpec = { name: string; description: string; input_schema: ToolJsonSchema };

export type ModelCaller = (req: {
  system: string;
  tools: AnthropicToolSpec[];
  messages: unknown[];
}) => Promise<AssistantMessage>;

export type StagedPending = { id: string; toolId: string; summary: string };
export type RunAgentLoopResult = { text: string; pendingActions: StagedPending[]; steps: number };

export type PriorTurn = { role: 'user' | 'assistant'; text: string };
type InitialMessage = { role: 'user' | 'assistant'; content: Array<{ type: 'text'; text: string }> };

/**
 * Build the model's opening `messages` array from prior conversation turns plus the
 * current user message. EKO is otherwise stateless per request, so without this the
 * model cannot remember an offer it made last turn — a bare "yes" arrives with no
 * context. Guarantees the Anthropic contract: the first message is `user`, roles
 * strictly alternate (consecutive same-role turns are merged), and the array ends
 * with the current user message (deduped if history already carried it).
 */
export function buildInitialMessages(userMessage: string, history?: PriorTurn[]): InitialMessage[] {
  const turns: PriorTurn[] = [];
  for (const turn of history ?? []) {
    const text = turn.text.trim();
    if (!text) continue;
    const last = turns[turns.length - 1];
    if (last && last.role === turn.role) {
      last.text = `${last.text}\n${text}`;
    } else {
      turns.push({ role: turn.role, text });
    }
  }
  while (turns.length && turns[0].role === 'assistant') turns.shift();

  const current = userMessage.trim();
  const last = turns[turns.length - 1];
  if (last && last.role === 'user') {
    if (last.text !== current) last.text = `${last.text}\n${current}`;
  } else {
    turns.push({ role: 'user', text: current });
  }
  return turns.map((turn) => ({ role: turn.role, content: [{ type: 'text', text: turn.text }] }));
}

type StagePendingFn = (row: {
  conversationId: string;
  userId: string;
  toolId: string;
  resolvedArgs: Record<string, unknown>;
  summary: string;
}) => Promise<string>;

export const EKO_AGENT_SYSTEM = [
  'You are EKO, the SEEKO Studio dashboard agent. Audience: admins. Be concise and operational.',
  'You act through tools. Use the read tools (list_tasks, list_milestones, list_areas, list_staff) to inspect current state before deciding anything — never guess at data you can look up.',
  'When the user asks you to change something, call the matching write tool. Every write tool STAGES the change for the user to approve with an Approve button; it does NOT take effect immediately.',
  'When you have just staged a write this turn, never say it already happened — say you have prepared it for approval.',
  'A write that was already approved and executed earlier in this conversation HAS taken effect. If the context lists actions as already executed, acknowledge them truthfully and offer to change them back — never deny a change that was executed.',
  'For a conditional request ("update them if they aren\'t on track"), first read the relevant state, evaluate the condition yourself, then call the write tool once per entity that meets it. You may call multiple write tools in a single turn.',
  'If you offered an action on the previous turn and the user confirms it (e.g. replies "yes" or "do it"), proceed to call the write tool(s) for exactly what you offered — do not ask them to restate it.',
  'If a tool returns an error (unresolved entity, invalid value), ask the user a specific clarifying question instead of retrying blindly.',
  'Replies render in a narrow chat bubble. Lead with the direct answer in one short sentence. Put each further point (detail, recommendation, question) on its own line separated by a line break — never one long paragraph. At most three short lines total; drop detail before adding a fourth. Plain text, no markdown.',
].join('\n');

/**
 * Render the conversation's already-executed writes as a context block appended
 * to the system prompt, so EKO knows what it has committed and stops denying it.
 * Empty string when nothing has executed — the caller then leaves the prompt as-is.
 */
export function formatExecutedActionsContext(summaries: string[]): string {
  if (summaries.length === 0) return '';
  const lines = summaries.map((summary) => `- ${summary}`).join('\n');
  return [
    'Writes already approved and executed earlier in this conversation (the user approved each; these have taken effect):',
    lines,
    'If the user asks whether you changed something, acknowledge these truthfully and offer to change it back. Do not say nothing happened.',
  ].join('\n');
}

const MAX_STEPS = 8;

export async function runAgentLoop(params: {
  userMessage: string;
  history?: PriorTurn[];
  system: string;
  ctx: ToolContext;
  tools: AgentTool[];
  caller: ModelCaller;
  maxSteps?: number;
  stagePending?: StagePendingFn;
}): Promise<RunAgentLoopResult> {
  const { userMessage, history, system, ctx, tools, caller } = params;
  const maxSteps = params.maxSteps ?? MAX_STEPS;
  const stage = params.stagePending ?? stagePendingAction;

  const toolSpecs: AnthropicToolSpec[] = tools.map((tool) => ({
    name: tool.id,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
  const byId = new Map(tools.map((tool) => [tool.id, tool]));

  const messages: unknown[] = buildInitialMessages(userMessage, history);
  const pendingActions: StagedPending[] = [];
  const texts: string[] = [];
  let steps = 0;

  for (; steps < maxSteps; steps += 1) {
    const assistant = await caller({ system, tools: toolSpecs, messages });
    messages.push({ role: 'assistant', content: assistant.content });

    for (const block of assistant.content) {
      if (block.type === 'text' && block.text.trim()) texts.push(block.text.trim());
    }

    const toolUses = assistant.content.filter(
      (block): block is Extract<AssistantBlock, { type: 'tool_use' }> => block.type === 'tool_use',
    );
    if (assistant.stop_reason !== 'tool_use' || toolUses.length === 0) break;

    const results: Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }> = [];
    for (const use of toolUses) {
      const tool = byId.get(use.name);
      if (!tool) {
        results.push({ type: 'tool_result', tool_use_id: use.id, content: `Unknown tool: ${use.name}`, is_error: true });
        continue;
      }
      if (tool.gated) {
        const outcome = await tool.stage(use.input, ctx);
        if (!outcome.ok) {
          results.push({ type: 'tool_result', tool_use_id: use.id, content: outcome.error, is_error: true });
          continue;
        }
        const id = await stage({
          conversationId: ctx.conversationId,
          userId: ctx.user.id,
          toolId: tool.id,
          resolvedArgs: outcome.resolvedArgs,
          summary: outcome.summary,
        });
        pendingActions.push({ id, toolId: tool.id, summary: outcome.summary });
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: `Staged for approval (id ${id}): ${outcome.summary}. Do not tell the user it is done.`,
        });
      } else {
        try {
          const output = await tool.run(use.input, ctx);
          results.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(output) });
        } catch (error) {
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: error instanceof Error ? error.message : 'tool failed',
            is_error: true,
          });
        }
      }
    }
    messages.push({ role: 'user', content: results });
  }

  return { text: texts.join(' ').trim(), pendingActions, steps };
}

/** Default live caller. Maps SDK content blocks → our normalized AssistantMessage. */
export function createAnthropicCaller(): { caller: ModelCaller; model: string } {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AgentActionError('Missing ANTHROPIC_API_KEY for EKO.', 503);
  const model = process.env.EKO_ANTHROPIC_MODEL ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';
  const client = new Anthropic({ apiKey });

  const caller: ModelCaller = async ({ system, tools, messages }) => {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: tools as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: messages as any,
    });
    const content: AssistantBlock[] = [];
    for (const block of response.content) {
      if (block.type === 'text') content.push({ type: 'text', text: block.text });
      else if (block.type === 'tool_use') {
        content.push({
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
        });
      }
    }
    return { stop_reason: response.stop_reason ?? 'end_turn', content };
  };

  return { caller, model };
}
