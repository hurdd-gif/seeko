export type EkoPendingAction = { id: string; toolId: string; summary: string };

export type EkoWriteTarget = {
  kind: 'task';
  taskId: string;
  taskNumber?: number | null;
  name: string;
  action: string;
};

export type EkoExecutedAction = {
  pendingActionId: string;
  ok: boolean;
  reply: string;
  target?: EkoWriteTarget;
};

export type EkoChatResponse = {
  reply: string;
  provider?: string;
  model?: string;
  pendingActions?: EkoPendingAction[];
  executed?: EkoExecutedAction[];
};

/** Stable per-tray-session id used to key staged pending actions server-side. */
export function newConversationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `eko-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

export function firstPendingAction(response: EkoChatResponse): EkoPendingAction | null {
  return response.pendingActions?.[0] ?? null;
}

export function executedTarget(response: EkoChatResponse): EkoWriteTarget | null {
  return response.executed?.find((action) => action.ok && action.target)?.target ?? null;
}
