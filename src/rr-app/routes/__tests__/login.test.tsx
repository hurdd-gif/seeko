import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginRouteContent } from '../login';

// Login redesigned to the Paper reference (SK_DB frame 27P-0): centered card
// with badge + "Sign in to SEEKO" heading and a pills-only stack (Google,
// passkey, email). The email pill is a transitions.dev-style surface morph:
// collapsed (inert) by default, it expands into the ORIGINAL email/password
// flow on click and collapses via its close button. The invite path is now a
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

  it('renders the sign-in card with Google and email pills, form collapsed', () => {
    renderLogin();

    expect(screen.getByRole('heading', { name: 'Sign in to SEEKO' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue with Google/ })).toBeInTheDocument();
    // The email form starts collapsed behind the "Continue with email" pill.
    expect(screen.getByRole('button', { name: /Continue with email/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('morphs the email pill into the email/password form', () => {
    renderLogin();

    fireEvent.click(screen.getByRole('button', { name: /Continue with email/ }));

    expect(screen.getByRole('button', { name: /Continue with email/ })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Sign in' }).some((button) => button.getAttribute('type') === 'submit')
    ).toBe(true);

    // The close affordance collapses it back to the pill. With the other
    // methods collapsed it's the only way out, so it names its destination
    // ("Back to sign-in options") rather than the thing it dismisses.
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign-in options' }));
    expect(screen.getByRole('button', { name: /Continue with email/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
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

    // Marker unique to the ORIGINAL InviteCodeForm. The swap is a side-by-side
    // page transition (popLayout — both pages animate at once), so the invite
    // page mounts immediately; await keeps the assertion animation-agnostic.
    expect(
      await screen.findByText('Enter the 8-digit code from your invite email')
    ).toBeInTheDocument();
  });

  // The code cells auto-focus their first digit on mount, which used to win the
  // race and land the caret BELOW the email field — the one field the user has
  // to fill first. They'd then have to click their way back up the form.
  // Both views label their field "Email", and popLayout keeps the outgoing page
  // mounted through its exit — so the two fields are briefly on screen at once.
  // Their placeholders differ; that's what tells them apart unambiguously.
  const SIGNIN_EMAIL = 'you@seeko.studio';
  const INVITE_EMAIL = 'you@example.com';

  it('lands focus on the email field when the invite view opens', async () => {
    renderLogin();

    fireEvent.click(screen.getByRole('button', { name: 'Have an invite code?' }));

    await waitFor(() => expect(screen.getByPlaceholderText(INVITE_EMAIL)).toHaveFocus());
  });

  it('carries the email across the sign-in ⇄ invite swap', async () => {
    renderLogin();

    fireEvent.click(screen.getByRole('button', { name: /Continue with email/ }));
    fireEvent.change(screen.getByPlaceholderText(SIGNIN_EMAIL), {
      target: { value: 'crew@seeko.studio' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Have an invite code?' }));

    // Same value, not a second blank field — the pill literally morphs into this
    // input (shared layoutId), so resetting it would make the animation lie.
    await waitFor(() =>
      expect(screen.getByPlaceholderText(INVITE_EMAIL)).toHaveValue('crew@seeko.studio'),
    );
  });

  it('surfaces a failed OAuth callback redirect as an inline error', () => {
    renderLogin('/login?error=auth_callback_failed');
    expect(screen.getByText("Google sign-in didn't complete. Please try again.")).toBeInTheDocument();
  });
});
