/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD  (faithful to src/app/(dashboard)/team/page.tsx)
 *
 *    0ms   heading fades up
 *   80ms   stat line (members · online) fades up
 *  150ms   invite card (admin) fades up
 *  200ms   Members section rises in
 *          └─ member cards stagger across the grid (50ms apart)
 *  260ms   Contractors section rises in
 * ───────────────────────────────────────────────────────── */

import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import type { ReactNode } from 'react';
import { Globe, Clock, Users, ChevronLeft } from 'lucide-react';
import type { TeamRosterData, TeamRosterMember } from '@/lib/team-roster';
import { FadeRise, Stagger, StaggerItem } from '@/components/motion';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { LightShell } from '@/components/dashboard/LightShell';
import { InviteForm } from '@/components/dashboard/InviteForm';
import { DepartmentSelect } from '@/components/dashboard/DepartmentSelect';
import { ContractorToggle } from '@/components/dashboard/ContractorToggle';
import { LIGHT_DEPT_BADGE } from '@/components/dashboard/lightKit';
import { loadView, type ViewState } from '../load-view';
import { PaperState } from './_paper-state';

type TeamLoaderData = ViewState<TeamRosterData>;

const TIMING = {
  heading: 0,
  subtitle: 80,
  invite: 150,
  members: 200,
  contractors: 260,
};

const delay = (ms: number) => ms / 1000;

export async function teamLoader(_args: LoaderFunctionArgs): Promise<TeamLoaderData> {
  return loadView<TeamRosterData>('/api/team', 'Unable to load team');
}

export function TeamRoute() {
  const data = useLoaderData() as TeamLoaderData;
  return <TeamRouteContent data={data} />;
}

export function TeamRouteContent({ data }: { data: TeamLoaderData }) {
  if (data.status === 'unauthorized') {
    return <PaperState title="Sign in required" description="Use your SEEKO account to view the team roster." />;
  }

  if (data.status === 'forbidden') {
    return <PaperState title="Team unavailable" description="This roster is only available to the studio team." />;
  }

  if (data.status === 'not_found') {
    return <PaperState title="Profile not found" description="Your account does not have a team profile yet." />;
  }

  const roster = data.data;
  const { isAdmin, onlineCount } = roster;
  // The loader returns members/contractors already department-sorted server-side
  // (compareTeamRosterMembers), so we render them in order as-is.
  const { members, contractors } = roster;

  return (
    <LightShell
      fill
      bordered
      leftSlot={
        <Link
          to="/tasks"
          className="flex items-center gap-1 text-[13px] text-ink-faint transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          <span>Team</span>
        </Link>
      }
    >
      <main className="scroll-mask-y scrollbar-paper min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-6 py-10">
          <div className="flex flex-col gap-6">
            {/* Header */}
            <div className="flex flex-col gap-1">
              <FadeRise delay={delay(TIMING.heading)}>
                <h1 className="text-balance text-[22px] font-semibold tracking-tight text-ink-title">
                  Team
                </h1>
              </FadeRise>
              <FadeRise delay={delay(TIMING.subtitle)}>
                <div className="flex items-center gap-2 text-[13px] text-ink-muted">
                  <span className="tabular-nums">
                    {members.length} {members.length === 1 ? 'member' : 'members'}
                  </span>
                  {onlineCount > 0 && (
                    <>
                      <span className="text-[#d0d0d0]">·</span>
                      <span className="flex items-center gap-1.5 font-medium text-seeko-accent-ink">
                        <span className="size-1.5 rounded-full bg-seeko-accent" />
                        <span className="tabular-nums">{onlineCount} online</span>
                      </span>
                    </>
                  )}
                </div>
              </FadeRise>
            </div>

            {/* Invite form — admin only */}
            {isAdmin && (
              <FadeRise delay={delay(TIMING.invite)} y={12}>
                <InviteForm />
              </FadeRise>
            )}

            {/* Members */}
            <FadeRise delay={delay(TIMING.members)} y={12}>
              <section>
                <SectionLabel icon={Users} label="Members" count={members.length} />
                {members.length === 0 ? (
                  <LightEmpty
                    icon={Users}
                    title="No team members yet"
                    description="Invite people to get started."
                  />
                ) : (
                  <MemberGrid members={members} isAdmin={isAdmin} />
                )}
              </section>
            </FadeRise>

            {/* Contractors */}
            {(contractors.length > 0 || isAdmin) && (
              <FadeRise delay={delay(TIMING.contractors)} y={12}>
                <section>
                  <SectionLabel icon={Globe} label="Contractors" count={contractors.length} />
                  {contractors.length === 0 ? (
                    <LightEmpty
                      icon={Globe}
                      title="No contractors yet"
                      description={isAdmin
                        ? 'Use the "Make Contractor" action on any member to move them here.'
                        : 'No contractors have been added to the team.'}
                    />
                  ) : (
                    <MemberGrid members={contractors} isAdmin={isAdmin} />
                  )}
                </section>
              </FadeRise>
            )}
          </div>
        </div>
      </main>
    </LightShell>
  );
}

/* ─────────────────────────────────────────────────────────
 * Small pills — identity flags + department chip (rounded-full
 * to sit with the chrome's pill vocabulary, AA-on-white colors)
 * ───────────────────────────────────────────────────────── */

