import * as React from 'react';
import { Checkbox, Label } from 'seeko-studio';

// Checkbox is a fully-controlled button (role="checkbox"): `checked` + onCheckedChange,
// no defaultChecked. The capture is a static render, so each row passes `checked`
// directly to show the unchecked (bordered, empty) and checked (filled primary +
// Check glyph) states side by side. Rendered on the DS dark page surface so the
// near-white border + primary fill read the way they do in the app — a bare
// checkbox on the white preview cell would lose its light border entirely.
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

const Row: React.FC<{ id: string; checked: boolean; label: string }> = ({ id, checked, label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <Checkbox id={id} checked={checked} />
    <Label htmlFor={id}>{label}</Label>
  </div>
);

export const States = () => (
  <Surface>
    <Row id="cb-off" checked={false} label="Notify assignee on status change" />
    <Row id="cb-on" checked label="Require review before Done" />
  </Surface>
);

export const TaskChecklist = () => (
  <Surface>
    <Row id="cl-1" checked label="Block out combat arena" />
    <Row id="cl-2" checked label="Rig boss character" />
    <Row id="cl-3" checked={false} label="Hook up hit-detection" />
    <Row id="cl-4" checked={false} label="Balance pass on Fighting Club" />
  </Surface>
);
