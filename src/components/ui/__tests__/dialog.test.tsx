import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dialog, DialogHeader, DialogTitle } from '../dialog';

// The Dialog portals its overlay to <body>, so query the document (not the
// render container) for the z-50 surface node.
function getPanel(): HTMLElement {
  const panel = document.body.querySelector('.z-50');
  if (!panel) throw new Error('dialog panel not found');
  return panel as HTMLElement;
}

describe('Dialog portal / positioning', () => {
  it('portals the overlay to <body> so a transformed ancestor cannot trap its fixed positioning', () => {
    // Repro of the docs overlap bug: a `motion` ancestor (e.g. FadeRise) leaves a
    // transform on its element, which makes a nested `position: fixed` overlay
    // resolve against that ancestor instead of the viewport — shrinking the
    // backdrop to the content column and letting the fixed top bar show through.
    // The overlay must portal out to <body> to stay viewport-fixed.
    const { container } = render(
      <div data-testid="xf" style={{ transform: 'translateY(0px)' }}>
        <Dialog open onOpenChange={() => {}}>
          body
        </Dialog>
      </div>,
    );
    // The z-[60] fixed overlay must NOT live inside the transformed ancestor…
    expect(container.querySelector('.z-\\[60\\]')).toBeNull();
    // …it must be portaled to <body>, outside any transformed ancestor.
    const overlay = document.body.querySelector('.z-\\[60\\]');
    expect(overlay).not.toBeNull();
    expect(overlay!.closest('[data-testid="xf"]')).toBeNull();
  });
});

describe('Dialog light prop', () => {
  it('renders a white panel (not bg-popover) when light', () => {
    render(
      <Dialog open light onOpenChange={() => {}}>
        body
      </Dialog>,
    );
    const panel = getPanel();
    expect(panel.className).toContain('bg-surface-1');
    expect(panel.className).not.toContain('bg-popover');
  });

  it('keeps the dark bg-popover panel by default', () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        body
      </Dialog>,
    );
    const panel = getPanel();
    expect(panel.className).toContain('bg-popover');
    expect(panel.className).not.toContain('bg-surface-1');
  });

  it('gives DialogTitle a dark-on-light color inside a light Dialog', () => {
    render(
      <Dialog open light onOpenChange={() => {}}>
        <DialogHeader>
          <DialogTitle>Edit document</DialogTitle>
        </DialogHeader>
      </Dialog>,
    );
    const title = screen.getByText('Edit document');
    expect(title.className).toContain('text-ink-title');
    expect(title.className).not.toContain('text-foreground');
  });

  it('keeps DialogTitle on text-foreground inside a default Dialog', () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogHeader>
          <DialogTitle>Edit document</DialogTitle>
        </DialogHeader>
      </Dialog>,
    );
    const title = screen.getByText('Edit document');
    expect(title.className).toContain('text-foreground');
    expect(title.className).not.toContain('text-ink-title');
  });
});
