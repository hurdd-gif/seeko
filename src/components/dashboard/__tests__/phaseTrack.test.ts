import { phaseTrack } from '../phaseTrack';

describe('phaseTrack', () => {
  it('treats a Planned area as preplanned — nothing highlighted, even if a stale phase is set', () => {
    // Fighting Club is preplanned: status wins over any phase value still on
    // the row, and a not-yet-started game gets NO highlighted stage.
    expect(phaseTrack('Beta', 'Planned')).toEqual([
      { label: 'Planned', state: 'upcoming' },
      { label: 'Alpha', state: 'upcoming' },
      { label: 'Beta', state: 'upcoming' },
      { label: 'Release', state: 'upcoming' },
    ]);
  });

  it('reads status case-insensitively (DB enum is "Planned", fixtures drift to lowercase)', () => {
    expect(phaseTrack('Beta', 'planned')).toEqual([
      { label: 'Planned', state: 'upcoming' },
      { label: 'Alpha', state: 'upcoming' },
      { label: 'Beta', state: 'upcoming' },
      { label: 'Release', state: 'upcoming' },
    ]);
  });

  it('marks Planned done and Alpha current for an active Alpha game', () => {
    expect(phaseTrack('Alpha', 'Active')).toEqual([
      { label: 'Planned', state: 'done' },
      { label: 'Alpha', state: 'current' },
      { label: 'Beta', state: 'upcoming' },
      { label: 'Release', state: 'upcoming' },
    ]);
  });

  it('marks earlier stages done when an active game is in Beta', () => {
    expect(phaseTrack('Beta', 'Active')).toEqual([
      { label: 'Planned', state: 'done' },
      { label: 'Alpha', state: 'done' },
      { label: 'Beta', state: 'current' },
      { label: 'Release', state: 'upcoming' },
    ]);
  });

  it('maps the Launch enum value to a "Release" label and marks it current', () => {
    expect(phaseTrack('Launch', 'Active')).toEqual([
      { label: 'Planned', state: 'done' },
      { label: 'Alpha', state: 'done' },
      { label: 'Beta', state: 'done' },
      { label: 'Release', state: 'current' },
    ]);
  });

  it('marks the whole rail done for a Complete area', () => {
    expect(phaseTrack('Launch', 'Complete')).toEqual([
      { label: 'Planned', state: 'done' },
      { label: 'Alpha', state: 'done' },
      { label: 'Beta', state: 'done' },
      { label: 'Release', state: 'done' },
    ]);
  });

  it('treats a missing phase and status as the full rail, all upcoming', () => {
    expect(phaseTrack(undefined, undefined)).toEqual([
      { label: 'Planned', state: 'upcoming' },
      { label: 'Alpha', state: 'upcoming' },
      { label: 'Beta', state: 'upcoming' },
      { label: 'Release', state: 'upcoming' },
    ]);
  });

  it('treats an unknown phase string as all upcoming (never throws)', () => {
    expect(phaseTrack('Prototype', 'Active')).toEqual([
      { label: 'Planned', state: 'upcoming' },
      { label: 'Alpha', state: 'upcoming' },
      { label: 'Beta', state: 'upcoming' },
      { label: 'Release', state: 'upcoming' },
    ]);
  });
});
