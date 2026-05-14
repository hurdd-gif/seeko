'use client';

import { useState } from 'react';
import { toast } from 'sonner';

export function RailQuickNote() {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const body = value.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error('post failed');
      setValue('');
    } catch {
      toast.error('Could not save note');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 py-3.5">
      <p className="mb-2 text-xs text-muted-foreground">Quick note</p>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        disabled={busy}
        placeholder="Drop a thought…"
        className="w-full border-b border-border bg-transparent py-1 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground/40"
      />
    </div>
  );
}
