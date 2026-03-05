/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 *    0ms   heading fades up
 *   80ms   subtitle fades up
 *  150ms   invite form (admin) fades up
 *  200ms   members card rises in
 *  260ms   member rows stagger in (60ms apart)
 *  320ms   contractors card rises in, rows stagger
 * ───────────────────────────────────────────────────────── */

import { fetchTeam } from '@/lib/supabase/data';
import { createClient } from '@/lib/supabase/server';
import { Profile } from '@/lib/types';
import { FadeRise, Stagger, StaggerItem } from '@/components/motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { EmptyState } from '@/components/ui/empty-state';
import { Globe, Clock, Users } from 'lucide-react';
import { InviteForm } from '@/components/dashboard/InviteForm';
import { DepartmentSelect } from '@/components/dashboard/DepartmentSelect';

const TIMING = {
  heading:    0,   // page title
  subtitle:  80,   // description line
  invite:   150,   // invite form (admin)
  members:  200,   // members card rises
  membersStagger: 260, // member rows stagger
  contractors: 320,   // contractors card, rows stagger
};

/** FadeRise/Stagger delay in seconds */
const delay = (ms: number) => ms / 1000;

/** Department text color — match DepartmentSelect / TaskList so admins and non-admins see same colors */
const DEPT_COLOR: Record<string, string> = {
  'Coding':         'text-emerald-400',
  'Visual Art':     'text-blue-300',
  'UI/UX':          'text-violet-300',
  'Animation':      'text-amber-400',
  'Asset Creation': 'text-pink-300',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
}

function isOnline(lastSeen?: string): boolean {
  if (!lastSeen) return false;
  const diff = Date.now() - new Date(lastSeen).getTime();
  return diff < 2 * 60 * 1000;
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

function MemberRow({ member, isAdmin }: { member: Profile; isAdmin: boolean }) {
  const online = isOnline(member.last_seen_at);
  const localTime = currentTimeInTz(member.timezone);
  const offset = tzAbbrev(member.timezone);

  return (
    <div className="flex items-center gap-3 py-3">
      {/* Avatar */}
      <div className="relative shrink-0">
        <Avatar className="size-9">
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
          {/* Status — mobile only */}
          <span className={`md:hidden ml-auto text-[11px] shrink-0 ${online ? 'text-seeko-accent' : 'text-muted-foreground/60'}`}>
            {lastSeenLabel(member.last_seen_at, member.must_set_password)}
          </span>
        </div>

        {member.email && (
          <p className="text-xs text-muted-foreground/70 hidden sm:block">{member.email}</p>
        )}

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
            <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
              {member.role && <span className="text-muted-foreground/30">·</span>}
              <Clock className="size-2.5" />
              <span>{localTime}</span>
              <span className="text-muted-foreground/50">{offset}</span>
            </div>
          )}
        </div>

        {/* Dept select — mobile only */}
        {isAdmin && (
          <div className="mt-2 md:hidden">
            <DepartmentSelect userId={member.id} department={member.department} />
          </div>
        )}
      </div>

      {/* Right column — desktop only */}
      <div className="hidden md:flex items-center gap-2 shrink-0">
        {isAdmin
          ? <DepartmentSelect userId={member.id} department={member.department} />
          : member.department && (
              <Badge variant="secondary" className={`text-xs ${DEPT_COLOR[member.department] ?? 'text-muted-foreground'}`}>
                {member.department}
              </Badge>
            )
        }
        <span className={`text-[11px] ${online ? 'text-seeko-accent' : 'text-muted-foreground/60'}`}>
          {lastSeenLabel(member.last_seen_at, member.must_set_password)}
        </span>
      </div>
    </div>
  );
}

export default async function TeamPage() {
  const team = await fetchTeam().catch((e) => { throw new Error('Failed to load team.'); });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const currentProfile = team.find(m => m.id === user?.id);
  const isAdmin = currentProfile?.is_admin ?? false;

  const members = team.filter(m => !m.is_contractor);
  const contractors = team.filter(m => m.is_contractor);

  const onlineCount = team.filter(m => isOnline(m.last_seen_at)).length;

  return (
    <div className="space-y-6">
      <div>
        <FadeRise delay={delay(TIMING.heading)}>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Team</h1>
        </FadeRise>
        <FadeRise delay={delay(TIMING.subtitle)}>
          <p className="text-sm text-muted-foreground mt-1">
            {team.length} people · {onlineCount} online now
          </p>
        </FadeRise>
      </div>

      {isAdmin && (
        <FadeRise delay={delay(TIMING.invite)} y={12}>
          <InviteForm />
        </FadeRise>
      )}

      <FadeRise delay={delay(TIMING.members)} y={12}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-semibold text-foreground">Members</CardTitle>
                <CardDescription>{members.length} team members</CardDescription>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full bg-seeko-accent" />
                <span>{onlineCount} online</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <EmptyState
                icon="Users"
                title="No team members yet"
                description="Invite people to get started."
              />
            ) : (
              <Stagger className="flex flex-col" staggerMs={0.06} delayMs={delay(TIMING.membersStagger)}>
                {members.map((member, i) => (
                  <StaggerItem key={member.id}>
                    <MemberRow member={member} isAdmin={isAdmin} />
                    {i < members.length - 1 && <Separator />}
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </CardContent>
        </Card>
      </FadeRise>

      <FadeRise delay={delay(TIMING.contractors)} y={12}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="size-4 text-muted-foreground" />
              <div>
                <CardTitle className="text-xl font-semibold text-foreground">Contractors</CardTitle>
                <CardDescription>
                  {contractors.length === 0
                    ? 'No contractors added yet.'
                    : `${contractors.length} contractor${contractors.length !== 1 ? 's' : ''}`}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {contractors.length === 0 ? (
              <EmptyState
                icon="Globe"
                title="No contractors yet"
                description="Mark team members as contractors in the database to show them here."
              />
            ) : (
              <Stagger className="flex flex-col" staggerMs={0.06} delayMs={delay(TIMING.contractors + 60)}>
                {contractors.map((member, i) => (
                  <StaggerItem key={member.id}>
                    <MemberRow member={member} isAdmin={isAdmin} />
                    {i < contractors.length - 1 && <Separator />}
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </CardContent>
        </Card>
      </FadeRise>
    </div>
  );
}
