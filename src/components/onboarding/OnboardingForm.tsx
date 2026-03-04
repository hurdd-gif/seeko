'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { motion } from 'motion/react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Camera } from 'lucide-react';
import { springs } from '@/components/motion';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(p => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
}

export function OnboardingForm({
  userId,
  defaultName,
  defaultAvatar,
}: {
  userId: string;
  defaultName: string;
  defaultAvatar: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [avatarUrl, setAvatarUrl] = useState(defaultAvatar);
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
      return;
    }

    setSaving(true);
    setError('');

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        display_name: name.trim(),
        avatar_url: avatarUrl || null,
        onboarded: 1,
      })
      .eq('id', userId);

    if (updateErr) {
      setError('Failed to save profile. Please try again.');
      setSaving(false);
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex flex-col items-center gap-3">
            <motion.div
              className="relative group"
              whileHover={{ scale: 1.05 }}
              transition={springs.snappy}
            >
              <Avatar className="size-20 border-2 border-border">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="size-full object-cover rounded-full" />
                ) : (
                  <AvatarFallback className="text-lg bg-secondary text-foreground">
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
            <p className="text-xs text-muted-foreground">
              {uploading ? 'Uploading...' : 'Click to upload a photo (optional)'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="display-name">Display Name</Label>
            <Input
              id="display-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <motion.button
            type="submit"
            disabled={saving || uploading}
            className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary text-primary-foreground text-sm font-medium h-9 px-4 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={springs.snappy}
          >
            {saving ? 'Saving...' : 'Continue to Dashboard'}
          </motion.button>

          <button
            type="button"
            onClick={async () => {
              setSaving(true);
              await supabase
                .from('profiles')
                .update({ onboarded: 1 })
                .eq('id', userId);
              router.push('/');
              router.refresh();
            }}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
            disabled={saving}
          >
            Skip for now
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
