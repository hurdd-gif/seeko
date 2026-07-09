import * as React from 'react';
import { Select, Label } from 'seeko-studio';

// Select is a single monolithic component: it parses native <option> children into a
// custom trigger + portaled dropdown. The dropdown opens only on click and renders
// into document.body — it has NO defaultOpen/open prop and NO sub-components, so a
// STATIC capture cannot force it open. We therefore exercise the part that renders at
// rest: the trigger, populated with realistic SEEKO values (status / department /
// area / priority) via controlled `value` so it shows the selected label rather than
// the blank "Select…" fallback. One cell shows the `light` surface variant and the
// empty/placeholder state. Rendered on the DS dark page surface so the bg-card trigger
// + foreground text + chevron read the way they do in the app.
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
      width: 280,
    }}
  >
    {children}
  </div>
);

const noop = () => {};

const Field: React.FC<{ id: string; label: string; children: React.ReactNode }> = ({ id, label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <Label htmlFor={id}>{label}</Label>
    {children}
  </div>
);

export const Triggers = () => (
  <Surface>
    <Field id="sel-status" label="Status">
      <Select id="sel-status" value="In Progress" onChange={noop}>
        <option value="Backlog">Backlog</option>
        <option value="Todo">Todo</option>
        <option value="In Progress">In Progress</option>
        <option value="In Review">In Review</option>
        <option value="Done">Done</option>
        <option value="Canceled">Canceled</option>
      </Select>
    </Field>

    <Field id="sel-dept" label="Department">
      <Select id="sel-dept" value="Coding" onChange={noop}>
        <option value="Coding">Coding</option>
        <option value="Visual Art">Visual Art</option>
        <option value="UI/UX">UI/UX</option>
        <option value="Animation">Animation</option>
        <option value="Asset Creation">Asset Creation</option>
      </Select>
    </Field>

    <Field id="sel-area" label="Area">
      <Select id="sel-area" value="Fighting Club" onChange={noop}>
        <option value="Main Game">Main Game</option>
        <option value="Fighting Club">Fighting Club</option>
      </Select>
    </Field>
  </Surface>
);

export const PriorityAndEmpty = () => (
  <Surface>
    <Field id="sel-priority" label="Priority">
      <Select id="sel-priority" value="High" onChange={noop}>
        <option value="High">High</option>
        <option value="Medium">Medium</option>
        <option value="Low">Low</option>
      </Select>
    </Field>

    <Field id="sel-empty" label="Assignee (unset)">
      <Select id="sel-empty" value="" onChange={noop}>
        <option value="">Unassigned</option>
        <option value="dev">Engineering lead</option>
        <option value="art">Art lead</option>
      </Select>
    </Field>
  </Surface>
);

export const LightVariant = () => (
  <Surface>
    <Field id="sel-light-status" label="Status (light surface)">
      <Select id="sel-light-status" light value="In Review" onChange={noop}>
        <option value="Backlog">Backlog</option>
        <option value="In Progress">In Progress</option>
        <option value="In Review">In Review</option>
        <option value="Done">Done</option>
      </Select>
    </Field>
  </Surface>
);
