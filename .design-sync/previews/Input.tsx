import * as React from 'react';
import { Input, Label } from 'seeko-studio';

// Input is state-heavy: default / filled / disabled / labeled. On the DS dark
// surface so the transparent-bg, bordered field reads against #1a1a1a the way
// it does in the app (a bare field on the white preview cell is near-invisible).
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

export const States = () => (
  <Surface>
    <Input placeholder="Search tasks…" />
    <Input defaultValue="Implement combat hit-detection" />
    <Input placeholder="Archived field" disabled />
  </Surface>
);

export const WithLabel = () => (
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
