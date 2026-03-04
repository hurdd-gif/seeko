'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Bell, BellOff, AtSign, AlertTriangle, CheckSquare, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  const toggleChannel = (id: string) => {
    setChannelState(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Notifications</h1>
        <p className="text-sm text-muted-foreground">Choose what you want to be notified about.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notification Level</CardTitle>
          <CardDescription>Set your overall notification preference.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            {levels.map(level => (
              <button
                key={level.id}
                onClick={() => setSelectedLevel(level.id)}
                className={cn(
                  'flex items-center gap-4 rounded-md border p-4 text-left transition-colors',
                  selectedLevel === level.id
                    ? 'border-foreground bg-secondary/50'
                    : 'border-border hover:border-foreground/20'
                )}
              >
                <level.icon className="size-5 text-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">{level.label}</p>
                  <p className="text-xs text-muted-foreground">{level.description}</p>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Channels</CardTitle>
          <CardDescription>Fine-tune notifications for specific events.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col">
            {channels.map((channel, i) => (
              <div key={channel.id}>
                <div className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <channel.icon className="size-4 text-muted-foreground" />
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
                {i < channels.length - 1 && <Separator />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button>Save Preferences</Button>
      </div>
    </div>
  );
}
