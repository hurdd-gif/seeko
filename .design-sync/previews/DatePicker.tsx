import * as React from 'react';
import { DatePicker } from 'seeko-studio';

// DatePicker renders an inline calendar panel (no portal). It's controlled via
// value (YYYY-MM-DD) + onChange. We seed a selected deadline so the cell shows a
// real picked date (accent-filled cell + footer line). Rendered on the dark DS
// surface — the default dark variant is dark-on-dark (#222-ish panel, light text).
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
      gap: 24,
      position: 'relative',
      minHeight: 80,
    }}
  >
    {children}
  </div>
);

// A future deadline so it's both selectable and visibly highlighted.
const DEADLINE = '2026-07-15';

export const Deadline = () => {
  const [value, setValue] = React.useState(DEADLINE);
  return (
    <Surface>
      <DatePicker value={value} onChange={setValue} minDate={null} dateLabel="Deadline:" />
    </Surface>
  );
};

export const NoSelection = () => {
  const [value, setValue] = React.useState('');
  return (
    <Surface>
      <DatePicker value={value} onChange={setValue} minDate={null} />
    </Surface>
  );
};

export const LightVariant = () => {
  const [value, setValue] = React.useState(DEADLINE);
  return (
    <Surface>
      <DatePicker value={value} onChange={setValue} minDate={null} dateLabel="Due:" light />
    </Surface>
  );
};
