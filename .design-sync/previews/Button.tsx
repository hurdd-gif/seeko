import * as React from 'react';
import { Button } from 'seeko-studio';

// SEEKO is a dark-themed studio dashboard (--color-background:#1a1a1a,
// --color-foreground:#f0f0f0). Preview cards render on a white cell, so each
// story sits on the DS's own page surface — the context these components are
// built for — driven by the shipped tokens (not hard-coded colors).
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

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const Variants = () => (
  <Surface>
    <Button>Save changes</Button>
    <Button variant="outline">Preview</Button>
    <Button variant="ghost">Cancel</Button>
    <Button variant="destructive">Delete task</Button>
  </Surface>
);

export const Sizes = () => (
  <Surface>
    <Button size="sm">Filter</Button>
    <Button size="default">New task</Button>
    <Button size="icon" aria-label="Add task">
      <PlusIcon />
    </Button>
  </Surface>
);

export const States = () => (
  <Surface>
    <Button>Assign task</Button>
    <Button disabled>Saving…</Button>
    <Button variant="outline" disabled>
      Unavailable
    </Button>
  </Surface>
);
