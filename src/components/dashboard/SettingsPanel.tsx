'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { revalidateDashboard } from '@/app/(dashboard)/settings/actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Camera, Check, Eye, MousePointer, Monitor, UserX, AlertTriangle, RotateCcw, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { Profile, UserEvent, Payment } from '@/lib/types';
import { useHaptics } from '@/components/HapticsProvider';
import { useTour } from '@/components/ui/tour';
import { PaymentRequestDialog } from '@/components/dashboard/PaymentRequestDialog';
import { cn } from '@/lib/utils';

const COMMON_TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Anchorage', 'Pacific/Honolulu', 'America/Toronto', 'America/Vancouver',
  'America/Sao_Paulo', 'America/Argentina/Buenos_Aires', 'America/Mexico_City',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Amsterdam',
  'Europe/Moscow', 'Europe/Istanbul', 'Asia/Dubai', 'Asia/Kolkata',
  'Asia/Bangkok', 'Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo',
  'Asia/Seoul', 'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland',
];

function formatTzLabel(tz: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
    const parts = formatter.formatToParts(now);
    const offset = parts.find(p => p.type === 'timeZoneName')?.value ?? '';
    const city = tz.split('/').pop()?.replace(/_/g, ' ') ?? tz;
    return `${city} (${offset})`;
  } catch {
    return tz;
  }
}

function looksLikeEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());
}

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const EVENT_ICONS: Record<string, { icon: typeof Eye; className: string; label: string }> = {
  page_view: { icon: Eye, className: 'text-blue-400', label: 'viewed' },
  click: { icon: MousePointer, className: 'text-amber-400', label: 'clicked' },
  navigate: { icon: Eye, className: 'text-seeko-accent', label: 'navigated' },
  select: { icon: MousePointer, className: 'text-purple-400', label: 'selected' },
  input: { icon: MousePointer, className: 'text-purple-400', label: 'interacted' },
};

const PAGE_NAMES: Record<string, string> = {
  '/': 'Overview',
  '/tasks': 'Tasks',
  '/team': 'Team',
  '/docs': 'Documents',
  '/settings': 'Settings',
};

function friendlyPage(path: string | undefined): string {
  if (!path) return '';
  return PAGE_NAMES[path] || path;
}

interface SettingsPanelProps {
  profile: Profile;
  isAdmin: boolean;
  team: Profile[];
  /** When provided (e.g. investor settings), called instead of revalidateDashboard after save. */
  revalidate?: () => Promise<void>;
}

