import { useState } from 'react';

import { AgentCompanion, type AgentCompanionPreview } from '@/components/dashboard/AgentCompanion';

/* QA harness for the EKO tray redesign. Every phase rendered side by side so the
 * new capsule language can be read across states in one look, without driving the
 * real agent: `preview` seeds INITIAL state, and /api/agent/chat is only reachable
 * from approve/reject/submit — all of which need a click. Nothing here clicks.
 *
 * Auth-free by design, same as /investor-preview and /sign/qa. */

const CHAT: AgentCompanionPreview['chat'] = [
  { id: 'p1', role: 'user', text: 'Draft the investor update for July.' },
  {
    id: 'p2',
    role: 'eko',
    text: 'Draft is ready. I kept internal notes out and flagged one approval.',
  },
];

const SPECIMENS: Array<{ name: string; note: string; preview: AgentCompanionPreview }> = [
  {
    name: 'Dock · collapsed',
    note: 'The resting state. Outer glass frame + inner gradient pill.',
    preview: { collapsed: true },
  },
  {
    name: 'Idle · suggestions',
    note: 'Capsule neutral. No decision row.',
    preview: { phase: 'idle' },
  },
  {
    name: 'Thinking',
    note: 'Capsule neutral, trace running blue.',
    preview: {
      phase: 'thinking',
      suggestionId: 'investor-update',
      chat: CHAT.slice(0, 1),
      steps: ['Reading dashboard state', 'Drafting investor update'],
    },
  },
  {
    name: 'Approval',
    note: 'Capsule amber, two lines. Decision row pinned.',
    preview: {
      phase: 'approval',
      approvalStatus: 'pending',
      suggestionId: 'investor-update',
      approvalCopy: 'Move "Investor update — July" to In Review',
      chat: CHAT.slice(0, 1),
      steps: ['Reading dashboard state', 'Drafting investor update'],
    },
  },
  {
    name: 'Committing',
    note: 'Decision row disabled mid-write. Escape is ignored here.',
    preview: {
      phase: 'committing',
      approvalStatus: 'approved',
      suggestionId: 'investor-update',
      approvalCopy: 'Move "Investor update — July" to In Review',
      chat: CHAT.slice(0, 1),
      steps: ['Reading dashboard state', 'Drafting investor update'],
    },
  },
  {
    name: 'Complete · approved',
    note: 'Capsule speaks the OUTCOME, not a status line. Receipt below.',
    preview: {
      phase: 'complete',
      approvalStatus: 'approved',
      suggestionId: 'investor-update',
      response: 'Draft is ready. I kept internal notes out and flagged one approval.',
      chat: CHAT,
      steps: ['Reading dashboard state', 'Drafting investor update'],
      receipt: {
        reply: 'Draft is ready. I kept internal notes out and flagged one approval.',
        target: {
          kind: 'task',
          taskId: 'preview-task',
          taskNumber: 214,
          name: 'Investor update — July',
          action: 'status',
        },
      },
    },
  },
  {
    name: 'Complete · rejected',
    note: 'The state the user corrected: the capsule must carry this sentence.',
    preview: {
      phase: 'complete',
      approvalStatus: 'rejected',
      suggestionId: 'investor-update',
      response: 'Rejected. No dashboard changes were made.',
      chat: CHAT.slice(0, 1),
      steps: ['Reading dashboard state', 'Drafting investor update'],
    },
  },
  {
    name: 'Complete · answered',
    note: 'A read-only answer — nothing was written, so there is no receipt.',
    preview: {
      phase: 'complete',
      approvalStatus: 'answered',
      response:
        'Four tasks are blocked.\nTwo are waiting on you; the other two are waiting on art.',
      chat: [
        { id: 'a1', role: 'user', text: 'What is blocked right now?' },
        {
          id: 'a2',
          role: 'eko',
          text: 'Four tasks are blocked.\nTwo are waiting on you; the other two are waiting on art.',
        },
      ],
    },
  },
  {
    name: 'Error',
    note: 'Capsule red, left-aligned. Decision row becomes Retry / Dismiss.',
    preview: {
      phase: 'error',
      suggestionId: 'investor-update',
      error: {
        title: 'Could not reach dashboard',
        message: 'The agent stopped before making changes.',
        action: 'select',
      },
      chat: CHAT.slice(0, 1),
      steps: ['Reading dashboard state', 'Drafting investor update'],
    },
  },
];

