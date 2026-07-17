/** Appearance row — label + a three-segment preference control (Sun / Moon /
 *  Monitor = light / dark / system). The old two-state Sun↔Moon crossfade
 *  became ambiguous once "follow the OS" existed: at night both dark and
 *  system would show the moon, hiding WHY the canvas is dark. The active
 *  segment is the canonical sliding pill (shared-layout, TAB_PILL_SPRING).
 *  Selecting keeps the menu open so the flip is visible in place.
 *
 *  Own file, not a StudioHeaderActions local: the investor menu needs the
 *  same row, and importing the whole studio-header module there would drag
 *  NotificationBell + CreateIssueButton into the investor chunk.
 *
 *  VARIANT CONTRACT: the row animates via its host menu's stagger
 *  orchestration, so its variants must use the same 'hidden'/'shown' keys
 *  every account-menu MENU_LIST in the app declares. Both live menus build
 *  their rows from DROPDOWN.row — this one does too, so it rides any of them.
 */

import { motion, type Variants } from 'motion/react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { setThemePreference, useThemePreference, type ThemePreference } from '@/lib/theme';
import { DROPDOWN, TAB_PILL_SPRING } from '@/lib/motion';

const MENU_ROW: Variants = {
  hidden: DROPDOWN.row.initial,
  shown: { opacity: 1, y: 0, transition: DROPDOWN.row.spring },
};

const THEME_PREFERENCES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const satisfies ReadonlyArray<{
  value: ThemePreference;
  label: string;
  icon: typeof Sun;
}>;

export function AppearanceToggle({ reduce }: { reduce: boolean | null }) {
  const preference = useThemePreference();

  return (
    <motion.div variants={reduce ? undefined : MENU_ROW}>
      {/* Not a PopoverLink row: the row itself does nothing, so it skips the
          hover x-shift (that grammar promises navigation) but keeps the
          sibling-dimming so it still answers the menu's pointer choreography. */}
      <div className="flex w-full items-center justify-between rounded-2xl px-4 py-2 text-[14px] font-medium tracking-[-0.28px] text-ink-title opacity-100 transition-opacity group-hover/menu:opacity-20 hover:opacity-100!">
        <span>Appearance</span>
        <div
          role="radiogroup"
          aria-label="Appearance"
          className="flex items-center gap-0.5 rounded-full bg-wash-3 p-0.5"
        >
          {THEME_PREFERENCES.map(({ value, label, icon: Icon }) => {
            const active = preference === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={label}
                title={label}
                onClick={() => setThemePreference(value)}
                className={`relative flex size-8 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-seeko-accent/40 ${
                  active ? 'text-ink-title' : 'text-ink-muted hover:text-ink-title'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="appearance-pill"
                    transition={reduce ? { duration: 0 } : TAB_PILL_SPRING}
                    className="absolute inset-0 rounded-full bg-wash-5"
                    aria-hidden
                  />
                )}
                <Icon className="relative size-4" />
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
