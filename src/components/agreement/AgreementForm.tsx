'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowRight, FileText } from 'lucide-react';
import { DURATION_STATE_MS } from '@/lib/motion';
import { useHaptics } from '@/components/HapticsProvider';
import { AGREEMENT_SECTIONS, AGREEMENT_TITLE } from '@/lib/agreement-text';

interface AgreementFormProps {
  userId: string;
  userEmail: string;
  department: string;
  role: string;
  isContractor: boolean;
  onboarded: number;
}

export function AgreementForm({
  userId,
  userEmail,
  department,
  role,
  isContractor,
  onboarded,
}: AgreementFormProps) {
  const router = useRouter();
  const { trigger } = useHaptics();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [fullName, setFullName] = useState('');
  const [address, setAddress] = useState('');
  const [engagementType, setEngagementType] = useState<'team_member' | 'contractor'>(
    isContractor ? 'contractor' : 'team_member'
  );
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom) setHasScrolledToBottom(true);
  }, []);

  const canSubmit = hasScrolledToBottom && fullName.trim().length > 0 && address.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setError('');
    setSaving(true);

    try {
      const res = await fetch('/api/agreement/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          address: address.trim(),
          engagement_type: engagementType,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to sign agreement.');
        setSaving(false);
        trigger('error');
        return;
      }

      trigger('success');
      router.push(data.redirect || (onboarded === 0 ? '/onboarding' : '/'));
      router.refresh();
    } catch {
      setError('Failed to sign agreement. Please try again.');
      setSaving(false);
      trigger('error');
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Read-only info fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <p className="text-sm font-mono text-foreground truncate">{userEmail}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Department / Role</Label>
              <p className="text-sm text-foreground truncate">
                {department || 'Unassigned'}{role ? ` — ${role}` : ''}
              </p>
            </div>
          </div>

          {/* Scrollable agreement text */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <FileText className="size-4 text-muted-foreground" />
              {AGREEMENT_TITLE}
            </div>
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="h-80 overflow-y-auto rounded-lg border border-border bg-muted/30 p-4 prose prose-sm prose-invert max-w-none
                [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-6 [&_h3]:mb-2
                [&_p]:text-sm [&_p]:text-muted-foreground [&_p]:leading-relaxed [&_p]:mb-3
                [&_ul]:text-sm [&_ul]:text-muted-foreground [&_ul]:ml-4 [&_ul]:mb-3 [&_li]:mb-1"
            >
              {AGREEMENT_SECTIONS.map((section) => (
                <div key={section.number}>
                  <h3>{section.number}. {section.title}</h3>
                  <div dangerouslySetInnerHTML={{ __html: section.content }} />
                </div>
              ))}
              <div className="mt-8 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground italic">
                  End of agreement. Please fill in the fields below and sign.
                </p>
              </div>
            </div>
            {!hasScrolledToBottom && (
              <p className="text-xs text-muted-foreground animate-pulse">
                ↓ Scroll to the bottom to continue
              </p>
            )}
          </div>

          {/* Engagement type */}
          <fieldset className="space-y-2">
            <Label>Engagement Type</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="radio"
                  name="engagement_type"
                  value="team_member"
                  checked={engagementType === 'team_member'}
                  onChange={() => setEngagementType('team_member')}
                  className="accent-seeko-accent"
                />
                Team Member
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="radio"
                  name="engagement_type"
                  value="contractor"
                  checked={engagementType === 'contractor'}
                  onChange={() => setEngagementType('contractor')}
                  className="accent-seeko-accent"
                />
                Independent Contractor
              </label>
            </div>
          </fieldset>

          {/* Legal name and address */}
          <div className="space-y-2">
            <Label htmlFor="full-name">Legal Full Name</Label>
            <Input
              id="full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="As it appears on official documents"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Full mailing address"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || !canSubmit}
            className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary text-primary-foreground text-sm font-medium h-9 px-4 py-2 transition-colors transition-[box-shadow_var(--focus-ring-duration)_ease-out] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
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
                    Signing...
                  </>
                ) : (
                  <>
                    I Agree &amp; Sign
                    <ArrowRight className="size-4 shrink-0" />
                  </>
                )}
              </motion.span>
            </AnimatePresence>
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
