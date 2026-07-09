import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgreementForm } from '../AgreementForm';

// AgreementForm pulls in the router, haptics, and scroll-lock — none relevant to
// the signature-wiring behavior under test, so stub them.
vi.mock('@/lib/react-router-adapters', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/components/HapticsProvider', () => ({ useHaptics: () => ({ trigger: vi.fn() }) }));
vi.mock('@/lib/scroll-lock', () => ({ acquireScrollLock: vi.fn(), releaseScrollLock: vi.fn() }));

const SECTIONS = [{ number: 1, title: 'Terms', content: '<p>Be excellent to each other.</p>' }];

function signCall() {
  return (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
    (c) => typeof c[0] === 'string' && c[0].includes('/sign'),
  );
}

describe('AgreementForm — light signer signature wiring', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  it('gates submit on a signature and sends signature_image + signature_kind', async () => {
    render(
      <AgreementForm
        light
        userId=""
        userEmail=""
        sections={SECTIONS}
        title="External NDA"
        showEngagementType={false}
        signEndpoint="/api/external-signing/sign"
        signPayloadExtra={{ token: 'tok-123' }}
        successRedirect={null}
      />,
    );

    // jsdom reports zero scroll height, so the form treats the agreement as fully
    // read and surfaces "Continue to Sign" immediately.
    fireEvent.click(await screen.findByRole('button', { name: /continue to sign/i }));

    // The read→sign swap runs through AnimatePresence; await the field's arrival.
    fireEvent.change(await screen.findByLabelText(/legal full name/i), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText(/^address$/i), { target: { value: '123 Main St' } });

    const submit = screen.getByRole('button', { name: /sign agreement/i });
    expect(submit).toBeDisabled(); // no signature captured yet

    // Capture a typed signature in the pad.
    fireEvent.click(screen.getByRole('button', { name: /^type$/i }));
    fireEvent.change(screen.getByPlaceholderText(/type your full name/i), {
      target: { value: 'Jane Doe' },
    });

    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(signCall()).toBeTruthy());
    const body = JSON.parse(signCall()![1].body as string);
    expect(body).toMatchObject({
      full_name: 'Jane Doe',
      address: '123 Main St',
      token: 'tok-123',
      signature_image: 'Jane Doe',
      signature_kind: 'typed',
    });
  });

  it('does not gate submit on a signature in dark onboarding mode', async () => {
    render(
      <AgreementForm
        userId="u1"
        userEmail="x@y.z"
        sections={SECTIONS}
        title="NDA"
        showEngagementType={false}
        signEndpoint="/api/agreement/sign"
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /continue to sign/i }));
    fireEvent.change(await screen.findByLabelText(/legal full name/i), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText(/^address$/i), { target: { value: '123 Main St' } });

    // Onboarding derives the signature from the legal name — no pad, submit enabled.
    expect(screen.getByRole('button', { name: /i agree.*sign/i })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /^type$/i })).not.toBeInTheDocument();
  });
});
