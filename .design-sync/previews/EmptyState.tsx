import * as React from 'react';
import { EmptyState, Button } from 'seeko-studio';

// EmptyState renders inline (icon + title + optional description + optional CTA).
// Rendered on the DS dark page surface so the light foreground title + muted
// description + muted-foreground/40 icon all read (the shared title is invisible
// on white, but legible on this #1a1a1a surface).
//
// EmptyState wraps its content in motion.div with initial={{ opacity: 0, y: 12 }}.
// The static screenshot capture freezes at frame 0, so the content would render
// fully transparent. ForceVisible injects an !important stylesheet that overrides
// motion's (non-important) inline opacity/transform so the entrance-animated
// content shows at its resting state.
let fvId = 0;
const ForceVisible: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const cls = React.useMemo(() => `ds-fv-${++fvId}`, []);
  return (
    <div className={cls}>
      <style>{`.${cls} *{opacity:1 !important;transform:none !important;}`}</style>
      {children}
    </div>
  );
};

const Surface: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      background: 'var(--color-background, #1a1a1a)',
      color: 'var(--color-foreground, #f0f0f0)',
      fontFamily: 'var(--font-outfit), system-ui, sans-serif',
      padding: 24,
      borderRadius: 12,
      position: 'relative',
      minHeight: 80,
      width: 420,
    }}
  >
    <ForceVisible>{children}</ForceVisible>
  </div>
);

export const ReviewColumn = () => (
  <Surface>
    <EmptyState
      icon="CheckSquare"
      title="No tasks in review"
      description="Tasks you move to review will appear here for the team to verify."
    />
  </Surface>
);

export const NoActivity = () => (
  <Surface>
    <EmptyState
      icon="Activity"
      title="No activity yet"
      description="Status changes, reassignments, and new tasks across Main Game and Fighting Club will show up in this feed."
    />
  </Surface>
);

export const WithAction = () => (
  <Surface>
    <EmptyState
      icon="FileText"
      title="No docs in this space"
      description="Create a game design doc or onboarding page to get the team aligned."
      action={<Button size="sm">New doc</Button>}
    />
  </Surface>
);

export const EmptyTeam = () => (
  <Surface>
    <EmptyState
      icon="Users"
      title="No teammates here"
      description="Invite contributors across Coding, Visual Art, UI/UX, Animation, and Asset Creation."
    />
  </Surface>
);
