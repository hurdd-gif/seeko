# Decks in Documents — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add presentation decks as a special doc type — admins upload PDFs, server splits them into slide images, users view inline or in fullscreen slideshow mode.

**Architecture:** Decks reuse the `docs` table with a `type` column (`'doc'` | `'deck'`) and a `slides` jsonb column. PDF-to-image conversion happens client-side using `pdfjs-dist` (renders each page to a canvas, exports as WebP blob, uploads to Supabase Storage). This avoids server-side native dependencies. The viewer has two modes: inline vertical scroll (default) and fullscreen slideshow.

**Tech Stack:** pdfjs-dist (client-side PDF rendering), Supabase Storage (`deck-slides` bucket), existing Dialog/motion components, keyboard event handlers for slideshow.

---

### Task 1: Database Migration — Add `type` and `slides` columns

**Files:**
- Modify: `docs/supabase-schema.sql` (append migration)

**Step 1: Run migration in Supabase SQL Editor**

```sql
-- Add type column (doc or deck, default doc so existing rows unaffected)
ALTER TABLE public.docs ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'doc';

-- Add slides column (jsonb array of { url, sort_order })
ALTER TABLE public.docs ADD COLUMN IF NOT EXISTS slides jsonb DEFAULT NULL;

-- Index for filtering by type
CREATE INDEX IF NOT EXISTS idx_docs_type ON public.docs(type);
```

**Step 2: Update schema doc**

Append the migration SQL to `docs/supabase-schema.sql` under a new `-- Decks` section.

**Step 3: Commit**

```bash
git add docs/supabase-schema.sql
git commit -m "feat(schema): add type and slides columns to docs table for decks"
```

---

### Task 2: Update TypeScript types

**Files:**
- Modify: `src/lib/types.ts:52-62`

**Step 1: Update Doc type**

Add `type` and `slides` fields to the `Doc` type:

```typescript
export type Doc = {
  id: string;
  title: string;
  content?: string;
  parent_id?: string;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
  restricted_department?: string[];
  granted_user_ids?: string[];
  type?: 'doc' | 'deck';
  slides?: { url: string; sort_order: number }[];
};
```

**Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add type and slides fields to Doc type"
```

---

### Task 3: Install pdfjs-dist for client-side PDF rendering

**Files:**
- Modify: `package.json`

**Step 1: Install pdfjs-dist**

```bash
npm install pdfjs-dist
```

`pdfjs-dist` renders PDF pages to canvas in the browser. No server-side native deps needed.

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(deps): add pdfjs-dist for client-side PDF rendering"
```

---

### Task 4: Create the deck upload API endpoint

**Files:**
- Create: `src/app/api/docs/upload-deck/route.ts`

This endpoint receives individual slide images (WebP blobs) and uploads them to Supabase Storage. The PDF splitting happens client-side; this endpoint just stores the resulting images.

**Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB per slide image

