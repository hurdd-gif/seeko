'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { revalidateDashboard } from '@/app/(dashboard)/settings/actions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Check, Eye, MousePointer, Monitor, UserX, AlertTriangle, RotateCcw, Vibrate, Lock, ChevronDown, ChevronLeft, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { Profile, UserEvent, Task, Payment } from '@/lib/types';
import { useHaptics } from '@/components/HapticsProvider';
import { useTourMaybe } from '@/components/ui/tour';
import { PaymentRequestDialog } from '@/components/dashboard/PaymentRequestDialog';
import { SecurityKeysPanel } from '@/components/dashboard/SecurityKeysPanel';
import { Dialog } from '@/components/ui/dialog';
import { LightShell } from '@/components/dashboard/LightShell';
import { FadeRise } from '@/components/motion';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { springs } from '@/lib/motion';

/* ── Light form-control class kits (shadcn primitives are dark-themed via
 * `@theme inline` tokens that bake literal hex into utilities at build time,
 * so a runtime token override can't relight them — we override per-element
 * via className, which twMerge resolves last-wins). ───────────────────── */
const LIGHT_INPUT =
  'border border-black/[0.08] bg-white text-[#2a2a2a] placeholder:text-[#b3b3b3] rounded-lg focus-visible:ring-2 focus-visible:ring-[#0d7aff]/30';
const BTN_BASE =
  'rounded-full px-4 h-9 text-[13px] font-medium transition-[background-color,transform] duration-150 ease-out active:scale-[0.98]';
const BTN_PRIMARY = `${BTN_BASE} bg-[#111] text-white hover:bg-[#2a2a2a]`;
const BTN_SECONDARY = `${BTN_BASE} bg-[#f4f4f4] text-[#2a2a2a] hover:bg-[#ececec]`;
const CARD_TITLE = 'text-[15px] font-semibold text-[#111]';
const CARD_DESC = 'text-[13px] text-[#808080]';
const HAIRLINE = 'h-px bg-black/[0.06]';

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
  page_view: { icon: Eye, className: 'text-blue-600', label: 'viewed' },
  click: { icon: MousePointer, className: 'text-amber-600', label: 'clicked' },
  navigate: { icon: Eye, className: 'text-[#0d7aff]', label: 'navigated' },
  select: { icon: MousePointer, className: 'text-[#808080]', label: 'selected' },
  input: { icon: MousePointer, className: 'text-[#808080]', label: 'interacted' },
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
  completedTasks?: Pick<Task, 'id' | 'name' | 'bounty'>[];
}

