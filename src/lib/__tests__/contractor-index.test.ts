import { describe, expect, it } from 'vitest';
import { assertContractorAccess, ContractorAccessError } from '@/lib/contractor-index';

describe('assertContractorAccess', () => {
  it('allows a contractor', () => {
    expect(() => assertContractorAccess({ is_contractor: true, is_admin: false })).not.toThrow();
  });

  it('allows an admin who is not a contractor', () => {
    expect(() => assertContractorAccess({ is_contractor: false, is_admin: true })).not.toThrow();
  });

  it('rejects a non-contractor non-admin with contractor_required', () => {
    try {
      assertContractorAccess({ is_contractor: false, is_admin: false });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ContractorAccessError);
      expect((err as ContractorAccessError).code).toBe('contractor_required');
    }
  });

  it('rejects null flags', () => {
    expect(() => assertContractorAccess({ is_contractor: null, is_admin: null })).toThrow(
      ContractorAccessError,
    );
  });
});
