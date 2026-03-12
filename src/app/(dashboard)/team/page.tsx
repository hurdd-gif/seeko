/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 *    0ms   heading fades up
 *   80ms   subtitle + online cluster fades up
 *  150ms   invite button (admin) fades up
 *  200ms   team card rises in
 *  260ms   department sections stagger in (60ms apart)
 * ───────────────────────────────────────────────────────── */

import { fetchTeam } from '@/lib/supabase/data';
import { createClient } from '@/lib/supabase/server';
import { Profile } from '@/lib/types';
import { FadeRise, Stagger, StaggerItem, InteractiveRow } from '@/components/motion';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Globe, Clock } from 'lucide-react';
import { InviteForm } from '@/components/dashboard/InviteForm';
import { DepartmentSelect } from '@/components/dashboard/DepartmentSelect';
import { ContractorToggle } from '@/components/dashboard/ContractorToggle';

const TIMING = {
  heading:    0,
  subtitle:  80,
  invite:   150,
  card:     200,
  rows:     260,
};

const delay = (ms: number) => ms / 1000;

const DEPT_COLOR: Record<string, string> = {
  'Coding':         'text-emerald-400',
  'Visual Art':     'text-blue-300',
  'UI/UX':          'text-violet-300',
  'Animation':      'text-amber-400',
  'Asset Creation': 'text-pink-300',
};

function getInitials(name: string): string {
  return name.split(' ').map(part => part[0]).join('').toUpperCase().slice(0, 2) || '?';
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
    return parts.find(p => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/* ─────────────────────────────────────────────────────────
 * MemberRow — single team member
 * ───────────────────────────────────────────────────────── */

function NdaBadge({ member }: { member: Profile }) {
  if (member.is_admin) {
    return (
      <Badge variant="outline" className="text-[10px] py-0 px-1.5 shrink-0 border-muted-foreground/40 text-muted-foreground">
        Exempt
      </Badge>
    );
  }
  if (member.nda_accepted_at) {
    return (
      <Badge variant="outline" className="text-[10px] py-0 px-1.5 shrink-0 border-emerald-500/50 text-emerald-400">
        NDA ✓
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] py-0 px-1.5 shrink-0 border-amber-500/50 text-amber-400">
      NDA Pending
    </Badge>
  );
}

function MemberRow({ member, isAdmin }: { member: Profile; isAdmin: boolean }) {
  const online = isOnline(member.last_seen_at);
  const localTime = currentTimeInTz(member.timezone);
  const offset = tzAbbrev(member.timezone);

  return (
    <InteractiveRow className="flex items-center gap-3 rounded-lg px-3 py-2.5 -mx-3 transition-colors">
      {/* Avatar */}
      <div className="relative shrink-0">
        <Avatar className="size-10">
          <AvatarImage src={member.avatar_url} alt={member.display_name ?? ''} />
          <AvatarFallback className="bg-secondary text-foreground text-xs">
            {getInitials(member.display_name ?? '?')}
          </AvatarFallback>
        </Avatar>
        <span
          className={`absolute bottom-0 right-0 size-2.5 rounded-full ring-2 ring-card ${online ? 'bg-seeko-accent' : 'bg-muted-foreground/40'}`}
          title={lastSeenLabel(member.last_seen_at, member.must_set_password)}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground truncate">{member.display_name ?? 'Unknown'}</p>
          {member.is_admin && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 shrink-0">Lead</Badge>
          )}
          {isAdmin && <NdaBadge member={member} />}
          {/* Status — mobile only */}
          <span className={`md:hidden ml-auto text-[11px] shrink-0 ${online ? 'text-seeko-accent' : 'text-muted-foreground/60'}`}>
            {lastSeenLabel(member.last_seen_at, member.must_set_password)}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {member.role && (
            <p className="text-xs text-muted-foreground">{member.role}</p>
          )}
          {!isAdmin && member.department && (
            <span className={`md:hidden text-xs font-medium ${DEPT_COLOR[member.department] ?? 'text-muted-foreground'}`}>
              {member.role && '· '}{member.department}
            </span>
          )}
          {member.timezone && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {member.role && <span className="text-muted-foreground/30">·</span>}
              <Clock className="size-2.5" />
              <span>{localTime}</span>
              <span className="text-muted-foreground/50 hidden sm:inline">{offset}</span>
            </div>
          )}
        </div>

        {/* Dept select + contractor toggle — mobile only */}
        {isAdmin && (
          <div className="mt-2 md:hidden flex items-center gap-3">
            <DepartmentSelect userId={member.id} department={member.department} />
            <ContractorToggle userId={member.id} isContractor={member.is_contractor ?? false} />
          </div>
        )}
      </div>

      {/* Right column — desktop only */}
      <div className="hidden md:flex items-center gap-2 shrink-0">
        {isAdmin && (
          <ContractorToggle userId={member.id} isContractor={member.is_contractor ?? false} />
        )}
        {isAdmin
          ? <DepartmentSelect userId={member.id} department={member.department} />
          : member.department && (
              <Badge variant="secondary" className={`text-xs ${DEPT_COLOR[member.department] ?? 'text-muted-foreground'}`}>
                {member.department}
              </Badge>
            )
        }
        <span className={`text-[11px] w-16 text-right ${online ? 'text-seeko-accent' : 'text-muted-foreground/60'}`}>
          {lastSeenLabel(member.last_seen_at, member.must_set_password)}
        </span>
      </div>
    </InteractiveRow>
  );
}

