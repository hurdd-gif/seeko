import { attributedOnly } from '@/lib/activity-log';
import { getServiceClient } from '@/lib/supabase/service';
import { getInitials } from '@/lib/utils';
import { AccessError } from '@/lib/access-error';
import { isDocLocked } from '@/lib/docs-index';
import type { TasksBoardAccount } from '@/lib/tasks-board';
import type { Area, Doc, Milestone, Profile, Task, TaskActivity } from '@/lib/types';

/**
 * Rich payloads for the full-bleed Paper dashboard pages (Docs / Activity /
 * Progress). Each mirrors the data its legacy Next.js server component composed
 * so the React Router route can render the SAME original component (DocList /
 * ActivitySection / StudioProgressRing) inside the SAME <LightShell> chrome.
 *
 * The `account` cluster matches Issues/Tasks exactly. As with the board, the
 * loader carries `account.userId` so the header mounts the live realtime
 * NotificationBell (it opens a Supabase channel at mount) over the static glyph.
 */

const ACCOUNT_PROFILE_SELECT =
  'id, display_name, department, avatar_url, is_admin, is_investor' as const;
const TEAM_SELECT =
  'id, display_name, department, role, avatar_url, is_admin, is_contractor, is_investor, onboarded, tour_completed, last_seen_at, timezone, created_at' as const;
// Payments recipient roster — mirrors fetchTeamWithPaypalEmails (adds paypal_email,
// and — unlike the discreet team roster — does NOT drop investors).
const PAYMENTS_TEAM_SELECT =
  'id, display_name, department, role, avatar_url, is_admin, is_contractor, is_investor, onboarded, tour_completed, paypal_email, created_at' as const;
// Investor-viewer roster — the same roster WITHOUT paypal_email (payout PII).
// Investors read the roster only to label recipients, never to see anyone's
// payout contact, so the column is dropped for the less-trusted role.
const PAYMENTS_TEAM_SELECT_INVESTOR =
  'id, display_name, department, role, avatar_url, is_admin, is_contractor, is_investor, onboarded, tour_completed, created_at' as const;
const AREA_SELECT =
  'id, name, status, progress, description, phase, created_at, sort_order, target_date' as const;
const MILESTONE_SELECT =
  'id, name, target_date, area_id, sort_order, health, created_at' as const;
const NOTIFICATION_SELECT =
  'id, user_id, kind, title, body, link, read, created_at' as const;
const DOC_SELECT =
  'id, title, content, parent_id, sort_order, restricted_department, granted_user_ids, type, slides, deck_orientation, created_at, updated_at' as const;
const ACTIVITY_SELECT = '*, profiles(display_name, avatar_url)' as const;

export type DocsViewData = {
  account: TasksBoardAccount;
  docs: Doc[];
  team: Profile[];
  userDepartment: string | null;
  isAdmin: boolean;
  currentUserId: string;
};

export type ActivityViewData = {
  account: TasksBoardAccount;
  activity: TaskActivity[];
  /** Roster for resolving assignee UUIDs in feed copy (investors included —
   *  they can be assignees historically; this is not the /team page list). */
  team: Profile[];
  /** Daily event counts (UTC-bucketed, `YYYY-MM-DD`) covering HEATMAP_DAYS
   *  back from today — drives the contribution heatmap. Zero-count days are
   *  omitted; the chart fills the grid. */
  heatmap: { date: string; count: number }[];
};

/** Heatmap window: 26 weeks ≈ 6 months. The studio's activity_log only goes
 *  back to March 2026, so a GitHub-style full year would render mostly dead
 *  cells; revisit once there's a year of history. */
export const HEATMAP_DAYS = 26 * 7;

export type ProgressViewData = {
  account: TasksBoardAccount;
  areas: Area[];
  milestones: Milestone[];
  isAdmin: boolean;
};

export type SettingsViewData = {
  profile: Profile;
  isAdmin: boolean;
  team: Profile[];
  completedTasks: Pick<Task, 'id' | 'name' | 'bounty'>[];
};

/** Chrome-only payload: /notifications renders a self-contained preferences
 *  panel, so the page needs nothing beyond the signed-in account cluster. */
export type NotificationsViewData = {
  account: TasksBoardAccount;
};

export type PaymentsViewData = {
  team: (Profile & { paypal_email?: string })[];
  isAdmin: boolean;
  isInvestor: boolean;
};

type ShellContext = {
  account: TasksBoardAccount;
  team: Profile[];
  areas: Area[];
  isAdmin: boolean;
  department: string | null;
};

/**
 * Shared chrome loader — profile + team + areas + notifications, assembled into
 * the global account cluster every Paper page's <LightShell> renders.
 */