export function SettingsPanel({ profile, isAdmin, team, revalidate, completedTasks }: SettingsPanelProps) {
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
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [myPayments, setMyPayments] = useState<Payment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [paypalEmail, setPaypalEmail] = useState(profile.paypal_email ?? '');
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

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
    // Append cache-busting param so browser/CDN serves the fresh upload
    setAvatarUrl(`${data.publicUrl}?v=${Date.now()}`);
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
        paypal_email: paypalEmail.trim() || null,
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

  async function handleChangePassword() {
    setPwError('');
    setPwSuccess(false);
    if (!currentPassword) { setPwError('Current password is required.'); return; }
    if (newPassword.length < 8) { setPwError('New password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match.'); return; }

    setPwSaving(true);
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u?.email) { setPwError('Could not determine your email.'); setPwSaving(false); return; }

    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: u.email, password: currentPassword });
    if (signInErr) { setPwError('Current password is incorrect.'); setPwSaving(false); trigger('error'); return; }

    const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
    if (updateErr) { setPwError(updateErr.message); setPwSaving(false); trigger('error'); return; }

    setPwSaving(false);
    setPwSuccess(true);
    setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    toast.success('Password updated');
    trigger('success');
    setTimeout(() => setPwSuccess(false), 3000);
  }

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

  const loadMyPayments = useCallback(async () => {
    setLoadingPayments(true);
    try {
      const res = await fetch('/api/payments/mine');
      if (res.ok) {
        const data = await res.json();
        setMyPayments(data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingPayments(false);
    }
  }, []);

  useEffect(() => {
    if (!profile.is_investor) loadMyPayments();
  }, [profile.is_investor, loadMyPayments]);

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
    <LightShell
      fill
      bordered
      leftSlot={
        <Link
          href="/"
          className="flex items-center gap-1 text-[13px] text-[#9a9a9a] transition-colors hover:text-[#3a3a3a]"
        >
          <ChevronLeft className="size-3.5" />
          <span>Settings</span>
        </Link>
      }
    >
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-10">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-[#111]">Settings</h1>
            <p className="text-[13px] text-[#808080]">Manage your profile and preferences.</p>
          </div>

          {/* ── Account ────────────────────────────────────── */}
          <FadeRise y={8} delay={0.06}>
            <section className="flex flex-col gap-4">
              <h2 className="text-[13px] font-medium text-[#808080]">Account</h2>

              <section className="overflow-hidden rounded-2xl bg-white shadow-seeko">
                <div className="flex flex-col gap-6 p-6">
                  <div className="flex flex-col gap-1.5">
                    <h3 className={CARD_TITLE}>Profile</h3>
                    <p className={CARD_DESC}>Update your display name, photo, and timezone.</p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="relative group">
                      <Avatar className="size-16 outline outline-1 -outline-offset-1 outline-black/10">
                        {avatarUrl ? (
                          <AvatarImage src={avatarUrl} alt={displayName} />
                        ) : (
                          <AvatarFallback className="text-lg bg-[#ececec] text-[#505050]">
                            {getInitials(displayName)}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <label className={cn(
                        "absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/50 transition-opacity",
                        isTouchDevice ? "opacity-0 active:opacity-100" : "opacity-0 group-hover:opacity-100"
                      )}>
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
                      <p className="text-sm font-medium text-[#111]">{profile.display_name}</p>
                      {profile.email && <p className="text-xs text-[#808080]">{profile.email}</p>}
                      <p className="text-xs text-[#808080] mt-0.5">
                        {uploading ? 'Uploading...' : isTouchDevice ? 'Tap photo to change' : 'Hover photo to change'}
                      </p>
                    </div>
                  </div>

                  <div className={HAIRLINE} />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="display-name">Display Name</Label>
                      <Input
                        id="display-name"
                        value={displayName}
                        onChange={e => setDisplayName(e.target.value)}
                        placeholder="Your name"
                        className={LIGHT_INPUT}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timezone">Timezone</Label>
                      <Select
                        id="timezone"
                        value={timezone}
                        onChange={e => setTimezone(e.target.value)}
                        searchable
                        light
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

                  {error && <p className="text-sm text-[#d4503e]">{error}</p>}

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className={cn(BTN_PRIMARY, 'inline-flex items-center justify-center gap-2 min-w-[7.5rem] min-h-[2.5rem] touch-manipulation disabled:opacity-50')}
                    >
                      {saved ? <><Check className="size-3.5" /> Saved</> : saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>

                  <div className={HAIRLINE} />

                  <button
                    type="button"
                    className="flex items-center gap-2 w-full text-left"
                    onClick={() => setPwOpen(v => !v)}
                  >
                    <Lock className="size-4 text-[#808080]" />
                    <p className="text-sm font-medium text-[#111] flex-1">Change Password</p>
                    <ChevronDown className={cn("size-4 text-[#808080] transition-transform duration-200", pwOpen && "rotate-180")} />
                  </button>

                  <AnimatePresence>
                    {pwOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={springs.heavy}
                        className="overflow-hidden"
                      >
                        <div className="flex flex-col gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="current-password">Current Password</Label>
                            <Input
                              id="current-password"
                              type="password"
                              value={currentPassword}
                              onChange={e => { setCurrentPassword(e.target.value); setPwError(''); }}
                              placeholder="Enter current password"
                              className={LIGHT_INPUT}
                            />
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="new-password">New Password</Label>
                              <Input
                                id="new-password"
                                type="password"
                                value={newPassword}
                                onChange={e => { setNewPassword(e.target.value); setPwError(''); }}
                                placeholder="At least 8 characters"
                                className={LIGHT_INPUT}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="confirm-password">Confirm New Password</Label>
                              <Input
                                id="confirm-password"
                                type="password"
                                value={confirmPassword}
                                onChange={e => { setConfirmPassword(e.target.value); setPwError(''); }}
                                placeholder="Re-enter new password"
                                onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
                                className={LIGHT_INPUT}
                              />
                            </div>
                          </div>
                          {pwError && <p className="text-sm text-[#d4503e]">{pwError}</p>}
                          {pwSuccess && <p className="text-sm text-[#0d7aff]">Password updated successfully.</p>}
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={handleChangePassword}
                              disabled={pwSaving}
                              className={cn(BTN_PRIMARY, 'inline-flex items-center justify-center gap-2 min-w-[7.5rem] min-h-[2.5rem] touch-manipulation disabled:opacity-50')}
                            >
                              {pwSaving ? 'Updating...' : 'Update Password'}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Sign out — mobile only */}
                  <div className="md:hidden">
                    <div className={HAIRLINE} />
                    <form action="/auth/signout" method="post" className="pt-4">
                      <button
                        type="submit"
                        className="flex items-center gap-2 text-sm text-[#d4503e] hover:text-[#b8402f] transition-colors"
                      >
                        <LogOut className="size-4" />
                        Sign out
                      </button>
                    </form>
                  </div>
                </div>
              </section>

              <ReplayTourCard userId={profile.id} />

              <HapticsToggleCard />
            </section>
          </FadeRise>

          {/* ── Payments ───────────────────────────────────── */}
          {!profile.is_investor && (
            <FadeRise y={8} delay={0.1}>
              <section className="flex flex-col gap-4">
                <h2 className="text-[13px] font-medium text-[#808080]">Payments</h2>

                <section className="overflow-hidden rounded-2xl bg-white shadow-seeko">
                  <div className="flex flex-col gap-5 p-6">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-col gap-1.5">
                        <h3 className={CARD_TITLE}>Payment History</h3>
                        <p className={CARD_DESC}>Request payment and view your history.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRequestDialogOpen(true)}
                        className={cn(BTN_SECONDARY, 'inline-flex shrink-0 items-center justify-center gap-1.5')}
                      >
                        Request Payment
                      </button>
                    </div>

                    {/* PayPal email — editable */}
                    <div className="space-y-2">
                      <Label htmlFor="paypal-email">PayPal Email</Label>
                      <div className="flex gap-2">
                        <Input
                          id="paypal-email"
                          type="email"
                          value={paypalEmail}
                          onChange={e => setPaypalEmail(e.target.value)}
                          placeholder="your@paypal.email"
                          className={cn(LIGHT_INPUT, 'flex-1')}
                        />
                      </div>
                      {!paypalEmail.trim() && (
                        <p className="text-xs text-[#b8860b]">Set your PayPal email to receive payments.</p>
                      )}
                    </div>

                    <div className={HAIRLINE} />

                    {loadingPayments ? (
                      <p className="text-xs text-[#808080] text-center py-4">Loading...</p>
                    ) : myPayments.length === 0 ? (
                      <EmptyState
                        icon="DollarSign"
                        title="No payment requests yet"
                        description="Submit a request after completing tasks with bounties."
                        action={
                          <button
                            type="button"
                            onClick={() => setRequestDialogOpen(true)}
                            className={cn(BTN_SECONDARY, 'inline-flex items-center justify-center')}
                          >
                            Request Payment
                          </button>
                        }
                        className="py-8"
                      />
                    ) : (
                      <div className="flex flex-col divide-y divide-black/[0.06]">
                        {myPayments.slice(0, 10).map(payment => (
                          <div key={payment.id} className="flex items-center justify-between py-3">
                            <div className="min-w-0">
                              <p className="text-sm text-[#111] truncate">
                                {payment.description || `${payment.items?.length ?? 0} items`}
                              </p>
                              <p className="text-xs text-[#808080]">
                                {new Date(payment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-sm font-medium font-mono tabular-nums text-[#111]">
                                {formatCurrency(Number(payment.amount))}
                              </span>
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full text-[10px] font-medium py-0.5 px-2",
                                  payment.status === 'paid' && "bg-[#0d7aff]/10 text-[#0d7aff]",
                                  payment.status === 'cancelled' && "bg-[#d4503e]/10 text-[#d4503e]",
                                  payment.status === 'pending' && "bg-black/[0.05] text-[#505050]"
                                )}
                              >
                                {payment.status === 'paid' ? 'Approved'
                                  : payment.status === 'cancelled' ? 'Denied'
                                  : 'Pending'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              </section>
            </FadeRise>
          )}

          <PaymentRequestDialog
            open={requestDialogOpen}
            onOpenChange={setRequestDialogOpen}
            paypalEmail={paypalEmail}
            completedTasks={(completedTasks ?? []) as Task[]}
            onSubmitted={() => {
              setRequestDialogOpen(false);
              loadMyPayments();
            }}
          />

          {/* ── Admin ──────────────────────────────────────── */}
          {isAdmin && (
            <FadeRise y={8} delay={0.14}>
              <section className="flex flex-col gap-4">
                <h2 className="text-[13px] font-medium text-[#808080]">Admin</h2>

                <section className="overflow-hidden rounded-2xl bg-white shadow-seeko">
                  <div className="flex flex-col gap-6 p-6">
                    <div className="flex items-center gap-2">
                      <Monitor className="size-4 text-[#808080]" />
                      <div className="flex flex-col gap-1.5 flex-1">
                        <h3 className={CARD_TITLE}>User Activity</h3>
                        <p className={CARD_DESC}>Track what non-admin users view and interact with.</p>
                      </div>
                      <Select
                        value={selectedUser}
                        onChange={e => setSelectedUser(e.target.value)}
                        className="w-44"
                        light
                      >
                        <option value="all">All users</option>
                        {team.map(m => (
                          <option key={m.id} value={m.id}>{m.display_name ?? 'Unknown'}{m.is_admin ? ' (admin)' : ''}</option>
                        ))}
                      </Select>
                    </div>
                    {loadingEvents ? (
                      <p className="text-xs text-[#808080] text-center py-6">Loading activity...</p>
                    ) : events.length === 0 ? (
                      <EmptyState
                        icon="Activity"
                        title="No activity recorded"
                        description="User interactions will appear here as team members use the app."
                        className="py-6"
                      />
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
                                  <div className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-black/[0.04] ${cfg.className}`}>
                                    <Icon className="size-3" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium text-[#111]">{userName}</span>
                                      <span className="inline-flex items-center rounded-full bg-black/[0.05] text-[10px] text-[#505050] py-0.5 px-2">
                                        {cfg.label}
                                      </span>
                                    </div>
                                    <p className="text-xs text-[#808080] mt-0.5">
                                      {event.event_type === 'page_view' ? (
                                        <>Viewed <span className="font-medium text-[#505050]">{friendlyPage(event.page)}</span></>
                                      ) : event.event_type === 'navigate' ? (
                                        <>
                                          Went to <span className="font-medium text-[#505050]">{meta?.href ? friendlyPage(meta.href) : event.target}</span>
                                          <span className="text-[#9a9a9a]"> from {friendlyPage(event.page)}</span>
                                        </>
                                      ) : (
                                        <>
                                          {cfg.label === 'clicked' ? 'Pressed' : cfg.label.charAt(0).toUpperCase() + cfg.label.slice(1)}{' '}
                                          <span className="font-medium text-[#505050]">&quot;{event.target}&quot;</span>
                                          <span className="text-[#9a9a9a]"> on {friendlyPage(event.page)}</span>
                                        </>
                                      )}
                                    </p>
                                  </div>
                                  <span className="text-[11px] text-[#9a9a9a] shrink-0 whitespace-nowrap">
                                    {timeAgo(event.created_at)}
                                  </span>
                                </div>
                                {i < events.length - 1 && <div className={HAIRLINE} />}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                <section className="overflow-hidden rounded-2xl bg-white shadow-seeko">
                  <div className="flex flex-col gap-6 p-6">
                    <div className="flex items-center gap-2">
                      <UserX className="size-4 text-[#808080]" />
                      <div className="flex flex-col gap-1.5">
                        <h3 className={CARD_TITLE}>Team Management</h3>
                        <p className={CARD_DESC}>Remove members from the team. This action is permanent.</p>
                      </div>
                    </div>
                    {team.filter(m => m.id !== profile.id).length === 0 ? (
                      <EmptyState
                        icon="Users"
                        title="No other team members"
                        description="Invite team members from the Team page."
                        className="py-4"
                      />
                    ) : (
                      <div className="flex flex-col divide-y divide-black/[0.06]">
                        {team.filter(m => m.id !== profile.id).map(member => (
                          <div key={member.id} className="flex items-center justify-between py-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <Avatar className="size-8 shrink-0 outline outline-1 -outline-offset-1 outline-black/10">
                                {member.avatar_url && <AvatarImage src={member.avatar_url} alt={member.display_name ?? ''} />}
                                <AvatarFallback className="text-xs bg-[#ececec] text-[#505050]">
                                  {getInitials(member.display_name ?? '?')}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-[#111] truncate">
                                  {member.display_name ?? 'Unknown'}
                                  {member.is_admin && <span className="ml-1.5 text-[10px] text-[#808080] font-normal">(admin)</span>}
                                </p>
                                {member.email && <p className="text-xs text-[#808080] truncate">{member.email}</p>}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="inline-flex shrink-0 items-center gap-1.5 rounded-full h-8 px-3 text-[13px] font-medium text-[#d4503e] transition-[background-color,transform] duration-150 ease-out hover:bg-[#d4503e]/10 active:scale-[0.98]"
                              onClick={() => { setBootTarget(member); setBootPassword(''); setBootError(''); }}
                            >
                              <UserX className="size-3.5" />
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <SecurityKeysPanel />
              </section>
            </FadeRise>
          )}

          {/* Boot member dialog — uses Dialog component (renders inline within .overview-light) */}
          <Dialog open={!!bootTarget} onOpenChange={open => { if (!open) { setBootTarget(null); setBootPassword(''); setBootError(''); } }} contentClassName="max-w-sm bg-white border-black/[0.06]">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#d4503e]/10">
                <AlertTriangle className="size-5 text-[#d4503e]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#111]">Remove member</p>
                <p className="text-xs text-[#808080]">
                  This will permanently remove <span className="font-medium text-[#111]">{bootTarget?.display_name ?? bootTarget?.email}</span> from the team.
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
                  className={LIGHT_INPUT}
                />
              </div>
              {bootError && <p className="text-xs text-[#d4503e]">{bootError}</p>}
            </div>

            <div className="flex gap-2 mt-5">
              <button
                type="button"
                className={cn(BTN_SECONDARY, 'flex-1 inline-flex items-center justify-center disabled:opacity-50')}
                onClick={() => { setBootTarget(null); setBootPassword(''); setBootError(''); }}
                disabled={bootLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className={cn(BTN_BASE, 'flex-1 inline-flex items-center justify-center bg-[#d4503e] text-white hover:bg-[#b8402f] disabled:opacity-50')}
                onClick={handleBoot}
                disabled={bootLoading || !bootPassword}
              >
                {bootLoading ? 'Removing…' : 'Remove member'}
              </button>
            </div>
          </Dialog>
        </div>
      </main>
    </LightShell>
  );
}

function ReplayTourCard({ userId }: { userId: string }) {
  const tour = useTourMaybe();
  if (!tour) return null;
  const { setIsTourCompleted, startTour } = tour;
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
    <section className="overflow-hidden rounded-2xl bg-white shadow-seeko">
      <div className="flex items-center justify-between gap-3 p-5">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[15px] font-semibold text-[#111]">Onboarding Tour</h3>
          <p className="text-[13px] text-[#808080]">Replay the guided tour to revisit key features.</p>
        </div>
        <button
          type="button"
          onClick={handleReplay}
          disabled={replaying}
          className={cn(BTN_SECONDARY, 'inline-flex shrink-0 items-center justify-center gap-1.5 disabled:opacity-50')}
        >
          <RotateCcw className="size-3.5" />
          {replaying ? 'Starting...' : 'Replay Tour'}
        </button>
      </div>
    </section>
  );
}

function HapticsToggleCard() {
  const { enabled, setEnabled, trigger } = useHaptics();

  return (
    <div className="md:hidden">
      <section className="overflow-hidden rounded-2xl bg-white shadow-seeko">
        <div className="flex items-center justify-between gap-3 p-5">
          <div className="flex items-center gap-2">
            <Vibrate className="size-4 text-[#808080]" />
            <div className="flex flex-col gap-1.5">
              <h3 className="text-[15px] font-semibold text-[#111]">Haptic Feedback</h3>
              <p className="text-[13px] text-[#808080]">Vibration feedback on taps and actions.</p>
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => {
              setEnabled(v);
              if (v) trigger('success');
            }}
            className={enabled ? 'bg-[#111]' : 'bg-black/[0.12]'}
          />
        </div>
      </section>
    </div>
  );
}