export function EkoPreviewRoute() {
  /* The state SHEET below shows eight end frames. It cannot show a handover — every tray
     is a separate mount, so nothing on it ever transitions into anything else. This is the
     other half: one tray, driven through the same specimens, so the thing being judged
     (the morph between states) is the thing on screen. */
  const [stepIndex, setStepIndex] = useState(0);
  const step = SPECIMENS[stepIndex];

  return (
    <main className="min-h-dvh bg-canvas p-8">
      <header className="mx-auto mb-8 max-w-[1400px]">
        <h1 className="text-[20px] font-semibold text-ink-primary">EKO — state sheet</h1>
        <p className="mt-1 text-[13px] text-ink-muted">
          Seeded state only. Nothing on this page can reach the live agent. Toggle the dashboard
          theme to check the tray against both canvases.
        </p>
      </header>

      <section className="mx-auto mb-8 max-w-[1400px]">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-1 text-[13px] font-semibold text-ink-primary">Morph</h2>
          {SPECIMENS.map((specimen, index) => (
            <button
              key={specimen.name}
              type="button"
              onClick={() => setStepIndex(index)}
              aria-pressed={index === stepIndex}
              className={
                index === stepIndex
                  ? 'rounded-full bg-ink-primary px-3 py-1.5 text-[12px] font-medium text-canvas transition-transform duration-150 ease-out active:scale-[0.96]'
                  : 'rounded-full px-3 py-1.5 text-[12px] font-medium text-ink-muted shadow-[inset_0_0_0_1px_var(--color-wash-8)] transition-[color,transform] duration-150 ease-out hover:text-ink-primary active:scale-[0.96]'
              }
            >
              {specimen.name}
            </button>
          ))}
        </div>

        {/* Same `translateZ(0)` trick as the grid: it makes this section the containing
            block for the tray's `position: fixed`, so the tray anchors here and not to the
            viewport corner. */}
        <div className="relative h-[620px] overflow-hidden rounded-[18px] bg-surface-1 shadow-[inset_0_0_0_1px_var(--color-wash-6)] [transform:translateZ(0)]">
          <div className="p-4">
            <p className="text-[12px] leading-4 text-ink-muted">
              Click through the states — the tray morphs between them instead of remounting.
            </p>
          </div>
          {/* No `key`: remounting would restore the hard cut this harness exists to expose. */}
          <AgentCompanion preview={step.preview} />
        </div>
      </section>

      {/* The tray is position:fixed, so without intervention all eight would pile up
          on the viewport's bottom-right corner. `translateZ(0)` makes each section a
          containing block for fixed descendants, which re-anchors its tray to that
          section's own bottom-right. */}
      <div className="mx-auto grid max-w-[1400px] grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-6">
        {SPECIMENS.map((specimen) => (
          <section
            key={specimen.name}
            className="relative h-[620px] overflow-hidden rounded-[18px] bg-surface-1 shadow-[inset_0_0_0_1px_var(--color-wash-6)] [transform:translateZ(0)]"
          >
            <div className="p-4">
              <h2 className="text-[13px] font-semibold text-ink-primary">{specimen.name}</h2>
              <p className="mt-0.5 text-[12px] leading-4 text-ink-muted">{specimen.note}</p>
            </div>
            <AgentCompanion preview={specimen.preview} />
          </section>
        ))}
      </div>
    </main>
  );
}
