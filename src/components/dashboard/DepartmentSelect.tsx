'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Department } from '@/lib/types';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useHaptics } from '@/components/HapticsProvider';

const DEPARTMENTS: Department[] = ['Coding', 'Visual Art', 'UI/UX', 'Animation', 'Asset Creation'];

const DEPT_COLOR: Record<string, string> = {
  'Coding':         'text-emerald-400',
  'Visual Art':     'text-blue-300',
  'UI/UX':          'text-violet-300',
  'Animation':      'text-amber-400',
  'Asset Creation': 'text-pink-300',
};

interface Props {
  userId: string;
  department?: string;
}

export function DepartmentSelect({ userId, department }: Props) {
  const [value, setValue] = useState(department ?? '');
  const { trigger } = useHaptics();
  const [isPending, startTransition] = useTransition();

  async function handleChange(next: string) {
    const prev = value;
    setValue(next);
    startTransition(async () => {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, department: next }),
      });
      if (!res.ok) {
        setValue(prev);
        toast.error('Failed to update department');
        trigger('error');
      } else {
        toast.success(`Department updated to ${next}`);
        trigger('success');
      }
    });
  }

  return (
    <Select
      value={value}
      onChange={e => handleChange(e.target.value)}
      disabled={isPending}
      className={cn(
        'h-auto py-0.5 px-1.5 text-xs bg-transparent border border-transparent hover:border-border hover:bg-muted',
        isPending && 'opacity-50',
        DEPT_COLOR[value] ?? 'text-muted-foreground',
      )}
    >
      {!value && <option value="">No department</option>}
      {DEPARTMENTS.map(d => (
        <option key={d} value={d}>{d}</option>
      ))}
    </Select>
  );
}
