'use client';

/* ─────────────────────────────────────────────────────────
 * NOTIFICATIONS SETTINGS — ANIMATION STORYBOARD
 *
 *   mount   cards fade up with stagger (100ms between cards)
 *   level   selected card springs scale 0.98 → 1.0 (layoutId pill)
 *   toggle  switch channels on/off
 *   save    button → loading spinner → success toast
 *
 * Light Paper port: migrated dark→light to rejoin the design system. Built on the
 * canonical lightKit tokens (white `shadow-seeko` cards, #111/#505050/#808080 text
 * ladder, azure `#0d7aff` accent) so this preferences surface reads as the SAME
 * material as every other light app page — the shadcn Card/Switch primitives are
 * baked dark via @theme inline, so we compose plain light sections + an inline
 * azure toggle (the shadcn Switch thumb is a hardcoded dark `bg-background`).
 * ───────────────────────────────────────────────────────── */

import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { toast } from 'sonner';
import { Bell, BellOff, AtSign, AlertTriangle, CheckSquare, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { springs, TAB_PILL_SPRING } from '@/lib/motion';
import { CARD_TITLE, CARD_DESC, BTN_PRIMARY, LIGHT_FOCUS_RING } from '@/components/dashboard/lightKit';

const channels = [
  {
    id: 'tasks',
    label: 'Task Updates',
    description: 'Get notified when tasks are assigned, completed, or blocked.',
    icon: CheckSquare,
  },
  {
    id: 'docs',
    label: 'Document Changes',
    description: 'Notifications when documents are created or updated.',
    icon: FileText,
  },
  {
    id: 'security',
    label: 'Security Alerts',
    description: 'Critical security notifications and warnings.',
    icon: AlertTriangle,
  },
  {
    id: 'mentions',
    label: 'Mentions',
    description: 'When someone mentions you in a comment.',
    icon: AtSign,
  },
];

type NotifLevel = 'everything' | 'available' | 'ignoring';

const levels: { id: NotifLevel; label: string; description: string; icon: typeof Bell }[] = [
  { id: 'everything', label: 'Everything', description: 'Email digest, mentions & all activity.', icon: Bell },
  { id: 'available', label: 'Available', description: 'Only mentions and comments.', icon: AtSign },
  { id: 'ignoring', label: 'Ignoring', description: 'Turn off all notifications.', icon: BellOff },
];

// White surface lifted by the canonical shadow — the same material as every other
// light app card. `rounded-2xl` outer; inner rows nest at `rounded-xl` (concentric).
const PAPER_CARD = 'overflow-hidden rounded-2xl bg-white shadow-seeko';

export function NotificationsPanel() {
  const reduce = useReducedMotion();
  const pillTransition = reduce ? { duration: 0 } : TAB_PILL_SPRING;
  const [selectedLevel, setSelectedLevel] = useState<NotifLevel>('everything');
  const [channelState, setChannelState] = useState<Record<string, boolean>>({
    tasks: true,
    docs: true,
    security: true,
    mentions: false,
  });
  const [saving, setSaving] = useState(false);

  const toggleChannel = (id: string) => {
    setChannelState(prev => ({ ...prev, [id]: !prev[id] }));
  };

  async function handleSave() {
    setSaving(true);
    // Simulate save — replace with real API call when ready
    await new Promise(r => setTimeout(r, 600));
    setSaving(false);
    toast.success('Notification preferences saved');
  }

  // Summary of active channels
  const activeChannels = channels.filter(c => channelState[c.id]).map(c => c.label);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-[#111] text-balance">Notifications</h1>
        <p className="text-[13px] text-[#808080]">Choose what you want to be notified about.</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springs.snappy, delay: 0 }}
      >
        <section className={PAPER_CARD}>
          <div className="flex flex-col gap-5 p-6">
            <div className="flex flex-col gap-1">
              <h2 className={CARD_TITLE}>Notification Level</h2>
              <p className={CARD_DESC}>Set your overall notification preference.</p>
            </div>
            <div className="flex flex-col gap-2.5">
              {levels.map(level => {
                const active = selectedLevel === level.id;
                return (
                  <button
                    key={level.id}
                    type="button"
                    onClick={() => setSelectedLevel(level.id)}
                    className={cn(
                      'relative flex items-center gap-4 rounded-xl border p-4 text-left transition-[color,border-color,background-color,transform] duration-150 ease-out active:scale-[0.99]',
                      LIGHT_FOCUS_RING,
                      active
                        ? 'border-transparent'
                        : 'border-black/[0.06] hover:border-black/[0.12] hover:bg-black/[0.02]'
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="notifLevelPill"
                        initial={false}
                        transition={pillTransition}
                        className="absolute inset-0 rounded-xl border border-[#0d7aff]/30 bg-[#0d7aff]/[0.06]"
                      />
                    )}
                    <div className={cn(
                      'relative z-10 flex size-9 items-center justify-center rounded-lg transition-colors',
                      active ? 'bg-[#0a63cc]/10 text-[#0a63cc]' : 'bg-black/[0.04] text-[#808080]'
                    )}>
                      <level.icon className="size-4" />
                    </div>
                    <div className="relative z-10 flex-1">
                      <p className="text-sm font-medium text-[#111]">{level.label}</p>
                      <p className="text-xs text-[#808080]">{level.description}</p>
                    </div>
                    {active && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={springs.snappy}
                        className="relative z-10 size-2 rounded-full bg-[#0d7aff] shrink-0"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springs.snappy, delay: 0.1 }}
      >
        <section className={PAPER_CARD}>
          <div className="flex flex-col gap-5 p-6">
            <div className="flex flex-col gap-1">
              <h2 className={CARD_TITLE}>Channels</h2>
              <p className={CARD_DESC}>Fine-tune notifications for specific events.</p>
            </div>
            <div className="flex flex-col gap-1">
              {channels.map(channel => {
                const on = channelState[channel.id];
                return (
                  <div
                    key={channel.id}
                    className="flex items-center justify-between rounded-xl px-3 py-3 transition-colors hover:bg-black/[0.02]"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'flex size-8 items-center justify-center rounded-lg transition-colors',
                        on ? 'bg-[#0a63cc]/10 text-[#0a63cc]' : 'bg-black/[0.04] text-[#808080]'
                      )}>
                        <channel.icon className="size-3.5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#111]">{channel.label}</p>
                        <p className="text-xs text-[#808080]">{channel.description}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={channel.label}
                      onClick={() => toggleChannel(channel.id)}
                      className={cn(
                        'inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-150 ease-out',
                        LIGHT_FOCUS_RING,
                        on ? 'bg-[#0d7aff]' : 'bg-black/[0.14]'
                      )}
                    >
                      <span
                        className={cn(
                          'pointer-events-none block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-150 ease-out',
                          on ? 'translate-x-4' : 'translate-x-0'
                        )}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springs.snappy, delay: 0.2 }}
        className="flex items-center justify-between gap-3"
      >
        <p className="text-[13px] text-[#808080]">
          {activeChannels.length > 0
            ? `Receiving: ${activeChannels.join(', ')}`
            : 'All channels muted'}
        </p>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={cn(
            BTN_PRIMARY,
            LIGHT_FOCUS_RING,
            'inline-flex min-h-[2.25rem] min-w-[8rem] items-center justify-center gap-2 disabled:opacity-50'
          )}
        >
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </motion.div>
    </div>
  );
}
