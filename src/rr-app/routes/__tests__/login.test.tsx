import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginRouteContent } from '../login';

// Login redesigned to the Paper reference (SK_DB frame 27P-0): centered card
// with badge + "Sign in to SEEKO" heading, Google + passkey provider pills, an
// "or" divider, then the ORIGINAL email/password flow. The invite path is now a
// footer link ("Have an invite code?") that swaps the card body to the ORIGINAL
// <InviteCodeForm> — its copy "Enter the 8-digit code from your invite email"
// proves the verbatim mount over a look-alike. The passkey pill only renders
// where WebAuthn exists (jsdom has none by default, so it needs a stub).
describe('LoginRouteContent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderLogin(initialEntry = '/login') {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <LoginRouteContent />
      </MemoryRouter>
    );
  }

  it('renders the sign-in card with Google and email/password methods', () => {
    renderLogin();

    expect(screen.getByRole('heading', { name: 'Sign in to SEEKO' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue with Google/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Sign in' }).some((button) => button.getAttribute('type') === 'submit')
    ).toBe(true);
  });

  it('hides the passkey pill when WebAuthn is unavailable', () => {
    renderLogin();
    expect(screen.queryByRole('button', { name: /Continue with passkey/ })).not.toBeInTheDocument();
  });

  it('shows the passkey pill when WebAuthn is available', () => {
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {});
    renderLogin();
    expect(screen.getByRole('button', { name: /Continue with passkey/ })).toBeInTheDocument();
  });

  it('mounts the original InviteCodeForm behind the invite link', async () => {
    renderLogin();

    fireEvent.click(screen.getByRole('button', { name: 'Have an invite code?' }));

    // Marker unique to the ORIGINAL InviteCodeForm. The swap runs through
    // AnimatePresence mode="wait" (signin exits, then invite enters), so await
    // the entering child rather than querying synchronously.
    expect(
      await screen.findByText('Enter the 8-digit code from your invite email')
    ).toBeInTheDocument();
  });

  it('surfaces a failed OAuth callback redirect as an inline error', () => {
    renderLogin('/login?error=auth_callback_failed');
    expect(screen.getByText("Google sign-in didn't complete. Please try again.")).toBeInTheDocument();
  });
});
