'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { Doc } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';

export function DocList({ docs }: { docs: Doc[] }) {
  const [selected, setSelected] = useState<Doc | null>(null);

  return (
    <>
      <div className="flex flex-col gap-3">
        {docs.map(doc => (
          <Card
            key={doc.id}
            className="group cursor-pointer transition-colors hover:border-foreground/20"
            onClick={() => setSelected(doc)}
          >
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

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        {selected && (
          <>
            <DialogClose onClose={() => setSelected(null)} />
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary">
                  <FileText className="size-4 text-foreground" />
                </div>
                <DialogTitle>{selected.title}</DialogTitle>
              </div>
            </DialogHeader>
            {selected.content ? (
              <article
                className="prose prose-invert max-w-none text-zinc-300 prose-headings:text-white prose-strong:text-white prose-code:bg-zinc-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm"
                dangerouslySetInnerHTML={{ __html: selected.content }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No content yet.</p>
            )}
          </>
        )}
      </Dialog>
    </>
  );
}
