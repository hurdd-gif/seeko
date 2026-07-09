import * as React from 'react';
import { Label, Input } from 'seeko-studio';

// Label is a form caption (text-sm font-medium). It pairs with inputs across the
// SEEKO task / payment forms. Shown on the DS dark surface so the #f0f0f0 caption
// reads against #1a1a1a (it would vanish on the white preview cell), with real
// fields beneath so the label's pairing context is visible.
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
      gap: 16,
      width: 320,
    }}
  >
    {children}
  </div>
);

export const FormFields = () => (
  <Surface>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Label htmlFor="task-name">Task name</Label>
      <Input id="task-name" placeholder="e.g. Rig boss character" />
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Label htmlFor="bounty">Bounty (USD)</Label>
      <Input id="bounty" type="number" defaultValue={250} />
    </div>
  </Surface>
);

export const Standalone = () => (
  <Surface>
    <Label>Department</Label>
    <Label>Area</Label>
    <Label>Deadline</Label>
  </Surface>
);
