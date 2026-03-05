'use client';

import { GameTreeTimeline } from './GameTreeTimeline';

const SLOTS: Record<string, React.ReactNode> = {
  'game-tree': <GameTreeTimeline />,
};

const SLOT_REGEX = /<div[^>]+data-component="([^"]+)"[^>]*>\s*<\/div>/g;

/** Single class for document body – all styling from globals.css so admin and non-admin match */
const DOC_BODY_CLASS = 'doc-content-body';

export function DocContent({ html }: { html: string }) {
  const parts: { type: 'html' | 'slot'; content: string }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  SLOT_REGEX.lastIndex = 0;
  while ((match = SLOT_REGEX.exec(html)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'html', content: html.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'slot', content: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < html.length) {
    parts.push({ type: 'html', content: html.slice(lastIndex) });
  }

  return (
    <div className="doc-content mt-2 min-w-0">
      {parts.map((part, i) =>
        part.type === 'html' ? (
          <article
            key={i}
            className={DOC_BODY_CLASS}
            dangerouslySetInnerHTML={{ __html: part.content }}
          />
        ) : (
          <div key={i} className="my-4">
            {SLOTS[part.content] ?? null}
          </div>
        )
      )}
    </div>
  );
}
