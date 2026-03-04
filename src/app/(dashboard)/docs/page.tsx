import { fetchDocBlocks } from '@/lib/notion';
import { NotionRenderer } from '@/components/notion/NotionRenderer';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default async function DocsPage() {
  const blocks = await fetchDocBlocks().catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Docs</h1>
        <p className="text-sm text-muted-foreground mt-1">SEEKO Studio documentation</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Studio Docs</CardTitle>
        </CardHeader>
        <CardContent>
          {blocks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No docs found. Add pages under &quot;SEEKO Docs&quot; in Notion.
            </p>
          ) : (
            <NotionRenderer blocks={blocks} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
