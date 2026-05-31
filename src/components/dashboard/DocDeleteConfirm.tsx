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
    <div className="flex items-center gap-3 rounded-lg border border-[#d4503e]/30 bg-[#d4503e]/5 px-4 py-3">
      <p className="flex-1 text-sm text-[#111]">
        Delete <span className="font-medium">{docTitle}</span>?
      </p>
      {error && <p className="text-xs text-[#d4503e]">{error}</p>}
      <Button variant="ghost" size="sm" onClick={onCancel} disabled={deleting} className={BTN_SECONDARY}>
        Cancel
      </Button>
      <Button
        size="sm"
        onClick={handleConfirm}
        disabled={deleting}
        className={cn('bg-[#d4503e] text-white hover:bg-[#c04535]')}
      >
        {deleting ? 'Deleting…' : 'Delete'}
      </Button>
    </div>
  );
}