function IdentityPill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ${
        className ?? 'bg-wash-5 text-ink-muted'
      }`}
    >
      {children}
    </span>
  );
}

/** Admin-only NDA state. Admins are Exempt; others show signed (✓) or pending. */
function NdaPill({ member }: { member: TeamRosterMember }) {
  if (member.is_admin) return <IdentityPill>Exempt</IdentityPill>;
  if (member.nda_accepted_at)
    return <IdentityPill className="bg-seeko-accent-ink/10 text-seeko-accent-ink">NDA ✓</IdentityPill>;
  return <IdentityPill className="bg-dept-wash-animation/10 text-dept-ink-animation">NDA Pending</IdentityPill>;
}

function DeptChip({ dept }: { dept: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
        LIGHT_DEPT_BADGE[dept] ?? 'bg-wash-4 text-ink-muted'
      }`}
    >
      {dept}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────
 * SectionLabel — icon · label · hairline · count
 * ───────────────────────────────────────────────────────── */

function SectionLabel({
  icon: Icon,
  label,
  count,
}: {
  icon: typeof Users;
  label: string;
  count: number;
}) {
  return (
    <div className="mb-3 flex items-center gap-2 px-1">
      <Icon className="size-3.5 text-ink-faint" />
      <p className="text-[13px] font-medium text-ink-muted">{label}</p>
      <div className="h-px flex-1 bg-wash-6" />
      <span className="text-xs tabular-nums text-ink-faint">{count}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * LightEmpty — local light-surface empty block
 * ───────────────────────────────────────────────────────── */

function LightEmpty({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Users;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-wash-10 bg-white/40 px-6 py-9 text-center dark:bg-surface-1/40">
      <div className="flex size-9 items-center justify-center rounded-full bg-wash-4">
        <Icon className="size-4 text-ink-faint" />
      </div>
      <div className="space-y-0.5">
        <p className="text-[13.5px] font-medium text-ink-title">{title}</p>
        <p className="mx-auto max-w-xs text-[12.5px] text-ink-muted">{description}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * MemberCard — one person as a card (echoes the board's
 * shadow-seeko card vocabulary). Identity up top, a single
 * margin-separated footer for department + presence. Admin
 * controls (dept select, contractor toggle) live in the footer.
 * Non-interactive by design — no member detail route — so the
 * card carries no hover-lift (which would imply a click target).
 * ───────────────────────────────────────────────────────── */

function MemberCard({ member, isAdmin }: { member: TeamRosterMember; isAdmin: boolean }) {
  const online = isOnline(member.last_seen_at);
  const localTime = currentTimeInTz(member.timezone);
  const offset = tzAbbrev(member.timezone);
  const presence = lastSeenLabel(member.last_seen_at, member.must_set_password);

  return (
    <div className="flex flex-col rounded-xl bg-surface-1 p-3.5 shadow-seeko">
      {/* Identity */}
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <Avatar className="size-11 outline outline-1 -outline-offset-1 outline-wash-6">
            <AvatarImage src={member.avatar_url} alt={member.display_name ?? ''} />
            <AvatarFallback hash={member.id} className="text-sm">
              {getInitials(member.display_name ?? '?')}
            </AvatarFallback>
          </Avatar>
          <span
            className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-white ${
              online ? 'bg-seeko-accent' : 'bg-[#c8c8c8]'
            }`}
            title={presence}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[14.5px] font-semibold text-ink-title">
              {member.display_name ?? 'Unknown'}
            </p>
            {member.is_admin && <IdentityPill>Lead</IdentityPill>}
            {isAdmin && <NdaPill member={member} />}
          </div>

          {(member.role || member.timezone) && (
            <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-muted">
              {member.role && <span className="truncate">{member.role}</span>}
              {member.role && member.timezone && <span className="text-[#d0d0d0]">·</span>}
              {member.timezone && (
                <span className="flex shrink-0 items-center gap-1 tabular-nums">
                  <Clock className="size-3" />
                  {localTime}
                  <span className="hidden text-ink-faintest sm:inline">{offset}</span>
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Footer — department (or admin controls) · presence.
          Margin-separated, no divider — matches the board's TaskCard footer. */}
      <div className="mt-3.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {isAdmin ? (
            <DepartmentSelect light userId={member.id} department={member.department} />
          ) : member.department ? (
            <DeptChip dept={member.department} />
          ) : null}
          {isAdmin && (
            <ContractorToggle light userId={member.id} isContractor={member.is_contractor ?? false} />
          )}
        </div>
        <span
          className={`shrink-0 text-[11px] tabular-nums ${
            online ? 'font-medium text-seeko-accent-ink' : 'text-ink-faint'
          }`}
        >
          {online ? 'Online' : presence}
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * MemberGrid — responsive 2-up card grid, staggered entrance
 * ───────────────────────────────────────────────────────── */

function MemberGrid({ members, isAdmin }: { members: TeamRosterMember[]; isAdmin: boolean }) {
  return (
    <Stagger className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2" staggerMs={0.05}>
      {members.map((member) => (
        <StaggerItem key={member.id}>
          <MemberCard member={member} isAdmin={isAdmin} />
        </StaggerItem>
      ))}
    </Stagger>
  );
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
}

function isOnline(lastSeen?: string): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 2 * 60 * 1000;
}

function lastSeenLabel(lastSeen?: string, mustSetPassword?: boolean): string {
  if (!lastSeen) return mustSetPassword === true ? 'Invited' : 'Never seen';
  const diff = Date.now() - new Date(lastSeen).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'Online now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function currentTimeInTz(tz?: string): string {
  if (!tz) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date());
  } catch {
    return '';
  }
}

function tzAbbrev(tz?: string): string {
  if (!tz) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date());
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}
