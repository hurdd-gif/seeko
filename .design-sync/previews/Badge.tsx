import * as React from 'react';
import { Badge } from 'seeko-studio';

// Badge has four variants (default / secondary / outline / destructive). SEEKO
// uses it for status, department and priority tags. Rendered on the DS dark page
// surface so the light foreground + token-driven backgrounds read correctly (a
// bare badge on the white preview cell would lose its near-white default fill).
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
    <Badge variant="default">Done</Badge>
    <Badge variant="secondary">Coding</Badge>
    <Badge variant="outline">In Review</Badge>
    <Badge variant="destructive">High</Badge>
  </Surface>
);

export const StatusTags = () => (
  <Surface>
    <Badge variant="secondary">Backlog</Badge>
    <Badge variant="secondary">Todo</Badge>
    <Badge variant="outline">In Progress</Badge>
    <Badge variant="outline">In Review</Badge>
    <Badge variant="default">Done</Badge>
  </Surface>
);

export const DepartmentTags = () => (
  <Surface>
    <Badge variant="secondary">Coding</Badge>
    <Badge variant="secondary">Visual Art</Badge>
    <Badge variant="secondary">UI/UX</Badge>
    <Badge variant="secondary">Animation</Badge>
    <Badge variant="secondary">Asset Creation</Badge>
  </Surface>
);

export const PriorityRow = () => (
  <Surface>
    <Badge variant="destructive">High</Badge>
    <Badge variant="outline">Medium</Badge>
    <Badge variant="secondary">Low</Badge>
  </Surface>
);