export function SettingsPanel({ profile, isAdmin, team, revalidate }: SettingsPanelProps) {
  const router = useRouter();
  const { trigger } = useHaptics();
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? '');
  const [timezone, setTimezone] = useState(profile.timezone ?? 'America/New_York');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const [events, setEvents] = useState<(UserEvent & { profiles?: Pick<Profile, 'display_name' | 'avatar_url'> })[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [selectedUser, setSelectedUser] = useState('all');

  const [bootTarget, setBootTarget] = useState<Profile | null>(null);
  const [bootPassword, setBootPassword] = useState('');
  const [bootLoading, setBootLoading] = useState(false);
  const [bootError, setBootError] = useState('');
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [myPayments, setMyPayments] = useState<Payment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');

    const ext = file.name.split('.').pop();
    const path = `${profile.id}/avatar.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });

    if (uploadErr) {
      setError('Failed to upload avatar.');
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
    setUploading(false);
  }

  async function handleSave() {
    if (!displayName.trim()) {
      setError('Display name is required.');
      return;
    }
    if (looksLikeEmail(displayName)) {
      setError('Display name cannot be an email address.');
      return;
    }

    setSaving(true);
    setError('');

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim(),
        avatar_url: avatarUrl
          ? `${avatarUrl.split('?')[0]}?v=${Date.now()}`
          : null,
        timezone,
      })
      .eq('id', profile.id);

    if (updateErr) {
      setError('Failed to save. Please try again.');
      setSaving(false);
      toast.error('Failed to save changes');
      trigger('error');
      return;
    }

    if (revalidate) await revalidate();
    else await revalidateDashboard();
    setSaving(false);
    setSaved(true);
    toast.success('Changes saved');
    trigger('success');
    router.refresh();
    setTimeout(() => setSaved(false), 2000);
  }

  const loadMyPayments = useCallback(async () => {
    setLoadingPayments(true);
    try {
      const res = await fetch('/api/payments/mine');
      if (res.ok) {
        const data = await res.json();
        setMyPayments(data);
      }
    } catch {
      // Non-critical
    } finally {
      setLoadingPayments(false);
    }
  }, []);

  useEffect(() => {
    loadMyPayments();
  }, [loadMyPayments]);

  const loadEvents = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingEvents(true);

    let query = supabase
      .from('user_events')
      .select('*, profiles(display_name, avatar_url)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (selectedUser !== 'all') {
      query = query.eq('user_id', selectedUser);
    }

    const { data } = await query;
    setEvents((data ?? []) as (UserEvent & { profiles?: Pick<Profile, 'display_name' | 'avatar_url'> })[]);
    setLoadingEvents(false);
  }, [isAdmin, selectedUser, supabase]);

  useEffect(() => {
    if (isAdmin) loadEvents();
  }, [isAdmin, loadEvents]);

  async function handleBoot() {
    if (!bootTarget || !bootPassword) return;
    setBootLoading(true);
    setBootError('');

    const res = await fetch('/api/admin/boot-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: bootTarget.id, password: bootPassword }),
    });

    const data = await res.json();
    setBootLoading(false);

    if (!res.ok) {
      setBootError(data.error ?? 'Failed to remove member.');
      return;
    }

    toast.success(`${bootTarget.display_name ?? 'Member'} has been removed.`);
    trigger('success');
    setBootTarget(null);
    setBootPassword('');
    router.refresh();
  }



  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile and preferences.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update your display name, photo, and timezone.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <div className="relative group">
              <Avatar className="size-16 border-2 border-border">
                {avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt={displayName} />
                ) : (
                  <AvatarFallback className="text-lg bg-secondary text-foreground">
                    {getInitials(displayName)}
                  </AvatarFallback>
                )}
              </Avatar>
              <label className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="size-4 text-white" />
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                  disabled={uploading}
                />
              </label>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">{profile.display_name}</p>
              {profile.email && <p className="text-xs text-muted-foreground">{profile.email}</p>}
              <p className="text-xs text-muted-foreground mt-0.5">
                {uploading ? 'Uploading...' : 'Hover photo to change'}
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="display-name">Display Name</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                id="timezone"
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
                searchable
              >
                {COMMON_TIMEZONES.map(tz => (
                  <option key={tz} value={tz}>{formatTzLabel(tz)}</option>
                ))}
                {!COMMON_TIMEZONES.includes(timezone) && (
                  <option value={timezone}>{formatTzLabel(timezone)}</option>
                )}
              </Select>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="gap-2 min-w-[7.5rem] min-h-[2.5rem] touch-manipulation"
            >
              {saved ? <><Check className="size-3.5" /> Saved</> : saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Payments */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="size-4 text-muted-foreground" />
              <div>
                <CardTitle>Payments</CardTitle>
                <CardDescription>Your payment requests and history.</CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRequestDialogOpen(true)}
              className="gap-1.5 shrink-0"
            >
              <DollarSign className="size-3.5" />
              Request Payment
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingPayments ? (
            <p className="text-xs text-muted-foreground text-center py-6">Loading payments...</p>
          ) : myPayments.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No payment history yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border max-h-[300px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {myPayments.map(payment => (
                <div key={payment.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {payment.description || `Payment #${payment.id.slice(0, 8)}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(payment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-medium text-foreground">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(payment.amount))}
                    </span>
                    <Badge
                      variant={payment.status === 'cancelled' ? 'destructive' : payment.status === 'pending' ? 'outline' : 'default'}
                      className={cn("text-[10px] py-0 px-1.5", payment.status === 'paid' && "bg-emerald-500/15 text-emerald-400 border-emerald-500/20")}
                    >
                      {payment.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <PaymentRequestDialog
        open={requestDialogOpen}
        onOpenChange={setRequestDialogOpen}
        onCreated={loadMyPayments}
      />

      <ReplayTourCard userId={profile.id} />

      {isAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Monitor className="size-4 text-muted-foreground" />
              <div className="flex-1">
                <CardTitle>User Activity</CardTitle>
                <CardDescription>Track what non-admin users view and interact with.</CardDescription>
              </div>
              <Select
                value={selectedUser}
                onChange={e => setSelectedUser(e.target.value)}
                className="w-44"
              >
                <option value="all">All users</option>
                {team.map(m => (
                  <option key={m.id} value={m.id}>{m.display_name ?? 'Unknown'}{m.is_admin ? ' (admin)' : ''}</option>
                ))}
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loadingEvents ? (
              <p className="text-xs text-muted-foreground text-center py-6">Loading activity...</p>
            ) : events.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No activity recorded yet.</p>
            ) : (
              <div className="max-h-[420px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex flex-col">
                  {events.map((event, i) => {
                    const cfg = EVENT_ICONS[event.event_type] ?? EVENT_ICONS.click;
                    const Icon = cfg.icon;
                    const userName = event.profiles?.display_name ?? 'Unknown';
                    const meta = event.metadata as Record<string, string> | undefined;

                    return (
                      <div key={event.id}>
                        <div className="flex items-start gap-3 py-2.5">
                          <div className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary ${cfg.className}`}>
                            <Icon className="size-3" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">{userName}</span>
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                                {cfg.label}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {event.event_type === 'page_view' ? (
                                <>Viewed <span className="font-medium text-foreground/70">{friendlyPage(event.page)}</span></>
                              ) : event.event_type === 'navigate' ? (
                                <>
                                  Went to <span className="font-medium text-foreground/70">{meta?.href ? friendlyPage(meta.href) : event.target}</span>
                                  <span className="text-muted-foreground/50"> from {friendlyPage(event.page)}</span>
                                </>
                              ) : (
                                <>
                                  {cfg.label === 'clicked' ? 'Pressed' : cfg.label.charAt(0).toUpperCase() + cfg.label.slice(1)}{' '}
                                  <span className="font-medium text-foreground/70">&quot;{event.target}&quot;</span>
                                  <span className="text-muted-foreground/50"> on {friendlyPage(event.page)}</span>
                                </>
                              )}
                            </p>
                          </div>
                          <span className="text-[11px] text-muted-foreground/60 shrink-0 whitespace-nowrap">
                            {timeAgo(event.created_at)}
                          </span>
                        </div>
                        {i < events.length - 1 && <Separator />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Boot member dialog */}
      {bootTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="size-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Remove member</p>
                <p className="text-xs text-muted-foreground">
                  This will permanently remove <span className="font-medium text-foreground">{bootTarget.display_name ?? bootTarget.email}</span> from the team.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="boot-password">Confirm with your password</Label>
                <Input
                  id="boot-password"
                  type="password"
                  placeholder="Your password"
                  value={bootPassword}
                  onChange={e => { setBootPassword(e.target.value); setBootError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleBoot()}
                  autoFocus
                />
              </div>
              {bootError && <p className="text-xs text-destructive">{bootError}</p>}
            </div>

            <div className="flex gap-2 mt-5">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setBootTarget(null); setBootPassword(''); setBootError(''); }}
                disabled={bootLoading}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleBoot}
                disabled={bootLoading || !bootPassword}
              >
                {bootLoading ? 'Removing…' : 'Remove member'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Team Management — admin only */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserX className="size-4 text-muted-foreground" />
              <div>
                <CardTitle>Team Management</CardTitle>
                <CardDescription>Remove members from the team. This action is permanent.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {team.filter(m => m.id !== profile.id).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No other team members.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {team.filter(m => m.id !== profile.id).map(member => (
                  <div key={member.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="size-8 shrink-0">
                        {member.avatar_url && <AvatarImage src={member.avatar_url} alt={member.display_name ?? ''} />}
                        <AvatarFallback className="text-xs bg-secondary text-foreground">
                          {getInitials(member.display_name ?? '?')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {member.display_name ?? 'Unknown'}
                          {member.is_admin && <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">(admin)</span>}
                        </p>
                        {member.email && <p className="text-xs text-muted-foreground truncate">{member.email}</p>}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => { setBootTarget(member); setBootPassword(''); setBootError(''); }}
                    >
                      <UserX className="size-3.5 mr-1.5" />
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sign out — mobile only (desktop uses sidebar) */}
      <div className="md:hidden mb-12">
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="w-full rounded-lg border border-destructive/40 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

function ReplayTourCard({ userId }: { userId: string }) {
  const { setIsTourCompleted, startTour, isTourCompleted } = useTour();
  const [replaying, setReplaying] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function handleReplay() {
    setReplaying(true);
    await supabase.from('profiles').update({ tour_completed: 0 }).eq('id', userId);
    setIsTourCompleted(false);
    // Small delay so TourProvider picks up the new state
    setTimeout(() => {
      startTour();
      setReplaying(false);
    }, 100);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Onboarding Tour</CardTitle>
            <CardDescription>Replay the guided tour to revisit key features.</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReplay}
            disabled={replaying}
            className="gap-1.5 shrink-0"
          >
            <RotateCcw className="size-3.5" />
            {replaying ? 'Starting...' : 'Replay Tour'}
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}
