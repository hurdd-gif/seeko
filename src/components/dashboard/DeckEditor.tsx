'use client';

import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Doc, Profile } from '@/lib/types';
import { useHaptics } from '@/components/HapticsProvider';
import { useDialogFooter } from '@/components/ui/dialog';
import { DeckUploader } from './DeckUploader';

const DEPARTMENTS = ['Coding', 'Visual Art', 'UI/UX', 'Animation', 'Asset Creation'] as const;

interface DeckEditorProps {
  doc?: Doc;
  onSave: (doc: Doc) => void;
  onCancel: () => void;
  team?: Pick<Profile, 'id' | 'display_name'>[];
}

export function DeckEditor({ doc, onSave, onCancel, team = [] }: DeckEditorProps) {
  const { trigger } = useHaptics();
  const [title, setTitle] = useState(doc?.title ?? '');
  const [description, setDescription] = useState(doc?.content ?? '');
  const [departments, setDepartments] = useState<string[]>(doc?.restricted_department ?? []);
  const [grantedIds, setGrantedIds] = useState<string[]>(doc?.granted_user_ids ?? []);
  const [slides, setSlides] = useState<{ url: string; sort_order: number }[]>(doc?.slides ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [addUserValue, setAddUserValue] = useState('');
  const [deckId, setDeckId] = useState<string>(doc?.id ?? '');

  const toggleDepartment = (dept: string) => {
    setDepartments(prev =>
      prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]
    );
  };

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError('');
    try {
      if (doc) {
        // Editing existing deck — PATCH
        const body = {
          title: title.trim(),
          content: description.trim() || null,
          restricted_department: departments.length > 0 ? departments : null,
          granted_user_ids: grantedIds.length > 0 ? grantedIds : null,
          slides: slides.length > 0 ? slides : null,
        };
        const res = await fetch(`/api/docs/${doc.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const j = await res.json();
          setError(j.error ?? 'Save failed');
          trigger('error');
          return;
        }
        const saved = await res.json();
        trigger('success');
        onSave(saved as Doc);
      } else if (deckId) {
        // Deck record was already created by ensureDeckId (for uploads) — PATCH it
        const body = {
          title: title.trim(),
          content: description.trim() || null,
          restricted_department: departments.length > 0 ? departments : null,
          granted_user_ids: grantedIds.length > 0 ? grantedIds : null,
          slides: slides.length > 0 ? slides : null,
        };
        const res = await fetch(`/api/docs/${deckId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const j = await res.json();
          setError(j.error ?? 'Save failed');
          trigger('error');
          return;
        }
        const saved = await res.json();
        trigger('success');
        onSave(saved as Doc);
      } else {
        // Brand new deck with no slides uploaded yet — POST
        const body = {
          title: title.trim(),
          content: description.trim() || null,
          type: 'deck',
          restricted_department: departments.length > 0 ? departments : null,
          granted_user_ids: grantedIds.length > 0 ? grantedIds : null,
        };
        const res = await fetch('/api/docs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const j = await res.json();
          setError(j.error ?? 'Save failed');
          trigger('error');
          return;
        }
        const saved = await res.json();
        trigger('success');
        onSave(saved as Doc);
      }
    } catch {
      setError('Save failed');
      trigger('error');
    } finally {
      setSaving(false);
    }
  };

  // For new decks, create the record first to get a real ID for slide uploads
  const ensureDeckId = async (extractedTitle?: string) => {
    if (deckId) return deckId;
    try {
      const res = await fetch('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || extractedTitle || 'Untitled Deck',
          type: 'deck',
        }),
      });
      if (!res.ok) throw new Error('Failed to create deck');
      const created = await res.json();
      setDeckId(created.id);
      return created.id as string;
    } catch {
      setError('Failed to create deck for uploads');
      return '';
    }
  };

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
          onClick={handleSave}
          disabled={saving}
          className="min-w-[7rem] min-h-[2.5rem] touch-manipulation"
        >
          {saving ? 'Saving…' : doc ? 'Save changes' : 'Create deck'}
        </Button>
      </>
    );
    return () => { setDialogFooter(null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setDialogFooter, saving, doc]);

  return (
    <div className="flex flex-col gap-4">
      {/* Title */}
      <Input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Deck title"
        className="text-base font-semibold h-10"
      />

      {/* Description */}
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={3}
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
      />

      {/* Department restrict */}
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

      {/* Granted users */}
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
          {grantedIds.map(id => {
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

      {/* PDF Upload */}
      <DeckUploader
        deckId={deckId}
        getDeckId={ensureDeckId}
        existingSlides={slides}
        onSlidesChange={(newSlides) => setSlides(newSlides)}
        onTitleExtracted={(extracted) => {
          if (!title.trim()) setTitle(extracted);
        }}
      />

      {/* Note about needing to upload PDF before deckId exists */}
      {!deckId && !doc && slides.length === 0 && (
        <p className="text-xs text-muted-foreground/60">
          The deck will be created when you upload a PDF or click &ldquo;Create deck&rdquo;.
        </p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Inline actions when not in dialog */}
      {!setDialogFooter && (
        <div className="sticky bottom-0 left-0 right-0 z-10 flex flex-shrink-0 items-center justify-end gap-3 border-t border-border bg-card pt-4 pb-2 -mx-6 px-6 mt-4">
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
            {saving ? 'Saving…' : doc ? 'Save changes' : 'Create deck'}
          </Button>
        </div>
      )}
    </div>
  );
}
