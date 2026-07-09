import * as React from 'react';
import { GradientAvatar } from 'seeko-studio';

// GradientAvatar paints two seeded radial blends over a base fill (pure SVG,
// SSR-safe) — a stable colour identity per user. It fills its box (h-full
// w-full), so each instance needs an explicit sized, clipped wrapper. SEEKO is
// a dark dashboard, so cells sit on the DS page surface.
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

const Frame: React.FC<{ size: number; radius?: number; children: React.ReactNode }> = ({
  size,
  radius,
  children,
}) => (
  <div style={{ width: size, height: size, borderRadius: radius ?? '50%', overflow: 'hidden' }}>
    {children}
  </div>
);

// Different seeds → visibly different gradients (the whole point of the seed).
export const Seeds = () => (
  <Surface>
    {['profile-mg-coding', 'profile-fc-visual', 'profile-rl-uiux', 'profile-tn-anim', 'profile-as-asset'].map(
      (seed) => (
        <Frame key={seed} size={56}>
          <GradientAvatar seed={seed} label="Teammate" />
        </Frame>
      )
    )}
  </Surface>
);

// Same seed is deterministic — three sizes produce the identical gradient.
export const Sizes = () => (
  <Surface>
    {[40, 56, 72].map((s) => (
      <Frame key={s} size={s}>
        <GradientAvatar seed="area-fighting-club" label="Fighting Club" />
      </Frame>
    ))}
  </Surface>
);

// Rounded-square variant (e.g. an area / project tile) vs the circular default.
export const RoundedSquare = () => (
  <Surface>
    {[
      { seed: 'area-main-game', r: 14 },
      { seed: 'area-fighting-club', r: 14 },
      { seed: 'task-DIH-204', r: 14 },
    ].map(({ seed, r }) => (
      <Frame key={seed} size={64} radius={r}>
        <GradientAvatar seed={seed} label={seed} />
      </Frame>
    ))}
  </Surface>
);
