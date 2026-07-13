'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BTN_SECONDARY } from './lightKit';

interface DocDeleteConfirmProps {
  docId: string;
  docTitle: string;
  onDelete: (id: string) => void;
  onCancel: () => void;
}

export function DocDeleteConfirm({ docId, docTitle, onDelete, onCancel }: DocDeleteConfirmProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    setDeleting(true);
    setError('');
    try {
      const res = await fetch(`/api/docs/${docId}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? 'Delete failed');
        return;
      }
      onDelete(docId);
    } catch {
      setError('Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3">
      <p className="flex-1 text-sm text-ink-title">
        Delete <span className="font-medium">{docTitle}</span>?
      </p>
      {error && <p className="text-xs text-danger">{error}</p>}
      <Button variant="ghost" size="sm" onClick={onCancel} disabled={deleting} className={BTN_SECONDARY}>
        Cancel
      </Button>
      <Button
        size="sm"
        onClick={handleConfirm}
        disabled={deleting}
        className={cn('bg-danger text-white hover:bg-[#c04535] dark:hover:bg-danger-strong')}
      >
        {deleting ? 'Deleting…' : 'Delete'}
      </Button>
    </div>
  );
}
