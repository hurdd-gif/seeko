import * as React from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  Button,
} from 'seeko-studio';

// Card is a compound: Card + CardHeader/Title/Description/Content/Footer.
// Rendered on the DS's dark page surface so the #222 card + #f0f0f0 text read
// correctly (the white preview cell would otherwise hide the light foreground).
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
      gap: 16,
    }}
  >
    {children}
  </div>
);

export const TaskCard = () => (
  <Surface>
    <Card style={{ width: 320 }}>
      <CardHeader>
        <CardTitle>Implement combat hit-detection</CardTitle>
        <CardDescription>Main Game · Coding</CardDescription>
      </CardHeader>
      <CardContent>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--color-muted-foreground, #9a9a9a)' }}>
          Raycast-based collision for melee swings, gated behind the new
          frame-data table. Blocks the boss encounter.
        </p>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <Badge variant="outline">In Progress</Badge>
          <Badge variant="destructive">High</Badge>
        </div>
      </CardContent>
      <CardFooter style={{ gap: 8 }}>
        <Button size="sm">Open</Button>
        <Button size="sm" variant="ghost">
          Reassign
        </Button>
      </CardFooter>
    </Card>
  </Surface>
);

export const AreaSummary = () => (
  <Surface>
    <Card style={{ width: 280 }}>
      <CardHeader>
        <CardTitle>Fighting Club</CardTitle>
        <CardDescription>Beta · 3 open tasks</CardDescription>
      </CardHeader>
      <CardContent>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: 'var(--color-muted-foreground, #9a9a9a)' }}>Progress</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>64%</span>
        </div>
      </CardContent>
    </Card>
  </Surface>
);
