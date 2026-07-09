'use client';

import { useState } from 'react';
import { useRouter } from '@/lib/react-router-adapters';
import { createBrowserClient } from '@supabase/ssr';
import { motion, AnimatePresence } from 'motion/react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Camera, Loader2, ArrowRight } from 'lucide-react';
import { springs, DURATION_STATE_MS } from '@/lib/motion';
import { useHaptics } from '@/components/HapticsProvider';
import { cn } from '@/lib/utils';
import { LIGHT_INPUT, BTN_PRIMARY, LIGHT_FOCUS_RING } from '@/components/dashboard/lightKit';

// Light Paper port: migrated dark→light to rejoin the design system. The dark
// shadcn Card → a white `shadow-seeko` surface; Input relit via LIGHT_INPUT;
// the searchable Select uses its `light` variant; the CTA is the canonical black
// pill. The gradient AvatarFallback, the hover camera overlay, and all motion
// (avatar hover spring, button whileHover/whileTap + AnimatePresence state swap)
// are preserved verbatim — only colors changed.

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'America/Mexico_City',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Moscow',
  'Europe/Istanbul',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
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

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(p => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
}

function detectTimezone(): string {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (COMMON_TIMEZONES.includes(detected)) return detected;
    return detected;
  } catch {
    return 'America/New_York';
  }
}

function looksLikeEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());
}

export function OnboardingForm({
  userId,
  defaultName,
  defaultAvatar,
  userEmail,
}: {
  userId: string;
  defaultName: string;
  defaultAvatar: string;
  userEmail: string;
}) {
  const router = useRouter();
  const { trigger } = useHaptics();
  const [name, setName] = useState(looksLikeEmail(defaultName) ? '' : defaultName);
  const [avatarUrl, setAvatarUrl] = useState(defaultAvatar);
  const [timezone, setTimezone] = useState(detectTimezone);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
    const path = `${userId}/avatar.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });

    if (uploadErr) {
      setError('Failed to upload avatar. Make sure the "avatars" storage bucket exists.');
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
    setUploading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a display name.');
      trigger('error');
      return;
    }
    if (looksLikeEmail(name)) {
      setError('Your display name cannot be an email address. Choose a real name or username.');
      trigger('error');
      return;
    }

    setSaving(true);
    setError('');

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        display_name: name.trim(),
        avatar_url: avatarUrl || null,
        email: userEmail,
        timezone,
        onboarded: 1,
      })
      .eq('id', userId);

    if (updateErr) {
      setError('Failed to save profile. Please try again.');
      setSaving(false);
      trigger('error');
      return;
    }

    trigger('success');
    router.push('/issues'); // Issues is the landing page (Overview removed)
    router.refresh();
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-seeko">
      <div className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex flex-col items-center gap-3">
            <p className="text-center text-sm text-[#808080]">
              Upload a photo for your profile (optional).
            </p>
            <motion.div
              className="relative group"
              whileHover={{ scale: 1.05 }}
              transition={springs.snappy}
            >
              <Avatar className="size-20 border-2 border-black/[0.08]">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="size-full object-cover rounded-full" />
                ) : (
                  <AvatarFallback className="text-lg">
                    {getInitials(name)}
                  </AvatarFallback>
                )}
              </Avatar>
              <label className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="size-5 text-white" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                  disabled={uploading}
                />
              </label>
            </motion.div>
            <p className="text-xs text-[#808080]">
              {uploading ? 'Uploading...' : 'Click the avatar to upload (optional)'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="display-name" className="text-[#808080]">Display Name</Label>
            <Input
              id="display-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              autoFocus
              className={LIGHT_INPUT}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone" className="text-[#808080]">Timezone</Label>
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
            <p className="text-xs text-[#808080]">Auto-detected from your browser. Change if needed.</p>
          </div>

          {error && (
            <p className="text-sm text-[#d4503e]">{error}</p>
          )}

          <motion.button
            type="submit"
            disabled={saving || uploading}
            className={cn(
              BTN_PRIMARY,
              LIGHT_FOCUS_RING,
              'inline-flex h-10 w-full items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold disabled:pointer-events-none disabled:opacity-50',
            )}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={springs.snappy}
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={saving ? 'saving' : 'idle'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: DURATION_STATE_MS / 1000 }}
                className="inline-flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 shrink-0 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    Continue to Dashboard
                    <ArrowRight className="size-4 shrink-0" />
                  </>
                )}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </form>
      </div>
    </div>
  );
}
