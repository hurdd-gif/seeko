import { fetchTeam } from '@/lib/notion';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

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
        <p className="text-sm text-muted-foreground mt-1">{team.length} members</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {team.length === 0 ? (
            <p className="text-sm text-muted-foreground px-6 pb-6">
              No team members found. Add them to the Notion Team database.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {team.map(member => (
                <div key={member.id} className="flex items-center gap-3 px-6 py-3 hover:bg-muted/50 transition-colors">
                  <Avatar>
                    <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{member.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{member.role}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">{member.department}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
