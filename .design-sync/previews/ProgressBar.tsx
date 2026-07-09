import * as React from 'react';
import { ProgressBar } from 'seeko-studio';

// ProgressBar = a rounded track (bg-secondary) with a seeko-accent fill. It is
// full-width, so each instance needs a sized wrapper to show the fill against
// the track. The fill springs from 0 → value when `animated` (default); a
// static capture can catch it mid-fill, so the showcase cells pass
// animated={false} to lock the fill, with one Animated cell kept for the spring
// variant. SEEKO is a dark dashboard → cells sit on the DS page surface.
const Surface: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      background: 'var(--color-background, #1a1a1a)',
      color: 'var(--color-foreground, #f0f0f0)',
      fontFamily: 'var(--font-outfit), system-ui, sans-serif',
      padding: 24,
      borderRadius: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      width: 320,
    }}
  >
    {children}
  </div>
);

const Row: React.FC<{ label: string; value: number; children: React.ReactNode }> = ({
  label,
  value,
  children,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: 'var(--color-muted-foreground, #9a9a9a)' }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}%</span>
    </div>
    {children}
  </div>
);

// Fill levels — locked (animated=false) so each fill is visible in the capture.
export const Levels = () => (
  <Surface>
    <Row label="Asset Creation" value={25}>
      <ProgressBar value={25} animated={false} />
    </Row>
    <Row label="Main Game" value={64}>
      <ProgressBar value={64} animated={false} />
    </Row>
    <Row label="UI/UX polish" value={100}>
      <ProgressBar value={100} animated={false} />
    </Row>
  </Surface>
);

// Sizes — sm / default / lg track heights at a fixed 70% fill.
export const Sizes = () => (
  <Surface>
    <Row label="Small" value={70}>
      <ProgressBar value={70} size="sm" animated={false} />
    </Row>
    <Row label="Default" value={70}>
      <ProgressBar value={70} size="default" animated={false} />
    </Row>
    <Row label="Large" value={70}>
      <ProgressBar value={70} size="lg" animated={false} />
    </Row>
  </Surface>
);

// Custom fill colours mapped to SEEKO department / status tokens.
export const DepartmentColors = () => (
  <Surface>
    <Row label="Coding" value={82}>
      <ProgressBar value={82} color="#0d7aff" animated={false} />
    </Row>
    <Row label="Animation" value={48}>
      <ProgressBar value={48} color="#fbbf24" animated={false} />
    </Row>
    <Row label="Blocked" value={15}>
      <ProgressBar value={15} color="#f87171" animated={false} />
    </Row>
  </Surface>
);