/* ─────────────────────────────────────────────────────────
 * Online cluster — compact avatar row of active users
 * ───────────────────────────────────────────────────────── */

function OnlineCluster({ members }: { members: Profile[] }) {
  const online = members.filter(m => isOnline(m.last_seen_at));
  if (online.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center -space-x-2">
        {online.slice(0, 6).map(m => (
          <Avatar key={m.id} className="size-7 ring-2 ring-background">
            <AvatarImage src={m.avatar_url} alt={m.display_name ?? ''} />
            <AvatarFallback className="bg-secondary text-foreground text-[9px]">
              {getInitials(m.display_name ?? '?')}
            </AvatarFallback>
          </Avatar>
        ))}
        {online.length > 6 && (
          <div className="size-7 rounded-full bg-muted ring-2 ring-background flex items-center justify-center text-[10px] font-medium text-muted-foreground">
            +{online.length - 6}
          </div>
        )}
      </div>
      <span className="text-xs text-seeko-accent font-medium">{online.length} online</span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * Department section — group header + member rows
 * ───────────────────────────────────────────────────────── */

function DepartmentSection({
  label,
  members,
  isAdmin,
  colorClass,
}: {
  label: string;
  members: Profile[];
  isAdmin: boolean;
  colorClass?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1 px-3">
        <p className={`text-xs font-semibold uppercase tracking-widest ${colorClass ?? 'text-muted-foreground/60'}`}>
          {label}
        </p>
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs tabular-nums text-muted-foreground/60">{members.length}</span>
      </div>
      <Stagger className="flex flex-col" staggerMs={0.04}>
        {members.map(member => (
          <StaggerItem key={member.id}>
            <MemberRow member={member} isAdmin={isAdmin} />
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * TeamPage
 * ───────────────────────────────────────────────────────── */

export default async function TeamPage() {
  const team = await fetchTeam().catch(() => { throw new Error('Failed to load team.'); });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const currentProfile = team.find(m => m.id === user?.id);
  const isAdmin = currentProfile?.is_admin ?? false;

  const members = team.filter(m => !m.is_contractor);
  const contractors = team.filter(m => m.is_contractor);

  // Group members by department
  const deptGroups = new Map<string, Profile[]>();
  for (const m of members) {
    const dept = m.department ?? 'Unassigned';
    if (!deptGroups.has(dept)) deptGroups.set(dept, []);
    deptGroups.get(dept)!.push(m);
  }
  // Sort: departments with color first (alphabetical), Unassigned last
  const sortedDeptGroups = Array.from(deptGroups.entries()).sort(([a], [b]) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <FadeRise delay={delay(TIMING.heading)}>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground text-balance">Team</h1>
          </FadeRise>
          <FadeRise delay={delay(TIMING.subtitle)}>
            <p className="text-sm text-muted-foreground mt-1">
              {team.length} people
            </p>
          </FadeRise>
        </div>
        <FadeRise delay={delay(TIMING.subtitle)}>
          <OnlineCluster members={team} />
        </FadeRise>
      </div>

      {/* Invite form — admin only */}
      {isAdmin && (
        <FadeRise delay={delay(TIMING.invite)} y={12}>
          <InviteForm />
        </FadeRise>
      )}

      {/* Main team card */}
      <FadeRise delay={delay(TIMING.card)} y={12}>
        <Card>
          <CardContent className="pt-5 pb-4">
            {members.length === 0 ? (
              <EmptyState
                icon="Users"
                title="No team members yet"
                description="Invite people to get started."
              />
            ) : (
              <div className="flex flex-col gap-5">
                {sortedDeptGroups.map(([dept, deptMembers]) => (
                  <DepartmentSection
                    key={dept}
                    label={dept}
                    members={deptMembers}
                    isAdmin={isAdmin}
                    colorClass={dept !== 'Unassigned' ? DEPT_COLOR[dept]?.replace('text-', 'text-') : undefined}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </FadeRise>

      {/* Contractors section */}
      {(contractors.length > 0 || isAdmin) && (
        <FadeRise delay={delay(TIMING.rows)} y={12}>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1 px-3">
                <Globe className="size-3.5 text-muted-foreground/60" />
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
                  Contractors
                </p>
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs tabular-nums text-muted-foreground/60">{contractors.length}</span>
              </div>
              {contractors.length === 0 ? (
                <EmptyState
                  icon="Globe"
                  title="No contractors yet"
                  description={isAdmin
                    ? 'Use the "Make Contractor" toggle on any member above to move them here.'
                    : 'No contractors have been added to the team.'}
                />
              ) : (
                <Stagger className="flex flex-col" staggerMs={0.04}>
                  {contractors.map(member => (
                    <StaggerItem key={member.id}>
                      <MemberRow member={member} isAdmin={isAdmin} />
                    </StaggerItem>
                  ))}
                </Stagger>
              )}
            </CardContent>
          </Card>
        </FadeRise>
      )}
    </div>
  );
}
