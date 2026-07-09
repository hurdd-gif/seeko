import * as React from 'react';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from 'seeko-studio';

// DropdownMenuContent portals to <body> AND positions itself against a live
// trigger ref, so it never renders meaningfully inside the capture cell. To show
// a styled, representative OPEN menu in-card we compose the menu PANEL chrome
// inline (mirroring DropdownMenuContent's classes) and fill it with the real
// DropdownMenuItem / DropdownMenuLabel / DropdownMenuSeparator sub-components.
// They're wrapped in <DropdownMenu> so they read the real menu context.
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

// Inline panel mirroring DropdownMenuContent's surface (rounded, bordered,
// blurred popover bg) so the menu reads as an open floating panel in-card.
const MenuPanel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    role="menu"
    className="z-50 min-w-[8rem] rounded-xl border border-white/[0.08] p-1.5 shadow-xl bg-popover/80 backdrop-blur-xl backdrop-saturate-150"
    style={{ width: 200 }}
  >
    {children}
  </div>
);

// Row-actions menu — Edit / Reassign / Delete on a task row.
export const RowActions = () => (
  <Surface>
    <DropdownMenu>
      <MenuPanel>
        <DropdownMenuLabel>DIH-204</DropdownMenuLabel>
        <DropdownMenuItem>Edit task</DropdownMenuItem>
        <DropdownMenuItem>Reassign</DropdownMenuItem>
        <DropdownMenuItem>Duplicate</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive hover:text-destructive">
          Delete
        </DropdownMenuItem>
      </MenuPanel>
    </DropdownMenu>
  </Surface>
);

// Status switcher — selected check on the active status.
export const StatusSwitcher = () => (
  <Surface>
    <DropdownMenu>
      <MenuPanel>
        <DropdownMenuLabel>Move to</DropdownMenuLabel>
        <DropdownMenuItem selected={false}>Backlog</DropdownMenuItem>
        <DropdownMenuItem selected={false}>Todo</DropdownMenuItem>
        <DropdownMenuItem selected>In Progress</DropdownMenuItem>
        <DropdownMenuItem selected={false}>In Review</DropdownMenuItem>
        <DropdownMenuItem selected={false}>Done</DropdownMenuItem>
      </MenuPanel>
    </DropdownMenu>
  </Surface>
);

// Filter menu — department filters with a checked entry.
export const DepartmentFilter = () => (
  <Surface>
    <DropdownMenu>
      <MenuPanel>
        <DropdownMenuLabel>Department</DropdownMenuLabel>
        <DropdownMenuItem selected>Coding</DropdownMenuItem>
        <DropdownMenuItem selected={false}>Visual Art</DropdownMenuItem>
        <DropdownMenuItem selected={false}>UI/UX</DropdownMenuItem>
        <DropdownMenuItem selected={false}>Animation</DropdownMenuItem>
        <DropdownMenuItem selected={false}>Asset Creation</DropdownMenuItem>
      </MenuPanel>
    </DropdownMenu>
  </Surface>
);
