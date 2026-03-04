import { fetchDocs } from '@/lib/supabase/data';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default async function DocsPage() {
  const docs = await fetchDocs().catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Docs</h1>
        <p className="text-sm text-muted-foreground mt-1">SEEKO Studio documentation</p>
      </div>

      {docs.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">
              No docs found. Add them in the Supabase Table Editor.
            </p>
          </CardContent>
        </Card>
      ) : (
        docs.map(doc => (
          <Card key={doc.id}>
            <CardHeader>
              <CardTitle>{doc.title}</CardTitle>
            </CardHeader>
            {doc.content && (
              <CardContent>
                <article
                  className="prose prose-invert max-w-none text-zinc-300 prose-headings:text-white prose-strong:text-white prose-code:bg-zinc-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm"
                  dangerouslySetInnerHTML={{ __html: doc.content }}
                />
              </CardContent>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
