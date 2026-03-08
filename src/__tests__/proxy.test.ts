import { describe, it, expect } from 'vitest';

type ProfileFlags = {
  must_set_password: boolean;
  nda_accepted_at: string | null;
  is_admin: boolean;
  onboarded: number;
};

/** Extracted redirect logic matching proxy.ts priority order */
function getRedirectPath(profile: ProfileFlags | null): string | null {
  if (!profile) return null;
  if (profile.must_set_password) return '/set-password';
  if (!profile.nda_accepted_at && !profile.is_admin) return '/agreement';
  if (profile.onboarded === 0) return '/onboarding';
  return null;
}

describe('NDA redirect logic', () => {
  it('redirects to /set-password first', () => {
    expect(getRedirectPath({
      must_set_password: true, nda_accepted_at: null, is_admin: false, onboarded: 0,
    })).toBe('/set-password');
  });

  it('redirects to /agreement when NDA not signed and not admin', () => {
    expect(getRedirectPath({
      must_set_password: false, nda_accepted_at: null, is_admin: false, onboarded: 0,
    })).toBe('/agreement');
  });

  it('skips NDA for admins', () => {
    expect(getRedirectPath({
      must_set_password: false, nda_accepted_at: null, is_admin: true, onboarded: 0,
    })).toBe('/onboarding');
  });

  it('redirects to /onboarding after NDA signed but not onboarded', () => {
    expect(getRedirectPath({
      must_set_password: false, nda_accepted_at: '2026-03-08T00:00:00Z', is_admin: false, onboarded: 0,
    })).toBe('/onboarding');
  });

  it('returns null when fully onboarded', () => {
    expect(getRedirectPath({
      must_set_password: false, nda_accepted_at: '2026-03-08T00:00:00Z', is_admin: false, onboarded: 1,
    })).toBeNull();
  });
});
