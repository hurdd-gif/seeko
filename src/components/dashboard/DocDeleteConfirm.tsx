'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

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
    <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
      <p className="flex-1 text-sm text-foreground">
        Delete <span className="font-medium">{docTitle}</span>?
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button variant="ghost" size="sm" onClick={onCancel} disabled={deleting}>
        Cancel
      </Button>
      <Button variant="destructive" size="sm" onClick={handleConfirm} disabled={deleting}>
        {deleting ? 'Deleting…' : 'Delete'}
      </Button>
    </div>
  );
}
