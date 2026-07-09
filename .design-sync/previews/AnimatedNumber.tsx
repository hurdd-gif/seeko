import * as React from 'react';
import { AnimatedNumber } from 'seeko-studio';

// AnimatedNumber springs a count from 0 → value on mount (respects reduced
// motion → renders the final value instantly). It's an inline <span>, so the
// surrounding typography carries the styling. SEEKO is a dark dashboard, so the
// cell sits on the DS page surface with a large, foreground-coloured numeral.
const Surface: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      background: 'var(--color-background, #1a1a1a)',
      color: 'var(--color-foreground, #f0f0f0)',
      fontFamily: 'var(--font-outfit), system-ui, sans-serif',
      padding: 24,
      borderRadius: 12,
      display: 'flex',
      flexWrap: 'wrap',
      gap: 32,
      alignItems: 'flex-end',
    }}
  >
    {children}
  </div>
);

const Stat: React.FC<{ label: string; children: React.ReactNode; accent?: boolean }> = ({
  label,
  children,
  accent,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <span
      style={{
        fontSize: 44,
        fontWeight: 600,
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        color: accent ? 'var(--color-seeko-accent, #0d7aff)' : 'var(--color-foreground, #f0f0f0)',
      }}
    >
      {children}
    </span>
    <span style={{ fontSize: 12, color: 'var(--color-muted-foreground, #9a9a9a)' }}>{label}</span>
  </div>
);

// KPI tiles — concrete values so the numeral lands visible after the spring.
export const StudioKPIs = () => (
  <Surface>
    <Stat label="Open tasks">
      <AnimatedNumber value={64} />
    </Stat>
    <Stat label="In review">
      <AnimatedNumber value={12} />
    </Stat>
    <Stat label="Done this cycle" accent>
      <AnimatedNumber value={128} />
    </Stat>
  </Surface>
);

// Inline within a sentence + a larger bounty figure with units around it.
export const InlineAndBounty = () => (
  <Surface>
    <div style={{ fontSize: 18, color: 'var(--color-foreground, #f0f0f0)' }}>
      <AnimatedNumber value={1280} />
      <span style={{ color: 'var(--color-muted-foreground, #9a9a9a)' }}> commits this sprint</span>
    </div>
    <div style={{ fontSize: 40, fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
      <span style={{ color: 'var(--color-muted-foreground, #9a9a9a)' }}>$</span>
      <AnimatedNumber value={2400} />
    </div>
  </Surface>
);
