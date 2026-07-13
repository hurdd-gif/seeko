'use client';

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Create Task Modal
 *
 *  Open      BACKDROP opacity 0→1 over 180ms ease-out
 *            CARD     opacity 0→1 · scale .97→1 (center anchor, no y-drop)
 *                     spring: visualDuration .22 · bounce .10
 *  Close     CARD LEADS · BACKDROP TRAILS (inverse of open)
 *            t=0    card scale 1→.94 · opacity 1→0, 160ms ease-in
 *                   (perceivable recede — no more flicker-out)
 *            t=60   backdrop opacity 1→0, 160ms ease-in
 *                   (dim resolves AFTER card has departed)
 *  Inside    ThemedSelect + DatePicker popovers ride the canonical
 *            DROPDOWN shell spec (top-center origin since they expand down)
 *  Reduced   prefers-reduced-motion → opacity-only 120ms throughout
 *  Submit    button shows ‘Creating…’; modal closes on success
 *
 *  All specs come from @/lib/motion (MODAL + DROPDOWN). Don't re-inline.
 * ───────────────────────────────────────────────────────── */

import { useState, useTransition, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X, Check, ChevronDown, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { springs, modalBackdropEntrance, modalCardEntrance, shellEntrance, MODAL } from '@/lib/motion';
import { createTask, type CreateTaskInput } from '@/lib/dashboard-actions';
import { issueCreatedToast } from './tasks/issueCreatedToast';
import type { Department, Priority } from '@/lib/types';

const SNAPPY = springs.snappy;

const DEPARTMENTS: Department[] = ['Coding', 'Visual Art', 'UI/UX', 'Animation', 'Asset Creation'];
const PRIORITIES: Priority[] = ['Urgent', 'High', 'Medium', 'Low'];

type ModalTeamMember = { id: string; display_name?: string | null };
type ModalArea = { id: string; name: string };

interface CreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  team: ModalTeamMember[];
  areas: ModalArea[];
}

