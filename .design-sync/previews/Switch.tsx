import * as React from 'react';
import { Switch, Label } from 'seeko-studio';

// Switch is a fully-controlled toggle (role="switch"): `checked` + onCheckedChange,
// no defaultChecked. The capture is static, so each row passes `checked` directly to
// show OFF (muted track, thumb left) vs ON (primary track, thumb translated right).
// Rendered on the DS dark page surface so the bg-input "off" track and bg-primary
// "on" track read with real contrast — both states would wash out on the white cell.
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
      gap: 16,
      width: 340,
    }}
  >
    {children}
  </div>
);

const SettingRow: React.FC<{ id: string; checked: boolean; label: string }> = ({ id, checked, label }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
    <Label htmlFor={id}>{label}</Label>
    <Switch id={id} checked={checked} />
  </div>
);

export const States = () => (
  <Surface>
    <SettingRow id="sw-off" checked={false} label="Activity feed digest" />
    <SettingRow id="sw-on" checked label="Email me on new task" />
  </Surface>
);

export const SettingsPanel = () => (
  <Surface>
    <SettingRow id="set-1" checked label="Show bounty on board cards" />
    <SettingRow id="set-2" checked label="Notify on assignee change" />
    <SettingRow id="set-3" checked={false} label="Weekly progress summary" />
    <SettingRow id="set-4" checked={false} label="Contractor mode" />
  </Surface>
);
