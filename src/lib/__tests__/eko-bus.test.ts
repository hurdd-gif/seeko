import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearPendingEkoSpotlight,
  emitEkoEvent,
  matchesEkoTaskRef,
  peekPendingEkoSpotlight,
  requestEkoSpotlight,
  restoreEkoSpotlight,
  subscribeEkoBus,
  tryClaimEkoSpotlight,
  type EkoBusEvent,
} from '../eko-bus';

afterEach(() => {
  clearPendingEkoSpotlight();
  vi.useRealTimers();
});

describe('subscribeEkoBus / emitEkoEvent', () => {
  it('delivers events to subscribers in order and stops after unsubscribe', () => {
    const seen: EkoBusEvent[] = [];
    const unsubscribe = subscribeEkoBus((e) => seen.push(e));

    emitEkoEvent({ type: 'navigate', path: '/issues' });
    expect(seen).toEqual([{ type: 'navigate', path: '/issues' }]);

    unsubscribe();
    emitEkoEvent({ type: 'clear-preview' });
    expect(seen).toHaveLength(1);
  });

  it('keeps delivering to other subscribers if one unsubscribes mid-emit', () => {
    const seen: string[] = [];
    const unsubA = subscribeEkoBus(() => {
      seen.push('a');
      unsubA();
    });
    const unsubB = subscribeEkoBus(() => seen.push('b'));

    emitEkoEvent({ type: 'clear-preview' });
    expect(seen).toEqual(['a', 'b']);
    unsubB();
  });
});

describe('matchesEkoTaskRef', () => {
  it('matches by id when both sides carry one (and id wins over a conflicting name)', () => {
    expect(matchesEkoTaskRef({ id: 't1' }, { id: 't1', name: 'Other' })).toBe(true);
    expect(matchesEkoTaskRef({ id: 't1', name: 'Same' }, { id: 't2', name: 'Same' })).toBe(false);
  });

  it('falls back to task number, then case-insensitive name', () => {
    expect(matchesEkoTaskRef({ taskNumber: 12 }, { taskNumber: 12, name: 'x' })).toBe(true);
    expect(matchesEkoTaskRef({ taskNumber: 12 }, { taskNumber: 13 })).toBe(false);
    expect(matchesEkoTaskRef({ name: 'Game Mechanics' }, { name: '  game mechanics ' })).toBe(true);
    expect(matchesEkoTaskRef({ name: 'Game Mechanics' }, { name: 'Game Modes' })).toBe(false);
  });

  it('never matches when the refs share no comparable field', () => {
    expect(matchesEkoTaskRef({ id: 't1' }, { name: 'Game Mechanics' })).toBe(false);
    expect(matchesEkoTaskRef({}, {})).toBe(false);
  });
});

describe('requestEkoSpotlight / tryClaimEkoSpotlight', () => {
  it('emits a spotlight event and parks the target for a later claim', () => {
    const seen: EkoBusEvent[] = [];
    const unsubscribe = subscribeEkoBus((e) => seen.push(e));

    requestEkoSpotlight({ id: 't1', name: 'Game Mechanics' });

    expect(seen).toEqual([
      { type: 'spotlight', target: { id: 't1', name: 'Game Mechanics' } },
    ]);
    expect(peekPendingEkoSpotlight()).toEqual({ id: 't1', name: 'Game Mechanics' });
    unsubscribe();
  });

  it('lets exactly one matching candidate claim the spotlight', () => {
    requestEkoSpotlight({ name: 'Game Mechanics' });

    expect(tryClaimEkoSpotlight({ id: 'other', name: 'Game Modes' })).toBe(false);
    expect(tryClaimEkoSpotlight({ id: 't1', name: 'game mechanics' })).toBe(true);
    // Already claimed — a second identical candidate must lose.
    expect(tryClaimEkoSpotlight({ id: 't1', name: 'game mechanics' })).toBe(false);
  });

  it('expires an unclaimed spotlight after the TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    requestEkoSpotlight({ id: 't1' });

    vi.setSystemTime(16_000);
    expect(tryClaimEkoSpotlight({ id: 't1' })).toBe(false);
    expect(peekPendingEkoSpotlight()).toBeNull();
  });

  it('lets a restored claim be claimed again without emitting (StrictMode remount)', () => {
    const seen: EkoBusEvent[] = [];
    requestEkoSpotlight({ id: 't1' });
    expect(tryClaimEkoSpotlight({ id: 't1' })).toBe(true);

    const unsubscribe = subscribeEkoBus((e) => seen.push(e));
    restoreEkoSpotlight({ id: 't1' });

    expect(seen).toEqual([]); // restore is silent — no re-emit
    expect(tryClaimEkoSpotlight({ id: 't1' })).toBe(true);
    unsubscribe();
  });

  it('replaces the pending target when a new spotlight is requested', () => {
    requestEkoSpotlight({ id: 't1' });
    requestEkoSpotlight({ id: 't2' });

    expect(tryClaimEkoSpotlight({ id: 't1' })).toBe(false);
    expect(tryClaimEkoSpotlight({ id: 't2' })).toBe(true);
  });
});
