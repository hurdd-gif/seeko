import * as React from 'react';
import {
  DialogHeader,
  DialogTitle,
  Button,
  Badge,
  Input,
  Label,
} from 'seeko-studio';

// Dialog portals its overlay to <body> via createPortal, so an open <Dialog/>
// never renders inside the capture cell. To show a styled, representative panel
// in-card we compose the Dialog PANEL chrome inline (mirroring the real panel's
// classes: rounded, bordered, popover bg, top-right close affordance) and use the
// real DialogHeader / DialogTitle sub-components for the header. The light cell
// mirrors the opt-in `light` variant (white panel, dark text).
const Surface: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      background: 'var(--color-background, #1a1a1a)',
      color: 'var(--color-foreground, #f0f0f0)',
      fontFamily: 'var(--font-outfit), system-ui, sans-serif',
      padding: 24,
      borderRadius: 12,
      position: 'relative',
      minHeight: 240,
      display: 'flex',
      justifyContent: 'center',
    }}
  >
    {children}
  </div>
);

// Dark panel chrome mirroring the real Dialog motion.div panel.
const Panel: React.FC<{ children: React.ReactNode; light?: boolean }> = ({ children, light }) => (
  <div
    className={
      light
        ? 'relative flex flex-col rounded-xl border border-black/[0.06] bg-white shadow-xl'
        : 'relative flex flex-col rounded-xl border border-white/[0.08] bg-popover backdrop-blur-xl backdrop-saturate-150 shadow-xl'
    }
    style={{ width: 460 }}
  >
    {/* top-right close affordance, mirroring the real toolbar */}
    <div className="absolute right-3 top-4 flex items-center gap-0.5 z-10">
      <button
        type="button"
        className={
          'flex size-8 items-center justify-center rounded-md opacity-60 ' +
          (light ? 'text-[#505050] hover:bg-black/[0.04]' : 'hover:bg-white/[0.06]')
        }
        aria-label="Close"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
    <div className="p-6">{children}</div>
  </div>
);

// Task-edit dialog body — header + form fields + footer actions.
export const TaskEdit = () => (
  <Surface>
    <Panel>
      <DialogHeader>
        <DialogTitle>Edit task · DIH-204</DialogTitle>
      </DialogHeader>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Label>Task name</Label>
          <Input defaultValue="Implement combat hit-detection" />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Badge variant="secondary">Coding</Badge>
          <Badge variant="outline">In Progress</Badge>
          <Badge variant="destructive">High</Badge>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Label>Area</Label>
          <Input defaultValue="Main Game" />
        </div>
      </div>
      <div
        style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}
      >
        <Button variant="outline" size="sm">
          Cancel
        </Button>
        <Button size="sm">Save changes</Button>
      </div>
    </Panel>
  </Surface>
);

// Confirm-style dialog body with a short message.
export const ConfirmPublish = () => (
  <Surface>
    <Panel>
      <DialogHeader>
        <DialogTitle>Publish Fighting Club to Beta?</DialogTitle>
      </DialogHeader>
      <p
        style={{
          margin: 0,
          fontSize: 14,
          lineHeight: 1.55,
          color: 'var(--color-muted-foreground, #9a9a9a)',
        }}
      >
        This moves the area into the Beta phase and notifies every assignee with open
        tasks. You can roll it back from area settings.
      </p>
      <div
        style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}
      >
        <Button variant="outline" size="sm">
          Not yet
        </Button>
        <Button size="sm">Publish</Button>
      </div>
    </Panel>
  </Surface>
);

// Light opt-in variant — white panel, dark text/header.
export const LightVariant = () => (
  <Surface>
    <Panel light>
      <DialogHeader style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
        <DialogTitle style={{ color: '#111' }}>Invite teammate</DialogTitle>
      </DialogHeader>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: '#5a5a5a' }}>
          Send a SEEKO Studio invite. They&rsquo;ll join with access to their department&rsquo;s
          tasks and docs.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Label style={{ color: '#111' }}>Email</Label>
          <input
            placeholder="name@studio.dev"
            style={{
              height: 36,
              borderRadius: 8,
              border: '1px solid rgba(0,0,0,0.12)',
              background: '#fff',
              color: '#111',
              padding: '0 12px',
              fontSize: 14,
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
        </div>
      </div>
      <div
        style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}
      >
        <Button variant="outline" size="sm">
          Cancel
        </Button>
        <Button size="sm">Send invite</Button>
      </div>
    </Panel>
  </Surface>
);
