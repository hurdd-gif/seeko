import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { OnboardingData } from '@/lib/onboarding-index';
import { OnboardingRouteContent } from '../onboarding';

const index: OnboardingData = {
  currentUser: {
    id: 'user-1',
    email: 'member@example.invalid',
  },
  profile: {
    id: 'user-1',
    displayName: 'Member Example',
    avatarUrl: null,
    email: 'member@example.invalid',
    onboarded: 0,
  },
};

// The legacy `onboarding/page.tsx` rendered the ORIGINAL <OnboardingForm>
// (shadcn Card/Avatar/Input/searchable Select + motion) inside a centered shell
// with the copy "Welcome aboard to SEEKO!" / "Set up your profile to get
// started, what should the team call you?". The faithful rr-app route must mount
// that same component verbatim (light-ported), NOT a hand-rewritten scaffold.
// The original (unlike the prior scaffold) uses the "!" heading, the capital-N
// "Display Name" label, and the captions "Click the avatar to upload (optional)"
// / "Auto-detected from your browser." — asserting those proves the verbatim
// mount rather than a look-alike rewrite.
describe('OnboardingRouteContent', () => {
  it('renders a sign-in required state', () => {
    render(
      <MemoryRouter>
        <OnboardingRouteContent data={{ status: 'unauthorized' }} />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Sign in required' })).toBeInTheDocument();
    expect(screen.getByText('Use your SEEKO account to finish onboarding.')).toBeInTheDocument();
  });

  it('mounts the original OnboardingForm inside the light auth shell', () => {
    render(
      <MemoryRouter>
        <OnboardingRouteContent data={{ status: 'ready', index }} />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('heading', { name: 'Welcome aboard to SEEKO!' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Set up your profile to get started, what should the team call you?')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Display Name')).toHaveValue('Member Example');
    expect(screen.getByText('Click the avatar to upload (optional)')).toBeInTheDocument();
    expect(
      screen.getByText('Auto-detected from your browser. Change if needed.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue to dashboard/i })).toBeInTheDocument();
  });
});
