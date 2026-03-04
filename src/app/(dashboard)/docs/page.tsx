import { fetchDocBlocks } from '@/lib/notion';
import { NotionRenderer } from '@/components/notion/NotionRenderer';

export default async function DocsPage() {
  const blocks = await fetchDocBlocks().catch(() => []);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Docs</h1>
        <p className="text-sm text-zinc-500 mt-1">SEEKO Studio documentation</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        {blocks.length === 0 ? (
          <p className="text-zinc-600 text-sm">
            No docs found. Add pages under &quot;SEEKO Docs&quot; in Notion.
          </p>
        ) : (
          <NotionRenderer blocks={blocks} />
        )}
      </div>
    </>
  );
}
