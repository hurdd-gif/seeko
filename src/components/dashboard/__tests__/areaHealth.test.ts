import { rollupHealth, phaseHealthMap } from '../areaHealth';
import type { Milestone } from '@/lib/types';

function m(name: string, health: Milestone['health'], id = `${name}-${health}`): Milestone {
  return { id, name, sort_order: 0, created_at: '2026-01-01', health };
}

describe('rollupHealth (worst-of)', () => {
  it('returns null for an empty list', () => {
    expect(rollupHealth([])).toBeNull();
  });

  it('returns null when nothing carries a health signal', () => {
    expect(rollupHealth([null, undefined])).toBeNull();
  });

  it('returns on_track when every signal is on_track', () => {
    expect(rollupHealth(['on_track', 'on_track'])).toBe('on_track');
  });

  it('prefers at_risk over on_track', () => {
    expect(rollupHealth(['on_track', 'at_risk', 'on_track'])).toBe('at_risk');
  });

  it('prefers off_track over everything (surface risk)', () => {
    expect(rollupHealth(['on_track', 'off_track', 'at_risk'])).toBe('off_track');
  });

  it('ignores null/undefined entries when rolling up', () => {
    expect(rollupHealth([null, 'on_track', undefined])).toBe('on_track');
  });
});

// Areas and milestones aren't linked in the DB; areas carry a `phase` and the
// milestones are named after phases (ALPHA/BETA). phaseHealthMap keys milestone
// health by normalized milestone name so an area can look its phase up.
describe('phaseHealthMap', () => {
  it('keys health by normalized (case-insensitive, trimmed) milestone name', () => {
    const map = phaseHealthMap([m('ALPHA', 'on_track'), m('  Beta ', 'off_track')]);
    // area.phase 'Alpha' / 'Beta' should resolve against these.
    expect(map.get('alpha')).toBe('on_track');
    expect(map.get('beta')).toBe('off_track');
  });

  it('rolls multiple milestones of the same phase up to worst-of', () => {
    const map = phaseHealthMap([
      m('Alpha', 'on_track'),
      m('Alpha', 'at_risk'),
      m('Beta', 'on_track'),
      m('Beta', 'off_track'),
    ]);
    expect(map.get('alpha')).toBe('at_risk');
    expect(map.get('beta')).toBe('off_track');
  });

  it('omits phases whose milestones carry no health signal', () => {
    const map = phaseHealthMap([m('Alpha', null), m('Alpha', undefined)]);
    expect(map.has('alpha')).toBe(false);
  });

  it('ignores milestones with a blank name', () => {
    const map = phaseHealthMap([{ id: 'x', name: '   ', sort_order: 0, created_at: '2026-01-01', health: 'off_track' }]);
    expect(map.size).toBe(0);
  });
});
