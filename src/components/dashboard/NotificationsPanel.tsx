'use client';

/* ─────────────────────────────────────────────────────────
 * NOTIFICATIONS SETTINGS — ANIMATION STORYBOARD
 *
 *   mount   cards fade up with stagger (100ms between cards)
 *   level   selected card springs scale 0.98 → 1.0
 *   toggle  switch channels on/off
 *   save    button → loading spinner → success toast
 * ───────────────────────────────────────────────────────── */

import { useState } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Bell, BellOff, AtSign, AlertTriangle, CheckSquare, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const SPRING = { type: 'spring' as const, stiffness: 500, damping: 30 };

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

export function NotificationsPanel() {
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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Notifications</h1>
        <p className="text-sm text-muted-foreground">Choose what you want to be notified about.</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING, delay: 0 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Notification Level</CardTitle>
            <CardDescription>Set your overall notification preference.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {levels.map(level => (
                <motion.button
                  key={level.id}
                  onClick={() => setSelectedLevel(level.id)}
                  animate={selectedLevel === level.id ? { scale: 1 } : { scale: 1 }}
                  whileTap={{ scale: 0.98 }}
                  transition={SPRING}
                  className={cn(
                    'flex items-center gap-4 rounded-lg border p-4 text-left transition-colors',
                    selectedLevel === level.id
                      ? 'border-foreground/20 bg-white/[0.06]'
                      : 'border-white/[0.08] hover:border-foreground/20 hover:bg-white/[0.03]'
                  )}
                >
                  <div className={cn(
                    'flex size-9 items-center justify-center rounded-lg transition-colors',
                    selectedLevel === level.id ? 'bg-seeko-accent/10 text-seeko-accent' : 'bg-secondary text-muted-foreground'
                  )}>
                    <level.icon className="size-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{level.label}</p>
                    <p className="text-xs text-muted-foreground">{level.description}</p>
                  </div>
                  {selectedLevel === level.id && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={SPRING}
                      className="size-2 rounded-full bg-seeko-accent shrink-0"
                    />
                  )}
                </motion.button>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING, delay: 0.1 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Channels</CardTitle>
            <CardDescription>Fine-tune notifications for specific events.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1">
              {channels.map(channel => (
                <div
                  key={channel.id}
                  className="flex items-center justify-between rounded-lg px-3 py-3 transition-colors hover:bg-white/[0.03]"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'flex size-8 items-center justify-center rounded-lg transition-colors',
                      channelState[channel.id] ? 'bg-seeko-accent/10 text-seeko-accent' : 'bg-secondary text-muted-foreground'
                    )}>
                      <channel.icon className="size-3.5" />
                    </div>
                    <div>
                      <Label htmlFor={channel.id} className="text-sm font-medium cursor-pointer">
                        {channel.label}
                      </Label>
                      <p className="text-xs text-muted-foreground">{channel.description}</p>
                    </div>
                  </div>
                  <Switch
                    id={channel.id}
                    checked={channelState[channel.id]}
                    onCheckedChange={() => toggleChannel(channel.id)}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING, delay: 0.2 }}
        className="flex items-center justify-between"
      >
        <p className="text-xs text-muted-foreground">
          {activeChannels.length > 0
            ? `Receiving: ${activeChannels.join(', ')}`
            : 'All channels muted'}
        </p>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          {saving ? 'Saving...' : 'Save Preferences'}
        </Button>
      </motion.div>
    </div>
  );
}