async function loadShellContext(currentUser: {
  id: string;
  email?: string | null;
}): Promise<ShellContext> {
  const service = getServiceClient();

  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select(ACCOUNT_PROFILE_SELECT)
    .eq('id', currentUser.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) throw new AccessError('profile_not_found');
  if (profile.is_investor && !profile.is_admin) {
    throw new AccessError('forbidden', 'investor_forbidden');
  }

  const isAdmin = Boolean(profile.is_admin);

  const [teamResult, areasResult, notificationsResult, unreadResult] = await Promise.all([
    service.from('profiles').select(TEAM_SELECT).order('display_name', { ascending: true }),
    service
      .from('areas')
      .select(AREA_SELECT)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    service
      .from('notifications')
      .select(NOTIFICATION_SELECT)
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(20),
    service
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', currentUser.id)
      .eq('read', false),
  ]);

  // Investors are not shown on the roster (discreet), matching fetchTeam().
  const team = ((teamResult.data ?? []) as unknown as Profile[]).filter((p) => !p.is_investor);
  const areas = (areasResult.data ?? []) as unknown as Area[];
  const notifications = (notificationsResult.data ?? []) as unknown as TasksBoardAccount['notifications'];
  const unreadCount = unreadResult.count ?? 0;

  const account: TasksBoardAccount = {
    email: currentUser.email ?? '',
    initials: getInitials(profile.display_name ?? currentUser.email ?? 'U'),
    displayName: profile.display_name ?? undefined,
    avatarUrl: profile.avatar_url ?? undefined,
    // userId drives the live realtime NotificationBell (vs. the static Inbox
    // glyph) every Paper page's <LightShell> header renders.
    userId: currentUser.id,
    isAdmin,
    unreadCount,
    notifications,
    team: team.map((m) => ({ id: m.id, display_name: m.display_name })),
    areas: areas.map((a) => ({ id: a.id, name: a.name })),
  };

  return { account, team, areas, isAdmin, department: profile.department ?? null };
}

export async function loadDocsView(currentUser: {
  id: string;
  email?: string | null;
}): Promise<DocsViewData> {
  const { account, team, isAdmin, department } = await loadShellContext(currentUser);
  const service = getServiceClient();

  const { data, error } = await service
    .from('docs')
    .select(DOC_SELECT)
    .order('sort_order', { ascending: true });
  if (error) throw error;

  // Confidentiality allowlist — the staff/contractor twin of loadInvestorDocs.
  // This loader admits every non-investor (contractors, staff outside the doc's
  // restricted_department), and the shared <DocList> only *hides* a locked doc's
  // body in the UI, so anything shipped here is readable straight off the network
  // response. Rebuild each row from an explicit field allowlist rather than
  // spreading the raw doc, so a column later added to DOC_SELECT can't silently
  // reach an unauthorized reader.
  //   - content / slides: the confidential body — blanked for any doc locked FOR
  //     THIS caller (grants/department/admin still win via isDocLocked).
  //   - granted_user_ids: the doc's access-control list. Admins keep the FULL list
  //     — only they open the grant editor (<DocList> gates every edit affordance on
  //     isAdmin, and DocEditor/DeckEditor seed their grant state from this row), and
  //     they are already fully trusted. For every other caller it is reduced to
  //     minimal disclosure — the caller's own id iff they are on it, else empty —
  //     which keeps <DocList>'s client isLocked() exact (it only asks "am I
  //     granted?") while never revealing which OTHER people can see a restricted doc.
  const rawDocs = (data ?? []) as unknown as Doc[];
  const docs: Doc[] = rawDocs.map((doc) => {
    const grantedIds = doc.granted_user_ids ?? [];
    const locked = isDocLocked({
      restrictedDepartments: doc.restricted_department ?? [],
      grantedUserIds: grantedIds,
      currentUserId: currentUser.id,
      userDepartment: department,
      isAdmin,
    });
    return {
      id: doc.id,
      title: doc.title,
      parent_id: doc.parent_id,
      sort_order: doc.sort_order,
      type: doc.type,
      deck_orientation: doc.deck_orientation,
      restricted_department: doc.restricted_department,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      content: locked ? '' : doc.content,
      slides: locked ? [] : doc.slides,
      granted_user_ids: isAdmin
        ? grantedIds
        : grantedIds.includes(currentUser.id)
          ? [currentUser.id]
          : [],
    };
  });

  return {
    account,
    docs,
    team,
    userDepartment: department,
    isAdmin,
    currentUserId: currentUser.id,
  };
}

