import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecipientSheet } from '../RecipientSheet';

// Scroll-lock touches the DOM body; stub it so the component mounts cleanly.
vi.mock('@/lib/scroll-lock', () => ({ acquireScrollLock: vi.fn(), releaseScrollLock: vi.fn() }));

describe('RecipientSheet — dismiss gating', () => {
  beforeEach(() => {
    // jsdom has no matchMedia → the hook must default to mobile without crashing.
    // (intentionally left undefined to prove the guard)
  });

  it('locks the ceremony: scrim click is inert and no close control renders when not dismissible', () => {
    const onDismiss = vi.fn();
    render(
      <RecipientSheet onDismiss={onDismiss}>
        <p>Sign here</p>
      </RecipientSheet>,
    );

    // A non-dismissible sheet must NOT close when the signer taps outside it.
    fireEvent.click(screen.getByTestId('sheet-scrim'));
    expect(onDismiss).not.toHaveBeenCalled();

    // And it exposes no close affordance at all.
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
    expect(screen.getByText('Sign here')).toBeInTheDocument();
  });

  it('dismisses on scrim click and exposes an accessible close control when dismissible', () => {
    const onDismiss = vi.fn();
    render(
      <RecipientSheet dismissible onDismiss={onDismiss}>
        <p>All set</p>
      </RecipientSheet>,
    );

    const close = screen.getByRole('button', { name: /close/i });
    expect(close).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sheet-scrim'));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    fireEvent.click(close);
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});
