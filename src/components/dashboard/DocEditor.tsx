'use client';

import { useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, List, ListOrdered, ImageIcon, Heading1, Heading2, Heading3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Doc } from '@/lib/types';

const DEPARTMENTS = ['Coding', 'Visual Art', 'UI/UX', 'Animation', 'Asset Creation'] as const;

interface DocEditorProps {
  doc?: Doc;
  onSave: (doc: Doc) => void;
  onCancel: () => void;
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

export function DocEditor({ doc, onSave, onCancel }: DocEditorProps) {
  const [title, setTitle] = useState(doc?.title ?? '');
  const [department, setDepartment] = useState<string>(doc?.restricted_department ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit,
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    content: doc?.content ?? '',
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none min-h-[200px] focus:outline-none text-foreground/80 prose-headings:text-foreground prose-strong:text-foreground',
      },
    },
  });

  const insertImage = useCallback((url: string) => {
    editor?.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError('');
    try {
      const body = {
        title: title.trim(),
        content: editor?.getHTML() ?? '',
        restricted_department: department || null,
      };
      const res = doc
        ? await fetch(`/api/docs/${doc.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch('/api/docs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? 'Save failed');
        return;
      }
      const saved = await res.json();
      onSave(saved as Doc);
    } catch {
      setError('Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!editor) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* Title */}
      <Input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Document title"
        className="text-base font-semibold h-10"
      />

      {/* Department restrict */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground whitespace-nowrap">Restrict to dept</label>
        <select
          value={department}
          onChange={e => setDepartment(e.target.value)}
          className="h-7 rounded border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
        >
          <option value="">All departments</option>
          {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Toolbar */}
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
      </div>

      {/* Editor */}
      <div className="min-h-[200px] rounded-md border border-border bg-card p-3">
        <EditorContent editor={editor} />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : doc ? 'Save changes' : 'Create document'}
        </Button>
      </div>
    </div>
  );
}
