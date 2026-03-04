import { fetchAreas } from '@/lib/supabase/data';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default async function AreasPage() {
  const areas = await fetchAreas().catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Game Areas</h1>
        <p className="text-sm text-muted-foreground mt-1">Dojo · Battleground · Fighting Club</p>
      </div>

      {areas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No game areas found. Add them in the Supabase Table Editor.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {areas.map(area => (
            <Card key={area.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base font-semibold text-foreground">
                    {area.name}
                  </CardTitle>
                  {area.phase && (
                    <Badge variant="outline" className="shrink-0">{area.phase}</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {area.description && (
                  <p className="text-sm text-muted-foreground mb-4">{area.description}</p>
                )}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-muted-foreground">Progress</span>
                    <span className="text-xs font-mono text-muted-foreground">{area.progress}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${area.progress}%`, backgroundColor: 'var(--color-seeko-accent)' }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
