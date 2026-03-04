import { fetchTeam } from '@/lib/supabase/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Plus } from 'lucide-react';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default async function TeamPage() {
  const team = await fetchTeam().catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Team</h1>
        <p className="text-sm text-muted-foreground mt-1">Invite your team members to collaborate.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invite Member</CardTitle>
          <CardDescription>Add a new team member by email address.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input id="invite-email" placeholder="colleague@example.com" type="email" />
            </div>
            <div className="w-full space-y-2 sm:w-40">
              <Label>Department</Label>
              <Select defaultValue="">
                <option value="">Select...</option>
                <option value="Coding">Coding</option>
                <option value="Visual Art">Visual Art</option>
                <option value="UI/UX">UI/UX</option>
                <option value="Animation">Animation</option>
                <option value="Asset Creation">Asset Creation</option>
              </Select>
            </div>
            <Button className="gap-2">
              <Plus className="size-4" />
              Invite
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>{team.length} people with access to this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          {team.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No team members yet. Invite them via Supabase Auth.
            </p>
          ) : (
            <div className="flex flex-col">
              {team.map((member, i) => (
                <div key={member.id}>
                  <div className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-9">
                        <AvatarImage src={member.avatar_url} alt={member.display_name ?? ''} />
                        <AvatarFallback className="bg-secondary text-foreground text-xs">
                          {getInitials(member.display_name ?? '?')}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium text-foreground">{member.display_name ?? 'Unknown'}</p>
                        {member.role && <p className="text-xs text-muted-foreground">{member.role}</p>}
                      </div>
                    </div>
                    {member.department && (
                      <Badge variant="secondary" className="shrink-0">{member.department}</Badge>
                    )}
                  </div>
                  {i < team.length - 1 && <Separator />}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
