'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRightLeft, ChevronRight, Loader2, Check, AlertCircle } from 'lucide-react';
import { Dialog, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { Task, TaskWithAssignee, Profile } from '@/lib/types';
import { useHaptics } from '@/components/HapticsProvider';
import { BUTTON_SPRING, DURATION_STATE_MS } from '@/lib/motion';

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

const DEPT_COLOR: Record<string, string> = {
  'Coding':         'text-emerald-400',
  'Visual Art':     'text-blue-300',
  'UI/UX':          'text-violet-300',
  'Animation':      'text-amber-400',
  'Asset Creation': 'text-pink-300',
};

/* Multi-state button: storyboard in @/lib/motion. Icon/label opacity-only for readability. */
type HandoffButtonState = 'idle' | 'loading' | 'success' | 'error';
const BUTTON_STATE = {
  idle:    { label: 'Hand Off Task',     Icon: ArrowRightLeft },
  loading: { label: 'Handing off…',      Icon: Loader2 },
  success: { label: 'Handed off',        Icon: Check },
  error:   { label: 'Try again',         Icon: AlertCircle },
} as const;
const SUCCESS_HOLD_MS = 700;

interface HandoffDialogProps {
  task: Task | TaskWithAssignee;
  team: Profile[];
  currentUserId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onHandoffComplete: (toUserId: string) => void;
}

export function HandoffDialog({
  task,
  team,
  currentUserId,
  open,
  onOpenChange,
  onHandoffComplete,
}: HandoffDialogProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [buttonState, setButtonState] = useState<HandoffButtonState>('idle');
  const { trigger } = useHaptics();

  const candidates = team.filter(m => m.id !== currentUserId && !m.is_investor);

  useEffect(() => {
    if (open) setButtonState('idle');
  }, [open]);

  const handleHandoff = useCallback(async () => {
    if (!selectedUserId) return;
    setButtonState('loading');
    try {
      const res = await fetch(`/api/tasks/${task.id}/handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserId: selectedUserId, note: note.trim() || undefined }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? 'Failed to hand off task');
        setButtonState('error');
        return;
      }

      trigger('success');
      toast.success('Task handed off successfully');
      setButtonState('success');
      setTimeout(() => {
        onHandoffComplete(selectedUserId);
        onOpenChange(false);
        setSelectedUserId(null);
        setNote('');
        setButtonState('idle');
      }, SUCCESS_HOLD_MS);
    } catch {
      toast.error('Something went wrong');
      setButtonState('error');
    }
  }, [selectedUserId, note, task.id, trigger, onHandoffComplete, onOpenChange]);

  const handleClose = useCallback(() => {
    if (buttonState === 'loading') return;
    onOpenChange(false);
    setSelectedUserId(null);
    setNote('');
    setButtonState('idle');
  }, [buttonState, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="z-[70]">
      <DialogClose onClose={handleClose} />
      <DialogHeader>
        <DialogTitle className="pr-8 flex items-center gap-2">
          <ArrowRightLeft className="size-5 text-muted-foreground shrink-0" />
          Hand Off Task
        </DialogTitle>
      </DialogHeader>

      <p className="text-sm text-muted-foreground mb-4">
        Reassign &quot;{task.name}&quot; to another team member and include context for them to continue.
      </p>

      <div className="space-y-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Hand off to</p>
          <ul className="rounded-lg border border-border bg-muted/20 divide-y divide-border max-h-48 overflow-y-auto">
            {candidates.length === 0 && (
              <li className="px-3 py-3 text-xs text-muted-foreground text-center">No other team members available.</li>
            )}
            {candidates.map(member => {
              const isSelected = selectedUserId === member.id;
              return (
                <li key={member.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedUserId(isSelected ? null : member.id)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                      isSelected
                        ? 'bg-seeko-accent/10 text-foreground'
                        : 'text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <Avatar className="size-7 shrink-0">
                      <AvatarImage src={member.avatar_url ?? undefined} alt={member.display_name ?? ''} />
                      <AvatarFallback className="text-[8px] bg-secondary">
                        {getInitials(member.display_name ?? '?')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left min-w-0">
                      <p className="font-medium truncate">{member.display_name}</p>
                      {member.department && (
                        <p className={`text-xs ${DEPT_COLOR[member.department] ?? 'text-muted-foreground'}`}>
                          {member.department}
                        </p>
                      )}
                    </div>
                    {isSelected && (
                      <ChevronRight className="size-4 text-seeko-accent shrink-0" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Context &amp; notes</p>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="What did you complete? What does the next person need to know?"
            rows={4}
            className="w-full resize-none rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30"
          />
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <motion.div
            animate={{
              scale: buttonState === 'success' ? 1.02 : 1,
              backgroundColor:
                buttonState === 'success'
                  ? 'var(--color-status-complete)'
                  : buttonState === 'error'
                    ? 'var(--color-status-blocked)'
                    : undefined,
            }}
            transition={BUTTON_SPRING}
            className="inline-block rounded-md"
          >
            <Button
              onClick={handleHandoff}
              disabled={!selectedUserId || buttonState === 'loading'}
              className={`min-w-[140px] gap-2 ${
                buttonState === 'success'
                  ? 'bg-[var(--color-status-complete)] text-[var(--color-background)] hover:opacity-90'
                  : buttonState === 'error'
                    ? 'bg-[var(--color-status-blocked)] text-white hover:opacity-90'
                    : ''
              }`}
            >
              <AnimatePresence mode="wait">
                {(() => {
                  const { label, Icon } = BUTTON_STATE[buttonState];
                  return (
                    <motion.span
                      key={buttonState}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: DURATION_STATE_MS / 1000 }}
                      className="inline-flex items-center gap-2"
                    >
                      {buttonState === 'loading' ? (
                        <Loader2 className="size-4 shrink-0 animate-spin" />
                      ) : (
                        <Icon className="size-4 shrink-0" />
                      )}
                      {label}
                    </motion.span>
                  );
                })()}
              </AnimatePresence>
            </Button>
          </motion.div>
          <Button variant="outline" onClick={handleClose} disabled={buttonState === 'loading'}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
