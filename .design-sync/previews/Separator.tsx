import * as React from 'react';
import { Separator, Badge, MonoBadge } from 'seeko-studio';

// Separator is a 1px border-colored divider (horizontal or vertical). On its own
// it's invisible, so each cell places it BETWEEN real content. Rendered on the DS
// dark surface so the border token reads against #1a1a1a the way it does in the
// app's list rows and toolbars.
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
      gap: 12,
      width: 320,
    }}
  >
    {children}
  </div>
);

export const Horizontal = () => (
  <Surface>
    <div style={{ fontSize: 14, fontWeight: 600 }}>Main Game</div>
    <div style={{ fontSize: 13, color: 'var(--color-muted-foreground, #9a9a9a)' }}>
      Alpha · 12 open tasks
    </div>
    <Separator />
    <div style={{ fontSize: 14, fontWeight: 600 }}>Fighting Club</div>
    <div style={{ fontSize: 13, color: 'var(--color-muted-foreground, #9a9a9a)' }}>
      Beta · 3 open tasks
    </div>
  </Surface>
);

export const VerticalToolbar = () => (
  <Surface>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        height: 24,
      }}
    >
      <MonoBadge>DIH-204</MonoBadge>
      <Separator orientation="vertical" />
      <Badge variant="outline">In Progress</Badge>
      <Separator orientation="vertical" />
      <Badge variant="destructive">High</Badge>
    </div>
  </Surface>
);
