import { fetchDocs } from '@/lib/supabase/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText } from 'lucide-react';

export default async function DocsPage() {
  const docs = await fetchDocs().catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">Team documents, specs, and shared resources.</p>
      </div>

      {docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="size-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-foreground">No documents found</p>
          <p className="text-xs text-muted-foreground">Add them in the Supabase Table Editor.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {docs.map(doc => (
            <Card key={doc.id} className="group transition-colors hover:border-foreground/20">
              <CardContent className="flex items-start gap-3.5 p-4">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary">
                  <FileText className="size-4 text-foreground" />
                </div>
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{doc.title}</p>
                    <Badge variant="outline" className="text-xs font-normal">Document</Badge>
                  </div>
                  {doc.content && (
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                      {doc.content.replace(/<[^>]*>/g, '').slice(0, 200)}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
