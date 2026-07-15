import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, vi } from 'vitest';
import { LightShell } from '../LightShell';
import {
  clearPendingEkoSpotlight,
  subscribeEkoBus,
  tryClaimEkoSpotlight,
  type EkoBusEvent,
} from '@/lib/eko-bus';

// StudioHeaderActions pulls in dynamic()/motion; mock it to a sentinel so the
// shell test stays focused on shell structure.
vi.mock('../StudioHeaderActions', () => ({
  StudioHeaderActions: (p: { email: string }) => <div data-testid="account-pill">{p.email}</div>,
}));

const accountProps = {
  email: 'k@x.com', initials: 'K', isAdmin: false, unreadCount: 0,
  notifications: [], team: [], areas: [],
} as never;

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

describe('LightShell', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: createMemoryStorage(),
    });
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createMemoryStorage(),
    });
    vi.stubGlobal('fetch', vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) as { message?: string; decision?: string } : {};
      const reply =
        body.decision === 'approve'
          ? 'Action approved. Draft is ready. I kept internal notes out and flagged one approval.'
        : body.decision === 'reject'
          ? 'Rejected. I left the dashboard unchanged.'
        : `I checked the visible dashboard and prepared a safe answer for "${body.message}".`;

      return new Response(JSON.stringify({ reply, provider: 'openai', model: 'test-model' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearPendingEkoSpotlight();
  });

  it('renders the canonical two-tab pill (Issues · Docs) with correct hrefs', () => {
    render(<LightShell>body</LightShell>);
    expect(screen.getByRole('link', { name: 'Issues' })).toHaveAttribute('href', '/issues');
    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', '/docs');
    // Overview was removed from the nav pill
    expect(screen.queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument();
  });

  it('marks only the activeTab link as aria-current', () => {
    render(<LightShell activeTab="issues">body</LightShell>);
    expect(screen.getByRole('link', { name: 'Issues' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Docs' })).not.toHaveAttribute('aria-current');
  });

  it('renders no aria-current when activeTab is undefined', () => {
    render(<LightShell>body</LightShell>);
    ['Issues', 'Docs'].forEach((n) =>
      expect(screen.getByRole('link', { name: n })).not.toHaveAttribute('aria-current'));
  });

  it('applies navLabel to the nav', () => {
    render(<LightShell navLabel="Project sections">body</LightShell>);
    expect(screen.getByRole('navigation', { name: 'Project sections' })).toBeInTheDocument();
  });

  it('renders the account pill only when account prop is set', () => {
    const { rerender } = render(<LightShell>body</LightShell>);
    expect(screen.queryByTestId('account-pill')).not.toBeInTheDocument();
    rerender(<LightShell account={accountProps}>body</LightShell>);
    expect(screen.getByTestId('account-pill')).toHaveTextContent('k@x.com');
  });

  it('renders the actions slot when provided and no account', () => {
    render(<LightShell actions={<button>New issue</button>}>body</LightShell>);
    expect(screen.getByRole('button', { name: 'New issue' })).toBeInTheDocument();
  });

  it('renders actions AND the account pill together on one bar (board toggles + cluster)', () => {
    render(
      <LightShell account={accountProps} actions={<button>Filter</button>}>
        body
      </LightShell>,
    );
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
    expect(screen.getByTestId('account-pill')).toHaveTextContent('k@x.com');
  });

  it('renders children', () => {
    render(<LightShell><p>page body</p></LightShell>);
    expect(screen.getByText('page body')).toBeInTheDocument();
  });

  it('renders leftSlot in place of the pill nav when provided', () => {
    render(<LightShell leftSlot={<a data-testid="crumb">‹ Settings</a>}>body</LightShell>);
    expect(screen.getByTestId('crumb')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Issues' })).not.toBeInTheDocument();
  });

  it('still renders the pill when leftSlot is omitted', () => {
    render(<LightShell>body</LightShell>);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Issues' })).toBeInTheDocument();
  });

  it('renders the compact bottom-right EKO dock by default', () => {
    render(<LightShell>body</LightShell>);
    expect(screen.getByRole('button', { name: /open eko/i })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /eko/i })).not.toBeInTheDocument();
  });

  it('opens a compact EKO tray with suggestions and a thinking state', async () => {
    const user = userEvent.setup();
    render(<LightShell>body</LightShell>);

    await user.click(screen.getByRole('button', { name: /open eko/i }));

    expect(screen.getByRole('dialog', { name: /eko/i })).toBeInTheDocument();
    expect(screen.getByText('Suggestions')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /draft investor update/i }));
    expect(screen.getByText(/thinking through permissions and context/i)).toBeInTheDocument();
    /* The decision ROW is the contract, not a status string. The redesign folded the
       old "Approval required" strip into the capsule, whose copy is now the specific
       request ("Move X to In Review") — so asserting that literal again would only
       re-test chrome that no longer exists. */
    expect(await screen.findByRole('button', { name: /^approve$/i })).toBeInTheDocument();
  });

  it('supports demo suggestion, approval, and composer interactions', async () => {
    const user = userEvent.setup();
    render(<LightShell>body</LightShell>);

    await user.click(screen.getByRole('button', { name: /open eko/i }));
    await user.click(screen.getByRole('button', { name: /review digest queue/i }));

    expect(screen.getByText(/thinking through permissions and context/i)).toBeInTheDocument();
    expect(await screen.findByText('Open the queued digest and mark it reviewed.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^approve$/i }));

    expect(await screen.findByText('Action approved. Draft is ready. I kept internal notes out and flagged one approval.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^approved$/i })).not.toBeInTheDocument(),
    );

    await user.type(screen.getByRole('textbox', { name: /ask eko/i }), 'Summarize risks');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByText(/prepared a safe answer for "Summarize risks"/i)).toBeInTheDocument();
  });

  it('shows a recoverable EKO error state', async () => {
    const user = userEvent.setup();
    render(<LightShell>body</LightShell>);

    await user.click(screen.getByRole('button', { name: /open eko/i }));
    await user.type(screen.getByRole('textbox', { name: /ask eko/i }), 'simulate fail');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    /* ONCE, in the capsule — and nowhere else. The failure is a state, not something EKO
       said, so it must not also land in the transcript: Retry re-runs the same path, and
       the old chat-bubble copy stacked one identical bubble per attempt. "Could not
       answer", not "EKO could not answer" — the capsule already names EKO. */
    expect((await screen.findAllByText('Could not answer')).length).toBe(1);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(screen.getByRole('textbox', { name: /ask eko/i })).toBeInTheDocument();
    /* waitFor, because the redesign gave the suggestion sheet an EXIT animation — it is
       still mounted for the length of that exit, so a synchronous query right after the
       click catches it mid-leave. The assertion is unchanged (dismiss must not dump you
       back on the suggestion sheet); it just has to outlast the animation now. */
    await waitFor(() => {
      expect(screen.queryByText('Suggestions')).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /^approve$/i })).not.toBeInTheDocument();
  });

  it('does not stack a chat bubble per failed retry', async () => {
    // Regression: failAgent used to append the error title to the chat, and Retry
    // re-enters failAgent — so five attempts left five identical "Approval could not
    // run" bubbles in the transcript, each one restating the capsule directly above it.
    const user = userEvent.setup();
    render(<LightShell>body</LightShell>);

    await user.click(screen.getByRole('button', { name: /open eko/i }));
    await user.type(screen.getByRole('textbox', { name: /ask eko/i }), 'simulate fail');
    await user.click(screen.getByRole('button', { name: /send message/i }));
    expect((await screen.findAllByText('Could not answer')).length).toBe(1);

    // Retry, fail, retry, fail. The capsule keeps saying it; the transcript stays quiet.
    await user.click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() => expect(screen.getAllByText('Could not answer').length).toBe(1));
    await user.click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() => expect(screen.getAllByText('Could not answer').length).toBe(1));

    // The prompt itself is still in the transcript — only the failure was never "said".
    expect(screen.getByText('simulate fail')).toBeInTheDocument();
  });

  it('keeps the previous edit when editing a saved revision again', async () => {
    const user = userEvent.setup();
    render(<LightShell>body</LightShell>);

    await user.click(screen.getByRole('button', { name: /open eko/i }));
    await user.click(screen.getByRole('button', { name: /draft investor update/i }));
    expect(await screen.findByRole('button', { name: /^edit$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    await user.type(screen.getByRole('textbox', { name: /edit eko request/i }), 'Make it shorter');
    await user.click(screen.getByRole('button', { name: /save edit/i }));

    expect(await screen.findByText(/revised request: make it shorter/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(screen.getByRole('textbox', { name: /edit eko request/i })).toHaveValue('Make it shorter');
  });

  it('treats typed approval as approval for the active pending request', async () => {
    const user = userEvent.setup();
    render(<LightShell>body</LightShell>);

    await user.click(screen.getByRole('button', { name: /open eko/i }));
    await user.click(screen.getByRole('button', { name: /draft investor update/i }));
    expect(await screen.findByRole('button', { name: /^approve$/i })).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /ask eko/i }), 'I already approved it');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByText('Action approved. Draft is ready. I kept internal notes out and flagged one approval.')).toBeInTheDocument();
    expect(screen.queryByText('Approval requested: I already approved it')).not.toBeInTheDocument();
  });

  it('adapts visible EKO suggestions from prior prompt context', async () => {
    const user = userEvent.setup();
    render(<LightShell>body</LightShell>);

    await user.click(screen.getByRole('button', { name: /open eko/i }));
    expect(screen.queryByRole('button', { name: /check risky changes/i })).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /ask eko/i }), 'What approvals are blocked?');
    await user.click(screen.getByRole('button', { name: /send message/i }));
    expect(await screen.findByText(/prepared a safe answer/i)).toBeInTheDocument();

    /* Escape, not a close button. The redesign deleted the header `×` — the only `×`
       left in the tray is Deny — so Escape and an outside click ARE the exit now. */
    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('button', { name: /open eko/i }));

    expect(screen.getByRole('button', { name: /review next/i })).toBeInTheDocument();
  });

  it('keeps normal chat separate from risky action approvals', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    render(<LightShell>body</LightShell>);

    await user.click(screen.getByRole('button', { name: /open eko/i }));
    await user.type(screen.getByRole('textbox', { name: /ask eko/i }), 'What tasks are currently in progress?');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByText(/prepared a safe answer/i)).toBeInTheDocument();
    expect(screen.queryByText('You asked: What tasks are currently in progress?')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^approve$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reject$/i })).not.toBeInTheDocument();

    const requestBody = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body)) as { suggestion?: unknown };
    expect(requestBody).not.toHaveProperty('suggestion');
  });

  it('sends a bare standalone confirmation to the server instead of deflecting it locally', async () => {
    // Regression: the client used to intercept a bare "yes"/"do it" with a canned
    // "tell me the specific action" reply and never call the API — so EKO forgot the
    // offer it had made the previous turn (the "Yes → dead-end" bug). A bare
    // confirmation must reach the server, which threads the conversation history and
    // stages exactly what EKO offered (still behind the approval gate).
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    render(<LightShell>body</LightShell>);

    await user.click(screen.getByRole('button', { name: /open eko/i }));
    fetchMock.mockClear();
    await user.type(screen.getByRole('textbox', { name: /ask eko/i }), 'Do it');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    // The confirmation is sent to the server (the fix), carrying the message.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const sentBody = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body)) as { message?: string };
    expect(sentBody.message).toBe('Do it');

    // The old local canned deflect is gone, and no client-side drawer/approval is forced.
    expect(await screen.findByText(/prepared a safe answer for "Do it"/i)).toBeInTheDocument();
    expect(screen.queryByText(/tell me the specific action/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: /issue details drawer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^approve$/i })).not.toBeInTheDocument();
  });

  it('keeps clarifying follow-up questions out of the approval card', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          reply: 'Please specify what you would like resent, such as an invoice or invite, since none is currently pending in the queue. Once identified, I can prepare it as Ready for approval.',
          provider: 'openai',
          model: 'test-model',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    render(<LightShell>body</LightShell>);

    await user.click(screen.getByRole('button', { name: /open eko/i }));
    await user.type(screen.getByRole('textbox', { name: /ask eko/i }), 'resend it');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByText(/please specify what you would like resent/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^approve$/i })).not.toBeInTheDocument();
  });

  it('collects missing issue approval details in a bottom drawer', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          reply: 'Ready for approval: create a new task in /issues, please share the title, priority, area, and due date so I can set it up.',
          provider: 'openai',
          model: 'test-model',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    render(<LightShell>body</LightShell>);

    await user.click(screen.getByRole('button', { name: /open eko/i }));
    await user.type(screen.getByRole('textbox', { name: /ask eko/i }), 'Create a task');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByText('Details needed')).toBeInTheDocument();
    expect(screen.getByRole('form', { name: /issue details drawer/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/issue title/i), 'Rotating maps');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(await screen.findByRole('button', { name: 'In Progress' }));
    await user.click(await screen.findByRole('button', { name: 'High' }));
    await user.click(await screen.findByRole('button', { name: 'Next week' }));
    await user.click(await screen.findByRole('button', { name: /prepare approval/i }));

    await waitFor(() =>
      expect(screen.queryByRole('form', { name: /issue details drawer/i })).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/Create Rotating maps.*In Progress.*High.*Next week/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^approve$/i }));
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2));
    const approvalBody = JSON.parse(String(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body)) as {
      suggestion?: {
        approval?: {
          kind?: string;
          draft?: Record<string, string>;
        };
      };
    };
    expect(approvalBody.suggestion?.approval).toMatchObject({
      kind: 'issue.create',
      draft: {
        title: 'Rotating maps',
        status: 'In Progress',
        priority: 'High',
        dueDate: 'Next week',
      },
    });
  });

  it('cancels the issue detail drawer without leaving an approval card behind', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          reply: 'Ready for approval: create a new task in /issues, please share the title, priority, area, and due date so I can set it up.',
          provider: 'openai',
          model: 'test-model',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    render(<LightShell>body</LightShell>);

    await user.click(screen.getByRole('button', { name: /open eko/i }));
    await user.type(screen.getByRole('textbox', { name: /ask eko/i }), 'Create a task');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByRole('form', { name: /issue details drawer/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(await screen.findByText('Cancelled. No approval request was prepared.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('form', { name: /issue details drawer/i })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /^approve$/i })).not.toBeInTheDocument();
  });

  it('keeps EKO chat history visible after closing and reopening', async () => {
    const user = userEvent.setup();
    render(<LightShell>body</LightShell>);

    await user.click(screen.getByRole('button', { name: /open eko/i }));
    await user.type(screen.getByRole('textbox', { name: /ask eko/i }), 'Show current in-progress tasks');
    await user.click(screen.getByRole('button', { name: /send message/i }));
    expect(await screen.findByText(/prepared a safe answer/i)).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /eko/i })).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /open eko/i }));

    expect(screen.getByText('Show current in-progress tasks')).toBeInTheDocument();
    expect(screen.getAllByText(/prepared a safe answer/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows a post-write receipt after an executed write and deep-links via the EKO bus', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) as { decision?: string } : {};
      const payload =
        body.decision === 'approve'
          ? {
              reply: 'Assigned "Game Mechanics" to karti.',
              provider: 'openai',
              model: 'test-model',
              intent: 'executed',
              target: {
                kind: 'task',
                taskId: 'task-1',
                taskNumber: 14,
                name: 'Game Mechanics',
                action: 'assignee',
              },
            }
          : { reply: 'ok', provider: 'openai', model: 'test-model' };

      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }));

    const events: EkoBusEvent[] = [];
    const unsubscribe = subscribeEkoBus((e) => events.push(e));

    render(<LightShell>body</LightShell>);
    await user.click(screen.getByRole('button', { name: /open eko/i }));
    await user.click(screen.getByRole('button', { name: /draft investor update/i }));
    await user.click(await screen.findByRole('button', { name: /^approve$/i }));

    const receipt = await screen.findByRole('button', {
      name: /view game mechanics on the board/i,
    });
    expect(receipt).toHaveTextContent('Game Mechanics');
    expect(receipt).toHaveTextContent('Reassigned · #14');
    expect(receipt).toHaveTextContent('View');

    // jsdom pathname is '/', so the click must both spotlight and navigate.
    // The executed write itself emits `write-executed` (board revalidation
    // signal) at approve time, before any receipt interaction.
    await user.click(receipt);
    expect(events).toEqual([
      {
        type: 'write-executed',
        target: { id: 'task-1', taskNumber: 14, name: 'Game Mechanics' },
      },
      { type: 'spotlight', target: { id: 'task-1', taskNumber: 14, name: 'Game Mechanics' } },
      { type: 'navigate', path: '/issues' },
    ]);
    // The spotlight is parked for the board to claim after navigation.
    expect(tryClaimEkoSpotlight({ id: 'task-1' })).toBe(true);
    unsubscribe();
  });

  it('renders no receipt row for a plain chat answer', async () => {
    const user = userEvent.setup();
    render(<LightShell>body</LightShell>);

    await user.click(screen.getByRole('button', { name: /open eko/i }));
    await user.type(screen.getByRole('textbox', { name: /ask eko/i }), 'What is blocked?');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByText(/prepared a safe answer/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /on the board$/i })).not.toBeInTheDocument();
  });

  it('hydrates stored EKO chat history without wiping it on mount', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      'seeko:eko-history:local',
      JSON.stringify([
        { id: 'stored-user', role: 'user', text: 'Stored question' },
        { id: 'stored-eko', role: 'eko', text: 'Stored answer' },
      ]),
    );

    render(<LightShell>body</LightShell>);
    await user.click(screen.getByRole('button', { name: /open eko/i }));

    expect(screen.getByText('Stored question')).toBeInTheDocument();
    expect(screen.getByText('Stored answer')).toBeInTheDocument();
    expect(window.localStorage.getItem('seeko:eko-history:local')).toContain('Stored answer');
  });
});
