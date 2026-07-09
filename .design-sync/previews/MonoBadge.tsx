import * as React from 'react';
import { MonoBadge } from 'seeko-studio';

// MonoBadge is a monospace tag (JetBrains Mono, muted foreground) used for task
// IDs like DIH-204, numeric/percent chips, and version labels. Three variants:
// bordered (default), plain, pill. Numeric-only children auto-get tabular-nums.
// On the DS dark surface so the muted text + subtle border read correctly.
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
      gap: 12,
      alignItems: 'center',
    }}
  >
    {children}
  </div>
);

export const Variants = () => (
  <Surface>
    <MonoBadge variant="bordered">DIH-204</MonoBadge>
    <MonoBadge variant="plain">DIH-187</MonoBadge>
    <MonoBadge variant="pill">DIH-312</MonoBadge>
  </Surface>
);

export const TaskIds = () => (
  <Surface>
    <MonoBadge>DIH-204</MonoBadge>
    <MonoBadge>DIH-205</MonoBadge>
    <MonoBadge>DIH-231</MonoBadge>
    <MonoBadge>DIH-298</MonoBadge>
  </Surface>
);

export const NumericChips = () => (
  <Surface>
    <MonoBadge variant="pill">64%</MonoBadge>
    <MonoBadge variant="pill">100%</MonoBadge>
    <MonoBadge variant="bordered">v1.2.0</MonoBadge>
    <MonoBadge variant="bordered">DIH-204</MonoBadge>
  </Surface>
);
