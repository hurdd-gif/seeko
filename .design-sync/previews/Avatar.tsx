import * as React from 'react';
import { Avatar, AvatarFallback } from 'seeko-studio';

// Avatar is the rounded clipping frame; it defaults to h-8/w-8 (32px) and only
// shows content via AvatarFallback. AvatarFallback renders a deterministic
// GradientAvatar when its children are a plain string (initials), giving each
// teammate a stable colour identity in place of grey initials. SEEKO is a
// dark dashboard, so each cell sits on the DS page surface (white preview cell
// would otherwise swallow the light foreground).
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
      alignItems: 'center',
    }}
  >
    {children}
  </div>
);

// Distinct seeds → distinct gradients; initials are neutral placeholders.
export const TeamRoster = () => (
  <Surface>
    {[
      { hash: 'profile-mg-coding', initials: 'MG' },
      { hash: 'profile-fc-visual', initials: 'FC' },
      { hash: 'profile-rl-uiux', initials: 'RL' },
      { hash: 'profile-tn-anim', initials: 'TN' },
    ].map(({ hash, initials }) => (
      <Avatar key={hash} style={{ width: 48, height: 48 }}>
        <AvatarFallback hash={hash}>{initials}</AvatarFallback>
      </Avatar>
    ))}
  </Surface>
);

// Sizes — same seed at 32 / 48 / 64px so the clip + gradient scale cleanly.
export const Sizes = () => (
  <Surface>
    {[32, 48, 64].map((s) => (
      <Avatar key={s} style={{ width: s, height: s }}>
        <AvatarFallback hash="profile-dih-204">AC</AvatarFallback>
      </Avatar>
    ))}
  </Surface>
);

// Overlapping assignee stack as it appears on a task card.
export const AssigneeStack = () => (
  <Surface>
    <div style={{ display: 'flex' }}>
      {[
        { hash: 'stack-mg', initials: 'MG' },
        { hash: 'stack-fc', initials: 'FC' },
        { hash: 'stack-rl', initials: 'RL' },
      ].map(({ hash, initials }, i) => (
        <Avatar
          key={hash}
          style={{
            width: 40,
            height: 40,
            marginLeft: i === 0 ? 0 : -12,
            boxShadow: '0 0 0 2px var(--color-background, #1a1a1a)',
          }}
        >
          <AvatarFallback hash={hash}>{initials}</AvatarFallback>
        </Avatar>
      ))}
    </div>
  </Surface>
);