async function getAdminUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) return null;
  return { supabase, user };
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const formData = await req.formData();
  const deckId = formData.get('deckId') as string;
  const slideIndex = formData.get('slideIndex') as string;
  const file = formData.get('file') as File | null;

  if (!deckId || slideIndex == null || !file) {
    return NextResponse.json({ error: 'Missing deckId, slideIndex, or file' }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const path = `${deckId}/${slideIndex}.webp`;

  const { error } = await admin.supabase.storage
    .from('deck-slides')
    .upload(path, buffer, {
      contentType: 'image/webp',
      upsert: true,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: urlData } = admin.supabase.storage
    .from('deck-slides')
    .getPublicUrl(path);

  return NextResponse.json({ url: urlData.publicUrl, sort_order: Number(slideIndex) }, { status: 201 });
}
```

**Step 2: Create Supabase Storage bucket**

In Supabase dashboard: create bucket `deck-slides`, set to **public**.

**Step 3: Commit**

```bash
git add "src/app/api/docs/upload-deck/route.ts"
git commit -m "feat(api): add deck slide upload endpoint"
```

---

### Task 5: Update docs API to support `type` and `slides`

**Files:**
- Modify: `src/app/api/docs/route.ts`
- Modify: `src/app/api/docs/[id]/route.ts`

**Step 1: Update POST to accept type and slides**

In `src/app/api/docs/route.ts`, add `type` and `slides` to the insert body:

```typescript
// After destructuring body:
const { title, content, sort_order, restricted_department, granted_user_ids, type, slides } = body;

// In the insert object, add:
...(type === 'deck' ? { type: 'deck' } : {}),
...(slides ? { slides } : {}),
```

**Step 2: Update PATCH to accept slides**

In `src/app/api/docs/[id]/route.ts`, add slides handling:

```typescript
// After existing field checks:
if ('slides' in body) updates.slides = body.slides;
```

**Step 3: Commit**

```bash
git add "src/app/api/docs/route.ts" "src/app/api/docs/[id]/route.ts"
git commit -m "feat(api): support type and slides fields in docs CRUD"
```

---

### Task 6: Create DeckUploader component

**Files:**
- Create: `src/components/dashboard/DeckUploader.tsx`

Client-side component that:
1. Accepts a PDF file via drag-and-drop or file picker
2. Uses `pdfjs-dist` to render each page to a canvas
3. Exports each canvas as a WebP blob
4. Uploads each blob to `/api/docs/upload-deck`
5. Returns the array of slide URLs

**Step 1: Create the component**

```typescript
'use client';

import { useState, useCallback } from 'react';
import { Upload, FileUp, Loader2, X } from 'lucide-react';

interface Slide {
  url: string;
  sort_order: number;
}

interface DeckUploaderProps {
  deckId: string;
  existingSlides?: Slide[];
  onSlidesChange: (slides: Slide[]) => void;
}

export function DeckUploader({ deckId, existingSlides = [], onSlidesChange }: DeckUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [slides, setSlides] = useState<Slide[]>(existingSlides);

  const processPdf = useCallback(async (file: File) => {
    setUploading(true);

    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;
      setProgress({ current: 0, total: totalPages });

      const newSlides: Slide[] = [];

      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 }); // 2x for quality

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;

        await page.render({ canvasContext: ctx, viewport }).promise;

        // Convert to WebP blob
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b!), 'image/webp', 0.85);
        });

        // Upload to server
        const formData = new FormData();
        formData.append('deckId', deckId);
        formData.append('slideIndex', String(i - 1));
        formData.append('file', blob, `slide-${i}.webp`);

        const res = await fetch('/api/docs/upload-deck', { method: 'POST', body: formData });
        if (!res.ok) throw new Error(`Failed to upload slide ${i}`);

        const data = await res.json();
        newSlides.push({ url: data.url, sort_order: data.sort_order });
        setProgress({ current: i, total: totalPages });
      }

      setSlides(newSlides);
      onSlidesChange(newSlides);
    } catch (err) {
      console.error('PDF processing error:', err);
    } finally {
      setUploading(false);
    }
  }, [deckId, onSlidesChange]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') processPdf(file);
  }, [processPdf]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') processPdf(file);
  }, [processPdf]);

  const removeSlide = useCallback((index: number) => {
    const updated = slides.filter((_, i) => i !== index)
      .map((s, i) => ({ ...s, sort_order: i }));
    setSlides(updated);
    onSlidesChange(updated);
  }, [slides, onSlidesChange]);

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      {!uploading && slides.length === 0 && (
        <label
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-8 cursor-pointer hover:border-seeko-accent/50 transition-colors"
        >
          <FileUp className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Drop a PDF here or click to upload</p>
          <input type="file" accept=".pdf" onChange={handleFileChange} className="hidden" />
        </label>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="flex flex-col items-center gap-2 py-6">
          <Loader2 className="size-6 text-seeko-accent animate-spin" />
          <p className="text-sm text-muted-foreground">
            Processing slide {progress.current} of {progress.total}...
          </p>
          <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-seeko-accent transition-all duration-300"
              style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Slide previews */}
      {slides.length > 0 && !uploading && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{slides.length} slide{slides.length !== 1 ? 's' : ''}</p>
            <label className="text-xs text-seeko-accent hover:text-seeko-accent/80 cursor-pointer transition-colors">
              <Upload className="size-3 inline mr-1" />
              Replace PDF
              <input type="file" accept=".pdf" onChange={handleFileChange} className="hidden" />
            </label>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {slides.map((slide, i) => (
              <div key={i} className="relative group aspect-[16/9] rounded-md overflow-hidden bg-secondary">
                <img src={slide.url} alt={`Slide ${i + 1}`} className="w-full h-full object-cover" />
                <span className="absolute bottom-1 left-1 text-[10px] font-mono text-white/80 bg-black/50 px-1 rounded">
                  {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeSlide(i)}
                  className="absolute top-1 right-1 size-5 flex items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/dashboard/DeckUploader.tsx
git commit -m "feat(ui): add DeckUploader component with client-side PDF splitting"
```

---

### Task 7: Create DeckViewer and DeckSlideshow components

**Files:**
- Create: `src/components/dashboard/DeckViewer.tsx`

This component handles both modes:
- **Inline scroll:** All slides stacked vertically with slide numbers
- **Fullscreen:** Single slide with arrow navigation, keyboard support, slide counter

**Step 1: Create the component**

```typescript
'use client';

import { useState, useCallback, useEffect } from 'react';
import { Maximize2, Minimize2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Slide {
  url: string;
  sort_order: number;
}

interface DeckViewerProps {
  slides: Slide[];
  title: string;
}

export function DeckViewer({ slides, title }: DeckViewerProps) {
  const sorted = [...slides].sort((a, b) => a.sort_order - b.sort_order);
  const [fullscreen, setFullscreen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  const goNext = useCallback(() => {
    setCurrentSlide(prev => Math.min(prev + 1, sorted.length - 1));
  }, [sorted.length]);

  const goPrev = useCallback(() => {
    setCurrentSlide(prev => Math.max(prev - 1, 0));
  }, []);

  const exitFullscreen = useCallback(() => setFullscreen(false), []);

  // Keyboard navigation in fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'Escape') exitFullscreen();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [fullscreen, goNext, goPrev, exitFullscreen]);

  if (sorted.length === 0) return null;

  return (
    <>
      {/* ── Inline scroll view ─────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {sorted.length} slide{sorted.length !== 1 ? 's' : ''}
          </p>
          <button
            type="button"
            onClick={() => { setCurrentSlide(0); setFullscreen(true); }}
            className="flex items-center gap-1.5 text-xs text-seeko-accent hover:text-seeko-accent/80 transition-colors"
          >
            <Maximize2 className="size-3" />
            Present
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {sorted.map((slide, i) => (
            <div
              key={i}
              className="relative rounded-lg overflow-hidden bg-secondary cursor-pointer"
              onClick={() => { setCurrentSlide(i); setFullscreen(true); }}
            >
              <img src={slide.url} alt={`Slide ${i + 1}`} className="w-full" />
              <span className="absolute bottom-2 left-2 text-xs font-mono text-white/80 bg-black/50 px-1.5 py-0.5 rounded">
                {i + 1}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Fullscreen slideshow ───────────────────────── */}
      <AnimatePresence>
        {fullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center"
          >
            {/* Top bar */}
            <div className="absolute top-0 inset-x-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent z-10">
              <span className="text-sm text-white/80 font-medium truncate">{title}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-white/60 font-mono">
                  {currentSlide + 1} / {sorted.length}
                </span>
                <button type="button" onClick={exitFullscreen} className="text-white/70 hover:text-white transition-colors">
                  <X className="size-5" />
                </button>
              </div>
            </div>

            {/* Slide */}
            <AnimatePresence mode="wait">
              <motion.img
                key={currentSlide}
                src={sorted[currentSlide].url}
                alt={`Slide ${currentSlide + 1}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="max-h-[85vh] max-w-[95vw] object-contain select-none"
                draggable={false}
              />
            </AnimatePresence>

            {/* Navigation arrows */}
            {currentSlide > 0 && (
              <button
                type="button"
                onClick={goPrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 size-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <ChevronLeft className="size-5" />
              </button>
            )}
            {currentSlide < sorted.length - 1 && (
              <button
                type="button"
                onClick={goNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 size-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <ChevronRight className="size-5" />
              </button>
            )}

            {/* Bottom dot indicators */}
            {sorted.length <= 20 && (
              <div className="absolute bottom-4 flex items-center gap-1.5">
                {sorted.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCurrentSlide(i)}
                    className={`size-1.5 rounded-full transition-all ${i === currentSlide ? 'bg-white scale-125' : 'bg-white/30 hover:bg-white/50'}`}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/dashboard/DeckViewer.tsx
git commit -m "feat(ui): add DeckViewer with inline scroll and fullscreen slideshow"
```

---

### Task 8: Create DeckEditor component

**Files:**
- Create: `src/components/dashboard/DeckEditor.tsx`

A simplified editor dialog for decks — title, description, permissions, and the DeckUploader. Mirrors DocEditor's form fields but replaces the rich text editor with the PDF uploader.

**Step 1: Create the component**

The component should:
- Accept `doc?: Doc` (existing deck for editing) or undefined for new
- Accept `onSave: (doc: Doc) => void` and `onCancel: () => void`
- Accept `team: Profile[]` for the granted users picker
- Show title input, description textarea (plain text, not rich editor)
- Show department restriction toggles (same as DocEditor)
- Show granted users picker (same as DocEditor)
- Show DeckUploader
- On save: POST or PATCH `/api/docs` with `type: 'deck'` and `slides` array

Follow the same patterns as `DocEditor.tsx` for the form fields and permission controls. Use a textarea for description instead of TipTap.

Generate a temporary UUID (`crypto.randomUUID()`) for new decks to use as the `deckId` for slide uploads, then include it as the doc ID on create (or let the server generate one and re-upload — simpler to let server generate and use a temp folder).

**Alternative approach:** Upload slides to a temp path first, then move them when the deck is saved. Or: create the deck record first (with no slides), then upload slides using the real ID, then PATCH slides array.

Recommended: Create deck first → get real ID → upload slides with that ID → PATCH slides array. This is two API calls but avoids temp file management.

**Step 2: Commit**

```bash
git add src/components/dashboard/DeckEditor.tsx
git commit -m "feat(ui): add DeckEditor with PDF upload and permissions"
```

---

### Task 9: Integrate decks into DocList

**Files:**
- Modify: `src/components/dashboard/DocList.tsx`

**Step 1: Add tab toggle**

Add a `viewMode` state (`'docs' | 'decks'`) with a tab toggle at the top of the page, above the search bar:

```typescript
const [viewMode, setViewMode] = useState<'docs' | 'decks'>('docs');
```

Render two buttons styled as tabs. Filter the docs list by `type`:

```typescript
const filteredByType = docs.filter(d =>
  viewMode === 'decks' ? d.type === 'deck' : d.type !== 'deck'
);
```

**Step 2: Add deck card variant**

When rendering a deck card, show the first slide as a thumbnail instead of the text preview:

```typescript
{doc.type === 'deck' && doc.slides?.[0] && (
  <div className="mt-2 aspect-[16/9] rounded-md overflow-hidden bg-secondary">
    <img src={doc.slides[0].url} alt="" className="w-full h-full object-cover" />
  </div>
)}
```

**Step 3: Add deck read dialog**

When `selected` doc is a deck, render `DeckViewer` instead of `DocContent`:

```typescript
{selected?.type === 'deck' && selected.slides ? (
  <DeckViewer slides={selected.slides} title={selected.title} />
) : (
  <DocContent html={selected?.content ?? ''} />
)}
```

**Step 4: Add deck edit dialog**

When `editingDoc` is a deck or creating a new deck, render `DeckEditor` instead of `DocEditor`:

```typescript
// New state for "new deck" vs "new doc"
const [editingDeck, setEditingDeck] = useState<Doc | 'new' | null>(null);
```

**Step 5: Update "New" button**

When in decks tab, the "New Document" button should say "New Deck" and open the deck editor.

**Step 6: Commit**

```bash
git add src/components/dashboard/DocList.tsx
git commit -m "feat(ui): integrate deck tabs, cards, and viewer into DocList"
```

---

### Task 10: Update data fetching to include new columns

**Files:**
- Modify: `src/lib/supabase/data.ts`

**Step 1: Verify fetchDocs and fetchAllDocs include new columns**

The current queries use `select('*')` so `type` and `slides` are automatically included. No changes needed unless the queries are explicit. Verify and update if needed.

**Step 2: Commit (if changes needed)**

```bash
git add src/lib/supabase/data.ts
git commit -m "feat(data): ensure docs queries include type and slides columns"
```

---

### Task 11: End-to-end testing

**Steps:**
1. Run `npm run dev` and verify docs page loads without errors
2. Verify "Documents | Decks" tab toggle works
3. As admin, create a new deck — upload a multi-page PDF
4. Verify slides appear in the uploader preview grid
5. Save the deck, verify it appears in the decks list with thumbnail
6. Click the deck, verify inline scroll view shows all slides
7. Click "Present", verify fullscreen slideshow with arrow navigation
8. Verify keyboard navigation (left/right arrows, Escape)
9. Verify department restrictions work (lock a deck, check as non-admin)
10. Verify non-admin cannot see "New Deck" button

**Final commit:**

```bash
git commit -m "feat: complete decks in documents feature"
```
