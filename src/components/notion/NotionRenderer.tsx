import type { NotionBlock } from '@/lib/types';

function RichText({ items }: { items: Array<{ plain_text: string; annotations?: Record<string, boolean> }> }) {
  return (
    <>
      {items.map((item, i) => {
        const a = item.annotations ?? {};
        let content: React.ReactNode = item.plain_text;
        if (a.code) content = <code className="bg-zinc-800 px-1 py-0.5 rounded text-sm font-mono">{content}</code>;
        if (a.bold) content = <strong>{content}</strong>;
        if (a.italic) content = <em>{content}</em>;
        if (a.strikethrough) content = <s>{content}</s>;
        return <span key={i}>{content}</span>;
      })}
    </>
  );
}

export function NotionRenderer({ blocks }: { blocks: NotionBlock[] }) {
  return (
    <div className="prose prose-invert max-w-none space-y-3">
      {blocks.map((block) => {
        const richText = block[block.type]?.rich_text ?? [];

        switch (block.type) {
          case 'heading_1':
            return <h1 key={block.id} className="text-2xl font-bold text-white mt-6 mb-2"><RichText items={richText} /></h1>;
          case 'heading_2':
            return <h2 key={block.id} className="text-xl font-semibold text-white mt-5 mb-2"><RichText items={richText} /></h2>;
          case 'heading_3':
            return <h3 key={block.id} className="text-lg font-medium text-zinc-200 mt-4 mb-1"><RichText items={richText} /></h3>;
          case 'paragraph':
            return <p key={block.id} className="text-zinc-300 leading-relaxed"><RichText items={richText} /></p>;
          case 'bulleted_list_item':
            return <li key={block.id} className="text-zinc-300 ml-4 list-disc"><RichText items={richText} /></li>;
          case 'numbered_list_item':
            return <li key={block.id} className="text-zinc-300 ml-4 list-decimal"><RichText items={richText} /></li>;
          case 'code':
            return (
              <pre key={block.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 overflow-x-auto">
                <code className="text-sm font-mono text-zinc-200">
                  {richText.map((r: { plain_text: string }) => r.plain_text).join('')}
                </code>
              </pre>
            );
          case 'divider':
            return <hr key={block.id} className="border-zinc-800" />;
          case 'quote':
            return (
              <blockquote key={block.id} className="border-l-2 border-[#6ee7b7] pl-4 text-zinc-400 italic">
                <RichText items={richText} />
              </blockquote>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
