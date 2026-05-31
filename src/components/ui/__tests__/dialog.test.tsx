import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dialog, DialogHeader, DialogTitle } from '../dialog';

// Grab the panel element — it's the only node carrying the z-50 surface class.
function getPanel(container: HTMLElement): HTMLElement {
  const panel = container.querySelector('.z-50');
  if (!panel) throw new Error('dialog panel not found');
  return panel as HTMLElement;
}

describe('Dialog light prop', () => {
  it('renders a white panel (not bg-popover) when light', () => {
    const { container } = render(
      <Dialog open light onOpenChange={() => {}}>
        body
      </Dialog>,
    );
    const panel = getPanel(container);
    expect(panel.className).toContain('bg-white');
    expect(panel.className).not.toContain('bg-popover');
  });

  it('keeps the dark bg-popover panel by default', () => {
    const { container } = render(
      <Dialog open onOpenChange={() => {}}>
        body
      </Dialog>,
    );
    const panel = getPanel(container);
    expect(panel.className).toContain('bg-popover');
    expect(panel.className).not.toContain('bg-white');
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
    expect(title.className).toContain('text-[#111]');
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
    expect(title.className).not.toContain('text-[#111]');
  });
});
