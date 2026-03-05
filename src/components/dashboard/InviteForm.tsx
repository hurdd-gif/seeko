'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Loader2, CheckCircle2, UserPlus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DEPARTMENTS = ['Coding', 'Visual Art', 'UI/UX', 'Animation', 'Asset Creation'];

export function InviteForm() {
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [isContractor, setIsContractor] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email || sending) return;

    setSending(true);
    setResult(null);

    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, department, isContractor }),
      });
      const data = await res.json();

      if (res.ok) {
        setResult({ ok: true, message: `Invite sent to ${email}` });
        setEmail('');
        setDepartment('');
        setIsContractor(false);
      } else {
        setResult({ ok: false, message: data.error || 'Failed to send invite' });
      }
    } catch {
      setResult({ ok: false, message: 'Network error' });
    } finally {
      setSending(false);
      setTimeout(() => setResult(null), 4000);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <UserPlus className="size-4 text-muted-foreground" />
          <div>
            <CardTitle>Invite Member</CardTitle>
            <CardDescription>Send an invite link by email.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleInvite} className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                placeholder="colleague@example.com"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="w-full space-y-2 sm:w-40">
              <Label>Department</Label>
              <select
                value={department}
                onChange={e => setDepartment(e.target.value)}
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground transition-colors transition-[box-shadow_var(--focus-ring-duration)_ease-out] focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Select...</option>
                {DEPARTMENTS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="w-full space-y-2 sm:w-36">
              <Label>Role</Label>
              <select
                value={isContractor ? 'contractor' : 'member'}
                onChange={e => setIsContractor(e.target.value === 'contractor')}
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground transition-colors transition-[box-shadow_var(--focus-ring-duration)_ease-out] focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="member">Team Member</option>
                <option value="contractor">Contractor</option>
              </select>
            </div>
            <Button type="submit" disabled={sending || !email} className="gap-2 shrink-0">
              {sending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              {sending ? 'Sending...' : 'Invite'}
            </Button>
          </div>

          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs ${
                  result.ok
                    ? 'bg-seeko-accent/10 text-seeko-accent'
                    : 'bg-destructive/10 text-destructive'
                }`}>
                  {result.ok && <CheckCircle2 className="size-3.5" />}
                  {result.message}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </CardContent>
    </Card>
  );
}
