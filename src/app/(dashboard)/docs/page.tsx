import { fetchDocs } from '@/lib/supabase/data';
import { DocList } from '@/components/dashboard/DocList';
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
        <DocList docs={docs} />
      )}
    </div>
  );
}