export function CreateTaskModal({ open, onClose, team, areas }: CreateTaskModalProps) {
  const [name, setName] = useState('');
  const [department, setDepartment] = useState<Department>('Coding');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [areaId, setAreaId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [deadline, setDeadline] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => nameInputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isPending) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, isPending]);

  function reset() {
    setName('');
    setDepartment('Coding');
    setPriority('Medium');
    setAreaId('');
    setAssigneeId('');
    setDeadline('');
    setDescription('');
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Task name is required');
      return;
    }
    setError(null);
    const payload: CreateTaskInput = {
      name,
      department,
      priority,
      area_id: areaId || undefined,
      assignee_id: assigneeId || undefined,
      deadline: deadline || undefined,
      description: description || undefined,
    };
    startTransition(async () => {
      try {
        const created = await createTask(payload);
        issueCreatedToast(created);
        reset();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create task');
      }
    });
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            {...modalBackdropEntrance(reduce)}
            onClick={() => !isPending && onClose()}
            className="fixed inset-0 z-[60] bg-[#1a1a1a]/25 dark:bg-black/40 backdrop-blur-sm"
          />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 md:p-10 pointer-events-none">
            <motion.div
              {...modalCardEntrance(reduce)}
              style={{ transformOrigin: MODAL.card.transformOrigin }}
              className="pointer-events-auto w-full max-w-md rounded-2xl bg-surface-1 shadow-seeko"
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-task-title"
            >
              <div className="flex items-center justify-between px-5 py-4">
                <h2 id="create-task-title" className="text-sm font-medium text-ink-title">New task</h2>
                <button
                  type="button"
                  onClick={() => !isPending && onClose()}
                  className="flex size-7 items-center justify-center rounded-lg text-ink-muted hover:text-ink-title hover:bg-wash-4 transition-colors"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="mx-5 h-px bg-wash-5" />

              <form onSubmit={handleSubmit} className="px-5 pb-5 pt-4 space-y-4">
                <Field label="Name">
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="What needs to get done?"
                    className="w-full rounded-lg bg-wash-4 px-3 py-2.5 text-sm text-ink-title placeholder:text-ink-faintest focus:outline-none focus:bg-[#00000012] transition-colors"
                    style={{ boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.08)' }}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Department">
                    <ThemedSelect
                      value={department}
                      onChange={(v) => setDepartment(v as Department)}
                      options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
                    />
                  </Field>
                  <Field label="Priority">
                    <ThemedSelect
                      value={priority}
                      onChange={(v) => setPriority(v as Priority)}
                      options={PRIORITIES.map((p) => ({ value: p, label: p }))}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Area">
                    <ThemedSelect
                      value={areaId}
                      onChange={setAreaId}
                      placeholder="None"
                      options={[{ value: '', label: 'None' }, ...areas.map((a) => ({ value: a.id, label: a.name }))]}
                    />
                  </Field>
                  <Field label="Assignee">
                    <ThemedSelect
                      value={assigneeId}
                      onChange={setAssigneeId}
                      placeholder="Unassigned"
                      options={[{ value: '', label: 'Unassigned' }, ...team.map((m) => ({ value: m.id, label: m.display_name ?? 'Unnamed' }))]}
                    />
                  </Field>
                </div>

                <Field label="Deadline">
                  <ThemedDatePicker value={deadline} onChange={setDeadline} />
                </Field>

                <Field label="Description">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional context, links, acceptance criteria…"
                    rows={3}
                    className="w-full rounded-lg bg-wash-4 px-3 py-2.5 text-sm text-ink-title placeholder:text-ink-faintest focus:outline-none focus:bg-[#00000012] transition-colors resize-none"
                    style={{ boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.08)' }}
                  />
                </Field>

                {error && (
                  <p className="text-xs text-[#e5484d]">{error}</p>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => !isPending && onClose()}
                    className="rounded-lg px-3 py-2 text-sm text-ink-muted hover:text-ink-title hover:bg-wash-4 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending || !name.trim()}
                    className="flex items-center justify-center rounded-full bg-[#7ec3fa] px-4 py-2 text-sm font-medium text-white tracking-[-0.02em] transition-[transform,background-color] duration-100 ease-out hover:bg-[#00a1ff] hover:scale-[1.02] active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-[#7ec3fa]"
                  >
                    {isPending ? 'Creating…' : 'Create task'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

type ThemedSelectOption = { value: string; label: string };

function ThemedSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ThemedSelectOption[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (
        listRef.current && !listRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg bg-wash-4 px-3 py-2.5 text-sm text-ink-title focus:outline-none hover:bg-[#00000012] transition-colors"
        style={{ boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.08)' }}
      >
        <span className={selected?.label ? '' : 'text-ink-faintest'}>
          {selected?.label || placeholder || 'Select'}
        </span>
        <ChevronDown className={`size-4 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={listRef}
            role="listbox"
            {...shellEntrance(reduce)}
            style={{ transformOrigin: 'top center' }}
            className="absolute inset-x-0 top-full z-[80] mt-1.5 max-h-60 overflow-y-auto rounded-[14px] bg-overlay p-1 shadow-seeko-pop"
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value || '__empty'}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={`flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-left text-[13px] transition-colors ${
                    isSelected
                      ? 'bg-seeko-accent/[0.08] text-seeko-accent'
                      : 'text-ink-body hover:bg-wash-4 hover:text-ink-title'
                  }`}
                >
                  <span>{opt.label}</span>
                  {isSelected && <Check className="size-3.5" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseISO(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatDisplay(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ThemedDatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const selected = parseISO(value);
  const reduce = useReducedMotion();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [viewMonth, setViewMonth] = useState(() => {
    const base = selected ?? today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between rounded-lg bg-wash-4 px-3 py-2.5 text-sm text-ink-title focus:outline-none hover:bg-[#00000012] transition-colors"
        style={{ boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.08)' }}
      >
        <span className={selected ? '' : 'text-ink-faintest'}>
          {selected ? formatDisplay(selected) : 'No deadline'}
        </span>
        <Calendar className="size-4 text-ink-muted" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={popRef}
            {...shellEntrance(reduce)}
            style={{ transformOrigin: 'top center' }}
            className="absolute inset-x-0 top-full z-[80] mt-1.5 rounded-[14px] bg-overlay p-2.5 shadow-seeko-pop"
          >
            <div className="flex items-center justify-between px-1 pb-2">
              <button
                type="button"
                onClick={() => setViewMonth(new Date(year, month - 1, 1))}
                className="flex size-6 items-center justify-center rounded-md text-ink-muted hover:text-ink-title hover:bg-wash-4 transition-colors"
                aria-label="Previous month"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <span className="text-xs font-medium text-ink-title tabular-nums">
                {MONTHS[month]} {year}
              </span>
              <button
                type="button"
                onClick={() => setViewMonth(new Date(year, month + 1, 1))}
                className="flex size-6 items-center justify-center rounded-md text-ink-muted hover:text-ink-title hover:bg-wash-4 transition-colors"
                aria-label="Next month"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 px-0.5 pb-1">
              {WEEKDAYS.map((d, i) => (
                <span key={i} className="flex h-6 items-center justify-center text-[10px] font-medium text-ink-faintest">{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5 px-0.5">
              {cells.map((d, i) => {
                if (!d) return <span key={i} className="h-7" />;
                const iso = formatISO(d);
                const isSelected = iso === value;
                const isToday = d.getTime() === today.getTime();
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { onChange(iso); setOpen(false); }}
                    className={`flex h-7 items-center justify-center rounded-md text-xs tabular-nums transition-colors ${
                      isSelected
                        ? 'bg-seeko-accent text-white font-medium'
                        : isToday
                        ? 'text-seeko-accent font-medium hover:bg-seeko-accent/[0.08]'
                        : 'text-ink-body hover:bg-wash-4 hover:text-ink-title'
                    }`}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-wash-5 pt-2">
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); }}
                className="rounded-md px-2 py-1 text-xs text-ink-muted hover:text-ink-title hover:bg-wash-4 transition-colors"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => { onChange(formatISO(today)); setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setOpen(false); }}
                className="rounded-md px-2 py-1 text-xs text-ink-title hover:bg-wash-4 transition-colors"
              >
                Today
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
