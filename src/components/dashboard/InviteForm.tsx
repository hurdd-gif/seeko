'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Loader2, CheckCircle2, UserPlus, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { springs } from '@/lib/motion';

const DEPARTMENTS = ['Coding', 'Visual Art', 'UI/UX', 'Animation', 'Asset Creation'];

export function InviteForm() {
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [role, setRole] = useState<'member' | 'contractor' | 'investor'>('member');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email || sending) return;

    setSending(true);
    setResult(null);

    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          department,
          isContractor: role === 'contractor',
          isInvestor: role === 'investor',
        }),
      });
      const data = await res.json();

      if (res.ok) {
        setResult({ ok: true, message: `Invite sent to ${email}` });
        setEmail('');
        setDepartment('');
        setRole('member');
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
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <UserPlus className="size-4 text-muted-foreground" />
          <div>
            <CardTitle>Invite Member</CardTitle>
            <CardDescription>Send an invite link by email.</CardDescription>
          </div>
        </div>
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={springs.heavy}
            className="overflow-hidden"
          >
            <CardContent className="pt-0">
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
                    <Select
                      value={department}
                      onChange={e => setDepartment(e.target.value)}
                    >
                      <option value="">Select...</option>
                      {DEPARTMENTS.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="w-full space-y-2 sm:w-36">
                    <Label>Role</Label>
                    <Select
                      value={role}
                      onChange={e => setRole(e.target.value as 'member' | 'contractor' | 'investor')}
                    >
                      <option value="member">Team Member</option>
                      <option value="contractor">Contractor</option>
                      <option value="investor">Investor</option>
                    </Select>
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
                      <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
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
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
