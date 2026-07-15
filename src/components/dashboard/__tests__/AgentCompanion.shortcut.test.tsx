import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { AgentCompanion } from '@/components/dashboard/AgentCompanion';

/* ⌘E is the only way into EKO that costs no pointer, so the thing worth pinning is not
   "the tray opened" — it is that the caret ends up in the composer. An open tray with
   focus still on <body> makes the chord a half-measure: the user still has to click. */
describe('AgentCompanion — ⌘E', () => {
  /* The tray PERSISTS whether it was open (readStoredEkoOpen/writeStoredEkoOpen), so a
     case that ends with it open leaves the next mount already open — and localStorage
     outlives a render in jsdom. Without the wipe, "a bare e does nothing" would be
     asserting against a tray the PREVIOUS case opened, and would pass or fail on test
     order rather than on the shortcut. */
  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  it('opens the tray and puts the caret in the composer', async () => {
    const user = userEvent.setup();
    render(<AgentCompanion />);

    expect(screen.queryByLabelText('Ask EKO')).not.toBeInTheDocument();

    await user.keyboard('{Meta>}e{/Meta}');

    const composer = await screen.findByLabelText('Ask EKO');
    await waitFor(() => expect(composer).toHaveFocus());
  });

  it('takes the caret without wiping the thread when the tray is already open', async () => {
    const user = userEvent.setup();
    render(<AgentCompanion />);

    await user.keyboard('{Meta>}e{/Meta}');
    const composer = await screen.findByLabelText('Ask EKO');
    await waitFor(() => expect(composer).toHaveFocus());

    /* Half a prompt, then focus parked elsewhere — the state a user is in when they
       reach for the chord a second time. It must hand the caret back and select what is
       there (so typing replaces it), NOT re-run openCompanion, which clears the tray. */
    await user.type(composer, 'draft the update');
    composer.blur();
    expect(composer).not.toHaveFocus();

    await user.keyboard('{Meta>}e{/Meta}');

    await waitFor(() => expect(composer).toHaveFocus());
    expect(composer).toHaveValue('draft the update');
    expect(composer.selectionStart).toBe(0);
    expect(composer.selectionEnd).toBe('draft the update'.length);
  });

  it('ignores a bare e, so typing the letter never summons the tray', async () => {
    const user = userEvent.setup();
    render(<AgentCompanion />);

    await user.keyboard('e');

    expect(screen.queryByLabelText('Ask EKO')).not.toBeInTheDocument();
  });
});
