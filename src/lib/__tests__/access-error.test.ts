import { describe, expect, it } from 'vitest';
import { AccessError, accessErrorStatus, type AccessReason } from '../access-error';

describe('accessErrorStatus', () => {
  it('maps unauthorized to 401', () => {
    expect(accessErrorStatus('unauthorized')).toBe(401);
  });

  it('maps forbidden to 403', () => {
    expect(accessErrorStatus('forbidden')).toBe(403);
  });

  it('maps profile_not_found to 404', () => {
    expect(accessErrorStatus('profile_not_found')).toBe(404);
  });

  it('maps not_found to 404', () => {
    expect(accessErrorStatus('not_found')).toBe(404);
  });
});

describe('AccessError', () => {
  it('is an instanceof Error and AccessError', () => {
    const err = new AccessError('forbidden');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AccessError);
  });

  it('sets name to AccessError', () => {
    const err = new AccessError('not_found');
    expect(err.name).toBe('AccessError');
  });

  it('exposes the reason', () => {
    const err = new AccessError('profile_not_found');
    expect(err.reason).toBe('profile_not_found');
  });

  it('defaults the message to the reason when no message is given', () => {
    const err = new AccessError('profile_not_found');
    expect(err.message).toBe('profile_not_found');
  });

  it('uses an explicit message override when given (for wire-format-preserving codes)', () => {
    const err = new AccessError('forbidden', 'investor_forbidden');
    expect(err.reason).toBe('forbidden');
    expect(err.message).toBe('investor_forbidden');
  });

  it('accepts every AccessReason value', () => {
    const reasons: AccessReason[] = ['unauthorized', 'forbidden', 'profile_not_found', 'not_found'];
    for (const reason of reasons) {
      const err = new AccessError(reason);
      expect(err.reason).toBe(reason);
    }
  });
});
