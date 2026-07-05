'use client';

import { useEffect, useState } from 'react';
import { subscribeEkoBus } from '@/lib/eko-bus';
import { AgentCompanion } from './AgentCompanion';

type GlobalEkoProfile = {
  id: string;
  email: string | null;
  displayName: string | null;
  isAdmin: boolean;
  isInvestor: boolean;
};

type GlobalEkoProfileResponse = {
  profile?: GlobalEkoProfile;
};

type GlobalEkoAgentProps = {
  onNavigate?: (path: string) => void;
};

export function GlobalEkoAgent({ onNavigate }: GlobalEkoAgentProps) {
  const [profile, setProfile] = useState<GlobalEkoProfile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const response = await fetch('/api/profile', { credentials: 'same-origin' });
        if (!response.ok) {
          if (!cancelled) {
            setProfile(null);
            setReady(true);
          }
          return;
        }

        const body = (await response.json()) as GlobalEkoProfileResponse;
        const nextProfile = body.profile ?? null;
        if (!cancelled) {
          setProfile(nextProfile);
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setProfile(null);
          setReady(true);
        }
      }
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!onNavigate) return undefined;
    return subscribeEkoBus((event) => {
      if (event.type !== 'navigate') return;
      if (window.location.pathname === event.path) return;
      onNavigate(event.path);
    });
  }, [onNavigate]);

  if (!ready || !profile || (!profile.isAdmin && !profile.isInvestor)) return null;

  return <AgentCompanion userKey={profile.id} />;
}