export async function loadActivityView(currentUser: {
  id: string;
  email?: string | null;
}): Promise<ActivityViewData> {
  const { account } = await loadShellContext(currentUser);
  const service = getServiceClient();

  const heatmapStart = new Date(Date.now() - HEATMAP_DAYS * 24 * 60 * 60 * 1000);

  const [feedRes, heatmapRes, teamRes] = await Promise.all([
    attributedOnly(service.from('activity_log').select(ACTIVITY_SELECT))
      .order('created_at', { ascending: false })
      .limit(50),
    // Timestamps only — bucketed into daily counts below (supabase-js has no
    // GROUP BY; the window is small enough to aggregate here).
    service
      .from('activity_log')
      .select('created_at')
      .gte('created_at', heatmapStart.toISOString())
      .limit(10000),
    service.from('profiles').select(TEAM_SELECT).order('display_name'),
  ]);
  if (feedRes.error) throw feedRes.error;
  if (heatmapRes.error) throw heatmapRes.error;
  if (teamRes.error) throw teamRes.error;

  const counts = new Map<string, number>();
  for (const row of heatmapRes.data ?? []) {
    const day = (row.created_at as string).slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  return {
    account,
    activity: (feedRes.data ?? []) as unknown as TaskActivity[],
    team: (teamRes.data ?? []) as unknown as Profile[],
    heatmap: [...counts.entries()].map(([date, count]) => ({ date, count })),
  };
}

export async function loadNotificationsView(currentUser: {
  id: string;
  email?: string | null;
}): Promise<NotificationsViewData> {
  const { account } = await loadShellContext(currentUser);
  return { account };
}

export async function loadProgressView(currentUser: {
  id: string;
  email?: string | null;
}): Promise<ProgressViewData> {
  const { account, areas, isAdmin } = await loadShellContext(currentUser);
  const service = getServiceClient();

  // milestones isn't in the generated Database types yet — same cast as data.ts.
  const { data, error } = await (service as any)
    .from('milestones')
    .select(MILESTONE_SELECT)
    .order('sort_order', { ascending: true });
  if (error) throw error;

  return {
    account,
    areas,
    milestones: (data ?? []) as unknown as Milestone[],
    isAdmin,
  };
}

/**
 * Settings is a full-bleed Paper page: the original <SettingsPanel> owns its own
 * <LightShell> (back-link → /tasks), so it needs no account cluster — just the
 * data the legacy `(dashboard)/settings/page.tsx` server component composed:
 * the full profile, the team roster (admin-only, investors filtered, exactly
 * like fetchTeam), and the signer's completed tasks for the payment-request
 * dialog. Supabase-js returns errors in-band, so a failed completed-tasks query
 * degrades to an empty list rather than throwing — matching the original.
 */
export async function loadSettingsView(currentUser: {
  id: string;
  email?: string | null;
}): Promise<SettingsViewData> {
  const service = getServiceClient();

  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) throw new AccessError('profile_not_found');
  if (profile.is_investor && !profile.is_admin) {
    throw new AccessError('forbidden', 'investor_forbidden');
  }

  const isAdmin = Boolean(profile.is_admin);

  // Roster is admin-only (matching the original `isAdmin ? fetchTeam() : []`).
  const teamResult = isAdmin
    ? await service.from('profiles').select(TEAM_SELECT).order('display_name', { ascending: true })
    : { data: [] as unknown[] };

  const { data: tasksData } = await service
    .from('tasks')
    .select('id, name, bounty')
    .eq('assignee_id', currentUser.id)
    .eq('status', 'Complete')
    .order('updated_at', { ascending: false });

  // Investors are never shown on the roster (discreet), matching fetchTeam().
  const team = ((teamResult.data ?? []) as unknown as Profile[]).filter((p) => !p.is_investor);
  const completedTasks = (tasksData ?? []) as unknown as Pick<Task, 'id' | 'name' | 'bounty'>[];

  return {
    profile: profile as unknown as Profile,
    isAdmin,
    team,
    completedTasks,
  };
}

/**
 * Payments is shared between admins and investors. Admins get the original
 * full control surface; investors get the same Paper payments screen in viewer
 * mode, backed by the investor-safe payments API branches.
 */
export async function loadPaymentsView(currentUser: {
  id: string;
  email?: string | null;
}): Promise<PaymentsViewData> {
  const service = getServiceClient();

  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select('id, is_admin, is_investor')
    .eq('id', currentUser.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) throw new AccessError('profile_not_found');
  if (!profile.is_admin && !profile.is_investor) throw new AccessError('forbidden', 'not_admin');

  const isAdmin = Boolean(profile.is_admin);

  // Investors (non-admin) get the paypal_email-free roster; admins keep the full
  // roster with payout contacts. Role comes from the caller's own profile row
  // this loader already fetched — no signature change needed.
  const { data, error } = await service
    .from('profiles')
    .select(isAdmin ? PAYMENTS_TEAM_SELECT : PAYMENTS_TEAM_SELECT_INVESTOR)
    .order('display_name', { ascending: true });
  if (error) throw error;

  return {
    team: (data ?? []) as unknown as (Profile & { paypal_email?: string })[],
    isAdmin,
    isInvestor: Boolean(profile.is_investor),
  };
}
