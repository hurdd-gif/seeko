import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentCompanion } from '@/components/dashboard/AgentCompanion';

/* The cycling "working" label lives in its own leaf (ThinkingLabel) so its 2s clock stops
   re-rendering the whole tray. Nothing else can cover it: /eko-preview seeds workflow steps on
   every specimen, so `shouldShowWorkflowTrace` is always true there and the pending chat row
   this label lives in never mounts. Reaching it needs a preview with a phase but no suggestion
   and no steps — which is the real shape of "the user typed a question and EKO is thinking".

   Fake timers, because the clock IS the assertion. */

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

function renderThinking() {
  return render(
    <AgentCompanion
      preview={{ phase: 'thinking', chat: [{ role: 'user', text: 'what is left on the shell?' }] }}
    />,
  );
}

/* The row stacks every label in one grid cell: five invisible aria-hidden ghosts reserving the
   widest one, plus the live label on top. So "what does it say right now" is the shimmer span
   that ISN'T a ghost — plain getByText would match the ghost too.

   Take the LAST one, not the only one. Under jsdom, motion's exit never finishes (no real
   rAF, no layout), so AnimatePresence keeps every outgoing label mounted and they pile up.
   The newest is always appended last. In a real browser the old ones leave. */
function liveLabel(container: HTMLElement) {
  const spoken = container.querySelectorAll('.eko-shimmer-text:not([aria-hidden])');
  return spoken[spoken.length - 1]?.textContent ?? null;
}

describe('AgentCompanion — thinking label', () => {
  it('renders a live working label while EKO is thinking', () => {
    const { container } = renderThinking();
    expect(liveLabel(container)).toBe('Reading the live board…');
  });

  it('advances on its own clock, without the tray owning the tick', () => {
    vi.useFakeTimers();
    try {
      const { container } = renderThinking();
      expect(liveLabel(container)).toBe('Reading the live board…');

      act(() => void vi.advanceTimersByTime(2000));
      expect(liveLabel(container)).toBe('Checking areas and milestones…');

      act(() => void vi.advanceTimersByTime(2000));
      expect(liveLabel(container)).toBe('Cross-checking tasks and dates…');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reserves the widest label so the row does not pulse as the words change', () => {
    const { container } = renderThinking();
    const ghosts = [...container.querySelectorAll('.eko-shimmer-text[aria-hidden]')];
    expect(ghosts.map((node) => node.textContent)).toEqual([
      'Reading the live board…',
      'Checking areas and milestones…',
      'Cross-checking tasks and dates…',
      'Reasoning through your request…',
      'Pulling it together…',
    ]);
  });

  it('stops its clock when the run ends', () => {
    vi.useFakeTimers();
    try {
      const clearInterval = vi.spyOn(window, 'clearInterval');
      renderThinking();
      cleanup();
      expect(clearInterval).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
