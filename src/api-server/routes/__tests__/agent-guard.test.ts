import { describe, expect, it } from 'vitest';
import { bareAffirmationReply } from '../agent';

describe('bareAffirmationReply', () => {
  it('deflects a bare "yes" to the Approve button when an action is already staged', () => {
    const reply = bareAffirmationReply('yes', true);
    expect(reply).toContain('Approve button');
  });

  it('lets a bare "yes" reach the model when nothing is staged (confirming a fresh offer)', () => {
    expect(bareAffirmationReply('yes', false)).toBeNull();
  });

  it('lets other affirmations ("do it", "go ahead") reach the model when nothing is staged', () => {
    expect(bareAffirmationReply('do it', false)).toBeNull();
    expect(bareAffirmationReply('go ahead', false)).toBeNull();
  });

  it('never intercepts a substantive message, even with a pending action', () => {
    expect(bareAffirmationReply('set ALPHA off track', true)).toBeNull();
  });
});
