'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Upload, FileUp, X, Package, ArrowRightLeft } from 'lucide-react';
import { Dialog, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Task, TaskWithAssignee } from '@/lib/types';
import { useHaptics } from '@/components/HapticsProvider';

interface DeliverablesUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | TaskWithAssignee;
  onSubmit: (files: File[]) => Promise<void>;
  onSkip: () => void;
  onHandoff?: (files: File[]) => Promise<void>;
  className?: string;
}

export function DeliverablesUploadDialog({
  open,
  onOpenChange,
  task,
  onSubmit,
  onSkip,
  onHandoff,
  className,
}: DeliverablesUploadDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const { trigger } = useHaptics();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected?.length) return;
    setFiles(prev => [...prev, ...Array.from(selected)]);
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setUploading(true);
    try {
      await onSubmit(files);
      setFiles([]);
      onOpenChange(false);
      toast.success('Deliverables uploaded and task completed');
      trigger('success');
    } finally {
      setUploading(false);
    }
  };

  const handleHandoff = async () => {
    if (!onHandoff) return;
    setUploading(true);
    try {
      await onHandoff(files);
      setFiles([]);
    } finally {
      setUploading(false);
    }
  };

  const handleSkip = () => {
    onSkip();
    setFiles([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className={className}>
      <DialogClose onClose={() => onOpenChange(false)} />
      <DialogHeader>
        <DialogTitle className="pr-8 flex items-center gap-2">
          <Package className="size-5 text-muted-foreground shrink-0" />
          Upload deliverables
        </DialogTitle>
      </DialogHeader>
      <p className="text-sm text-muted-foreground mb-4">
        Add files for &quot;{task.name}&quot; (optional). You can also skip and mark the task complete without uploading.
      </p>
      <div className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-4" />
          Choose files
        </Button>
        {files.length > 0 && (
          <ul className="rounded-lg border border-border bg-muted/30 p-2 space-y-1 max-h-40 overflow-y-auto">
            {files.map((file, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <FileUp className="size-3.5 text-muted-foreground shrink-0" />
                <span className="truncate flex-1">{file.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                  aria-label="Remove file"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button onClick={handleSubmit} disabled={uploading} className="w-full sm:w-auto">
            {uploading ? 'Uploading…' : 'Submit & complete'}
          </Button>
          {onHandoff && (
            <Button variant="outline" onClick={handleHandoff} disabled={uploading} className="w-full sm:w-auto gap-1.5">
              <ArrowRightLeft className="size-3.5" />
              {uploading ? 'Uploading…' : 'Submit & hand off'}
            </Button>
          )}
          <Button variant="outline" onClick={handleSkip} disabled={uploading} className="w-full sm:w-auto">
            Skip & complete
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
