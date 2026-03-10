'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Bold, Italic, List, ListOrdered, ImageIcon, Heading1, Heading2, Heading3, Table as TableIcon, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useIsDesktop } from '@/lib/hooks/useIsDesktop';
import type { Doc, Profile } from '@/lib/types';
import { useHaptics } from '@/components/HapticsProvider';
import { useDialogFooter } from '@/components/ui/dialog';
import { Editor as DesktopEditor } from '@/components/ui/editor';

const DEPARTMENTS = ['Coding', 'Visual Art', 'UI/UX', 'Animation', 'Asset Creation'] as const;

interface DocEditorProps {
  doc?: Doc;
  onSave: (doc: Doc) => void;
  onCancel: () => void;
  team?: Pick<Profile, 'id' | 'display_name'>[];
}

function ToolbarButton({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={cn(
        'flex size-7 items-center justify-center rounded text-xs transition-colors',
        active
          ? 'bg-foreground text-background'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

function ImagePopover({ onInsert }: { onInsert: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'url' | 'upload'>('url');
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleUrl = () => {
    if (url.trim()) {
      onInsert(url.trim());
      setUrl('');
      setOpen(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/docs/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? 'Upload failed');
        return;
      }
      const { url: imageUrl } = await res.json();
      onInsert(imageUrl);
      setOpen(false);
    } catch {
      setError('Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="relative">
      <ToolbarButton title="Insert image" onClick={() => setOpen(v => !v)}>
        <ImageIcon className="size-3.5" />
      </ToolbarButton>

      {open && (
        <div className="absolute left-0 top-8 z-50 w-72 rounded-lg border border-border bg-card p-3 shadow-lg">
          <div className="mb-2 flex gap-1">
            {(['url', 'upload'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  'rounded px-2 py-1 text-xs capitalize transition-colors',
                  tab === t ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t === 'url' ? 'Paste URL' : 'Upload'}
              </button>
            ))}
          </div>

          {tab === 'url' ? (
            <div className="flex gap-2">
              <Input
                className="h-7 text-xs"
                placeholder="https://..."
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleUrl()}
              />
              <Button size="sm" className="h-7 text-xs" onClick={handleUrl}>
                Insert
              </Button>
            </div>
          ) : (
            <div>
              <label className={cn(
                'flex cursor-pointer items-center justify-center rounded border border-dashed border-border p-3 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground',
                uploading && 'pointer-events-none opacity-50'
              )}>
                {uploading ? 'Uploading…' : 'Click to choose image (≤ 5 MB)'}
                <input type="file" accept="image/*" className="sr-only" onChange={handleUpload} disabled={uploading} />
              </label>
              {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DocEditor({ doc, onSave, onCancel, team = [] }: DocEditorProps) {
  const { trigger } = useHaptics();
  const isDesktop = useIsDesktop();
  const [title, setTitle] = useState(doc?.title ?? '');
  const [departments, setDepartments] = useState<string[]>(doc?.restricted_department ?? []);
  const [grantedIds, setGrantedIds] = useState<string[]>(doc?.granted_user_ids ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [addUserValue, setAddUserValue] = useState('');
  const desktopContentRef = useRef<string>(doc?.content ?? '');
  const userEditedContentRef = useRef(false);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const handleSaveRef = useRef<() => void>(() => {});

  const toggleDepartment = (dept: string) => {
    setDepartments(prev =>
      prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]
    );
  };

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit,
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: doc?.content ?? '',
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none min-h-[200px] focus:outline-none text-foreground/80 prose-headings:text-foreground prose-strong:text-foreground',
      },
    },
    onUpdate: () => { userEditedContentRef.current = true; },
  });

  const insertImage = useCallback((url: string) => {
    editor?.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  // ── Table resize icons + row resize ──────────────────────
  useEffect(() => {
    if (!editor) return;
    const editorEl = editor.view.dom as HTMLElement;

    /* SVG strings — match the three icons the user provided */
    const COL_RESIZE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 14 14" fill="currentColor" style="display:block">
      <rect x="1" y="1" width="2" height="12" rx="1"/>
      <path d="M6 7L12 3.5V10.5L6 7Z"/>
    </svg>`;

    const ROW_RESIZE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 14 14" fill="currentColor" style="display:block">
      <rect x="1" y="6.25" width="12" height="1.5" rx="0.75"/>
      <path d="M7 1L4 4.5H10L7 1Z"/>
      <path d="M7 13L4 9.5H10L7 13Z"/>
    </svg>`;

    /* Inject I► icon into Tiptap's column-resize-handle divs */
    function injectColIcons() {
      editorEl.querySelectorAll<HTMLElement>('.column-resize-handle').forEach(h => {
        if (!h.querySelector('svg')) h.innerHTML = COL_RESIZE_SVG;
      });
    }

    const colObserver = new MutationObserver(injectColIcons);
    colObserver.observe(editorEl, { childList: true, subtree: true });
    injectColIcons();

    /* ── Row resize ── */
    let resizing = false;
    let resizingRow: HTMLTableRowElement | null = null;
    let startY = 0;
    let startHeight = 0;

    /* Floating ≑ indicator */
    const indicator = document.createElement('div');
    Object.assign(indicator.style, {
      position: 'fixed',
      zIndex: '9999',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.1s',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#6ee7b7',
      width: '20px',
      height: '20px',
    });
    indicator.innerHTML = ROW_RESIZE_SVG;
    document.body.appendChild(indicator);

    /* Query all TR elements directly — elementsFromPoint misses borders between rows */
    function rowNearBottom(e: MouseEvent): HTMLTableRowElement | null {
      const rows = editorEl.querySelectorAll<HTMLTableRowElement>('tr');
      for (const row of rows) {
        const rect = row.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right) continue;
        if (e.clientY >= rect.bottom - 8 && e.clientY <= rect.bottom + 8) return row;
      }
      return null;
    }

    function onMove(e: MouseEvent) {
      if (resizing && resizingRow) {
        e.preventDefault();
        const newH = Math.max(28, startHeight + (e.clientY - startY));
        Array.from(resizingRow.cells).forEach(c => {
          (c as HTMLElement).style.setProperty('height', `${newH}px`, 'important');
        });
        const r = resizingRow.getBoundingClientRect();
        indicator.style.left = `${e.clientX - 10}px`;
        indicator.style.top  = `${r.bottom - 10}px`;
        indicator.style.opacity = '1';
        return;
      }
      const row = rowNearBottom(e);
      if (row) {
        const r = row.getBoundingClientRect();
        indicator.style.left = `${e.clientX - 10}px`;
        indicator.style.top  = `${r.bottom - 10}px`;
        indicator.style.opacity = '1';
        editorEl.style.cursor = 'row-resize';
      } else {
        indicator.style.opacity = '0';
        editorEl.style.cursor = '';
      }
    }

    function onDown(e: MouseEvent) {
      const row = rowNearBottom(e);
      if (!row) return;
      e.preventDefault();
      e.stopPropagation();
      resizing = true;
      resizingRow = row;
      startY = e.clientY;
      startHeight = row.getBoundingClientRect().height;
      document.body.style.userSelect = 'none';
    }

    function onUp() {
      if (!resizing) return;
      resizing = false;
      resizingRow = null;
      indicator.style.opacity = '0';
      editorEl.style.cursor = '';
      document.body.style.userSelect = '';
    }

    window.addEventListener('mousemove', onMove);
    document.addEventListener('mousedown', onDown, true); // capture: runs before Tiptap handlers
    window.addEventListener('mouseup', onUp);

    return () => {
      colObserver.disconnect();
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('mouseup', onUp);
      indicator.remove();
    };
  }, [editor]);

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        restricted_department: departments.length > 0 ? departments : null,
        granted_user_ids: grantedIds.length > 0 ? grantedIds : null,
      };
      // Only send content for new docs, or when user actually edited content.
      // For desktop: read from desktopContentRef only if user interacted with editor.
      // For mobile: the tiptap onUpdate only fires on real user edits.
      if (!doc) {
        // New doc — always send content
        body.content = isDesktop ? desktopContentRef.current : (editor?.getHTML() ?? '');
      } else if (userEditedContentRef.current) {
        // Existing doc — only send if user actually edited
        const content = isDesktop ? desktopContentRef.current : (editor?.getHTML() ?? '');
        // Extra guard: don't send empty/default content for existing docs
        const isEmpty = !content || content === '<p></p>' || content === '<p><br></p>';
        if (!isEmpty) {
          body.content = content;
        }
      }
      const res = doc
        ? await fetch(`/api/docs/${doc.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch('/api/docs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? 'Save failed');
        trigger('error');
        return;
      }
      const saved = await res.json();
      trigger('success');
      onSave(saved as Doc);
    } catch {
      setError('Save failed');
      trigger('error');
    } finally {
      setSaving(false);
    }
  };

  handleSaveRef.current = handleSave;

  const setDialogFooter = useDialogFooter();

  useEffect(() => {
    if (!setDialogFooter) return;
    setDialogFooter(
      <>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => { trigger('selection'); onCancel(); }}
          disabled={saving}
          className="min-w-[4.5rem] min-h-[2.5rem] touch-manipulation"
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => handleSaveRef.current()}
          disabled={saving}
          className="min-w-[7rem] min-h-[2.5rem] touch-manipulation"
        >
          {saving ? 'Saving…' : doc ? 'Save changes' : 'Create document'}
        </Button>
      </>
    );
    return () => { setDialogFooter(null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sync footer when saving/doc change
  }, [setDialogFooter, saving, doc]);

  if (!isDesktop && !editor) return null;

  const actionBar = (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => { trigger('selection'); onCancel(); }}
        disabled={saving}
        className="min-w-[4.5rem] min-h-[2.5rem] touch-manipulation"
      >
        Cancel
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={handleSave}
        disabled={saving}
        className="min-w-[7rem] min-h-[2.5rem] touch-manipulation"
      >
        {saving ? 'Saving…' : doc ? 'Save changes' : 'Create document'}
      </Button>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Title */}
      <Input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Document title"
        className="text-base font-semibold h-10"
      />

      {/* Department restrict — multi-select toggles */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground whitespace-nowrap">Restrict to:</span>
        {DEPARTMENTS.map(dept => (
          <button
            key={dept}
            type="button"
            onClick={() => toggleDepartment(dept)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
              departments.includes(dept)
                ? 'border-seeko-accent bg-seeko-accent/10 text-seeko-accent'
                : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
            )}
          >
            {dept}
          </button>
        ))}
        {departments.length > 0 && (
          <button
            type="button"
            onClick={() => setDepartments([])}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Also allow access — users who get access despite department restriction */}
      {team.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Also allow access:</span>
          <Select
            value={addUserValue}
            onChange={e => {
              const val = e.target.value;
              if (val && !grantedIds.includes(val)) {
                setGrantedIds(prev => [...prev, val]);
                setAddUserValue('');
              }
            }}
            className="w-[180px] h-8 text-xs"
          >
            <option value="">Add someone…</option>
            {team.filter(p => !grantedIds.includes(p.id)).map(p => (
              <option key={p.id} value={p.id}>{p.display_name ?? p.id}</option>
            ))}
          </Select>
          {grantedIds.length > 0 && grantedIds.map(id => {
            const p = team.find(t => t.id === id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/50 px-2.5 py-0.5 text-xs text-foreground"
              >
                @{p?.display_name ?? 'Unknown'}
                <button
                  type="button"
                  onClick={() => setGrantedIds(prev => prev.filter(x => x !== id))}
                  className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  aria-label={`Remove ${p?.display_name ?? id}`}
                >
                  <Trash2 className="size-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Editor — desktop uses Pages CMS editor with bubble menu + slash commands;
         mobile keeps the original toolbar editor */}
      {isDesktop ? (
        <div
          ref={editorContainerRef}
          onKeyDownCapture={() => { userEditedContentRef.current = true; }}
          onPointerDownCapture={() => { userEditedContentRef.current = true; }}
        >
        <DesktopEditor
          value={doc?.content ?? ''}
          onChange={(html) => { desktopContentRef.current = html; }}
          format="html"
          enableImages
          enableImagePasteDrop
          onUploadImage={async (file) => {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch('/api/docs/upload', { method: 'POST', body: fd });
            if (!res.ok) return null;
            const { url } = await res.json();
            return { src: url };
          }}
          className="min-h-[300px]"
          editorClassName="min-h-[300px] doc-content"
        />
        </div>
      ) : (
        <>
          {/* Mobile toolbar */}
          {editor && (
            <>
              <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-secondary/40 px-2 py-1.5">
                <ToolbarButton title="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
                  <Heading1 className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton title="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
                  <Heading2 className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton title="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
                  <Heading3 className="size-3.5" />
                </ToolbarButton>

                <div className="mx-1 h-4 w-px bg-border" />

                <ToolbarButton title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
                  <Bold className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
                  <Italic className="size-3.5" />
                </ToolbarButton>

                <div className="mx-1 h-4 w-px bg-border" />

                <ToolbarButton title="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
                  <List className="size-3.5" />
                </ToolbarButton>
                <ToolbarButton title="Ordered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
                  <ListOrdered className="size-3.5" />
                </ToolbarButton>

                <div className="mx-1 h-4 w-px bg-border" />

                <ImagePopover onInsert={insertImage} />

                <div className="mx-1 h-4 w-px bg-border" />

                <ToolbarButton
                  title="Insert table (3×3)"
                  onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                >
                  <TableIcon className="size-3.5" />
                </ToolbarButton>
                {editor.can().addColumnAfter() && (
                  <>
                    <ToolbarButton title="Add column" onClick={() => editor.chain().focus().addColumnAfter().run()}>
                      <Plus className="size-3.5" />
                    </ToolbarButton>
                    <ToolbarButton title="Delete column" onClick={() => editor.chain().focus().deleteColumn().run()}>
                      <Trash2 className="size-3 text-destructive/70" />
                    </ToolbarButton>
                  </>
                )}
                {editor.can().addRowAfter() && (
                  <>
                    <ToolbarButton title="Add row" onClick={() => editor.chain().focus().addRowAfter().run()}>
                      <Plus className="size-3.5 rotate-90" />
                    </ToolbarButton>
                    <ToolbarButton title="Delete row" onClick={() => editor.chain().focus().deleteRow().run()}>
                      <Trash2 className="size-3 rotate-90 text-destructive/70" />
                    </ToolbarButton>
                  </>
                )}
              </div>

              {/* Mobile editor area */}
              <div className="min-h-[200px] rounded-md border border-border bg-card p-3">
                <EditorContent editor={editor} />
              </div>
            </>
          )}
        </>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Actions: when not inside a Dialog, render inline; otherwise they're in the dialog footer */}
      {!setDialogFooter && (
        <div className="sticky bottom-0 left-0 right-0 z-10 flex flex-shrink-0 items-center justify-end gap-3 border-t border-border bg-card pt-4 pb-2 -mx-6 px-6 mt-4">
          {actionBar}
        </div>
      )}
    </div>
  );
}
