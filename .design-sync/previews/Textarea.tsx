import * as React from 'react';
import { Textarea, Label } from 'seeko-studio';

// Textarea is a native textarea wrapper (transparent bg, border-input, rounded-md,
// min-h-60px). Shown as placeholder / filled (multi-line task description) /
// disabled, plus a labeled form row. Rendered on the DS dark page surface so the
// bordered transparent field reads against #1a1a1a the way it does in the app —
// a bare field on the white preview cell is near-invisible.
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
      width: 380,
    }}
  >
    {children}
  </div>
);

export const States = () => (
  <Surface>
    <Textarea placeholder="Describe the task…" />
    <Textarea
      rows={5}
      defaultValue={
        'Implement hit-detection for the Fighting Club arena.\n' +
        'Cover melee + ranged, sync with the existing combat state machine, ' +
        'and add a debug overlay for hitbox visualisation.'
      }
    />
    <Textarea placeholder="Archived — read only" disabled />
  </Surface>
);

export const WithLabel = () => (
  <Surface>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Label htmlFor="task-desc">Task description</Label>
      <Textarea
        id="task-desc"
        rows={4}
        defaultValue={
          'Block out the boss arena geometry, set up spawn points, ' +
          'and rough in the camera rails for the intro cutscene.'
        }
      />
    </div>
  </Surface>
);
