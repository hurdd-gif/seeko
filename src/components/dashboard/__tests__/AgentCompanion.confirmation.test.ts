import { shouldHandleStandaloneConfirmationLocally } from '../AgentCompanion';

describe('AgentCompanion confirmation routing', () => {
  it('keeps context-free standalone confirmations local', () => {
    expect(shouldHandleStandaloneConfirmationLocally('yes', [])).toBe(true);
    expect(shouldHandleStandaloneConfirmationLocally('go ahead', [
      { role: 'user', text: 'What tasks are overdue?' },
      { role: 'eko', text: 'Four tasks are overdue.' },
    ])).toBe(true);
  });

  it('lets contextual confirmations reach EKO when EKO offered to prepare a gated update', () => {
    expect(shouldHandleStandaloneConfirmationLocally('yes', [
      { role: 'user', text: 'When is it due?' },
      { role: 'eko', text: 'UI Extension does not have a due date. Would you like EKO to prepare adding one for approval?' },
    ])).toBe(false);
  });
});
