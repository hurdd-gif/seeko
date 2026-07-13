import { isAdminUser } from '../auth-utils';
import { AgentActionError } from './errors';

/**
 * Admin gate for the EKO write-approval path. This is the hard stop between
 * a staged pending action and a committed write (see executeById in
 * routes/agent.ts) — it MUST throw for any non-admin. profiles.is_admin
 * itself is read by the single shared isAdminUser query in auth-utils.ts.
 */
export async function assertAdmin(userId: string): Promise<void> {
  let admin: boolean;
  try {
    admin = await isAdminUser(userId);
  } catch {
    throw new AgentActionError('EKO could not verify your permissions.', 500);
  }
  if (!admin) throw new AgentActionError('Only admins can approve EKO writes.', 403);
}

/** Normalize a due-date token to an ISO date or null (verbatim from agent.ts). */
export function normalizeDueDate(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (/tomorrow/i.test(value)) date.setDate(date.getDate() + 1);
  if (/next week/i.test(value)) date.setDate(date.getDate() + 7);
  if (/no date/i.test(value)) return null;
  return date.toISOString().slice(0, 10);
}
