import { describe, it, expect } from 'vitest';

function validateSignRequest(body: Record<string, unknown>): string | null {
  if (!body.full_name || typeof body.full_name !== 'string' || (body.full_name as string).trim().length === 0) {
    return 'full_name is required';
  }
  if (!body.address || typeof body.address !== 'string' || (body.address as string).trim().length === 0) {
    return 'address is required';
  }
  if (!['team_member', 'contractor'].includes(body.engagement_type as string)) {
    return 'engagement_type must be team_member or contractor';
  }
  return null;
}

describe('agreement sign validation', () => {
  it('rejects missing full_name', () => {
    expect(validateSignRequest({ address: '123 St', engagement_type: 'team_member' }))
      .toBe('full_name is required');
  });

  it('rejects missing address', () => {
    expect(validateSignRequest({ full_name: 'John', engagement_type: 'team_member' }))
      .toBe('address is required');
  });

  it('rejects invalid engagement_type', () => {
    expect(validateSignRequest({ full_name: 'John', address: '123', engagement_type: 'other' }))
      .toBe('engagement_type must be team_member or contractor');
  });

  it('passes valid input', () => {
    expect(validateSignRequest({
      full_name: 'John Doe',
      address: '123 Main St',
      engagement_type: 'contractor',
    })).toBeNull();
  });
});
