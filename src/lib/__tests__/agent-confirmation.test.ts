import { describe, expect, it } from 'vitest';
import { confirmationRoute, isApprovalConfirmationPrompt, isBareConfirmation } from '../agent-confirmation';

describe('confirmationRoute', () => {
  it('sends a bare "yes" to the server when no approval card is visible, so EKO can act on the offer it just made', () => {
    // THE BUG: the client used to deflect a standalone "yes" locally with a canned
    // "tell me the specific action" reply and never call the API, so EKO never saw the
    // confirmation and forgot the offer it had made the previous turn.
    expect(confirmationRoute('Yes', { hasVisibleApprovalCard: false })).toBe('send-to-server');
    expect(confirmationRoute('do it', { hasVisibleApprovalCard: false })).toBe('send-to-server');
    expect(confirmationRoute('  okay! ', { hasVisibleApprovalCard: false })).toBe('send-to-server');
  });

  it('approves a VISIBLE approval card locally, with no server round-trip', () => {
    expect(confirmationRoute('yes', { hasVisibleApprovalCard: true })).toBe('approve-visible-card');
    expect(confirmationRoute('go ahead', { hasVisibleApprovalCard: true })).toBe('approve-visible-card');
  });

  it('sends a substantive instruction to the server regardless of card state', () => {
    expect(confirmationRoute('set ALPHA off_track', { hasVisibleApprovalCard: false })).toBe('send-to-server');
    expect(confirmationRoute('set ALPHA off_track', { hasVisibleApprovalCard: true })).toBe('send-to-server');
  });
});

describe('isBareConfirmation', () => {
  it('matches standalone affirmations', () => {
    expect(isBareConfirmation('yes')).toBe(true);
    expect(isBareConfirmation('  Okay! ')).toBe(true);
    expect(isBareConfirmation('do it')).toBe(true);
  });

  it('does not match a substantive instruction that merely contains a "yes"', () => {
    expect(isBareConfirmation('yes, set ALPHA off_track')).toBe(false);
    expect(isBareConfirmation('mark them at_risk')).toBe(false);
  });
});

describe('isApprovalConfirmationPrompt', () => {
  it('matches an explicit confirmation of a shown card', () => {
    expect(isApprovalConfirmationPrompt('yes')).toBe(true);
    expect(isApprovalConfirmationPrompt('go ahead')).toBe(true);
    expect(isApprovalConfirmationPrompt('i approve')).toBe(true);
  });

  it('does not match a plain question', () => {
    expect(isApprovalConfirmationPrompt('are we on track?')).toBe(false);
  });
});
