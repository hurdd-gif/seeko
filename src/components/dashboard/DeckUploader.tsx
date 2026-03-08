'use client';

import { useState, useCallback } from 'react';
import { FileUp, Loader2, Upload, X } from 'lucide-react';

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
        const viewport = page.getViewport({ scale: 2 });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;

        await page.render({ canvas, viewport }).promise;

        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b!), 'image/webp', 0.85);
        });

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
