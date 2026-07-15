'use client';

import {
  type FormEvent,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
  type Transition,
} from 'motion/react';
import {
  Check,
  CircleAlert,
  FileText,
  LoaderCircle,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { emitEkoEvent, requestEkoSpotlight } from '@/lib/eko-bus';
import { newConversationId, executedTarget, shouldOpenApprovalCard } from '@/lib/eko-agent-client';
import { confirmationRoute } from '@/lib/agent-confirmation';

/**
 * Cycling "working" labels shown while the in-server tool-use loop runs (~60s,
 * no streaming). Each line must be TRUE at any moment of a read→reason→stage
 * loop — the agent genuinely re-reads the board and re-reasons across steps —
 * so the sequence can loop without ever falsely claiming completion. Ordered
 * to read as forward progress on the first pass; looping after that is honest
 * because a multi-step loop keeps reading and reasoning.
 */
const THINKING_STEPS = [
  'Reading the live board…',
  'Checking areas and milestones…',
  'Cross-checking tasks and dates…',
  'Reasoning through your request…',
  'Pulling it together…',
] as const;
/** Dwell per label — long enough to read a short phrase, short enough to feel alive. */
const THINKING_STEP_MS = 2000;

const suggestions = [
  {
    id: 'investor-update',
    icon: Plus,
    title: 'Draft investor update',
    meta: 'Investor-safe brief',
    action: 'Draft',
    step: 'Drafting investor update',
    approvalCopy: 'Create an investor-safe update from blocked tasks.',
    response: 'Draft is ready. I kept internal notes out and flagged one approval.',
  },
  {
    id: 'digest-queue',
    icon: FileText,
    title: 'Review digest queue',
    meta: '1 draft waiting',
    action: 'Open',
    step: 'Opening digest queue',
    approvalCopy: 'Open the queued digest and mark it reviewed.',
    response: 'Digest queue opened. One draft needs approval before it can be shared.',
  },
  {
    id: 'risky-changes',
    icon: ShieldCheck,
    title: 'Check risky changes',
    meta: 'Review before write',
    action: 'Review',
    step: 'Checking risky changes',
    approvalCopy: 'Move one blocked task into review.',
    response: 'Risk check found one write action. Approval is required before it runs.',
  },
];

type Suggestion = (typeof suggestions)[number];
type ApprovalStatus = 'pending' | 'editing' | 'approved' | 'rejected' | 'answered';
type AgentPhase = 'idle' | 'thinking' | 'approval' | 'committing' | 'complete' | 'error';
type AgentIconState = 'idle' | 'thinking' | 'working' | 'finished' | 'permission' | 'error';
type FailedAction = 'select' | 'approve' | 'reject' | 'prompt' | null;
type AgentError = {
  title: string;
  message: string;
  action: FailedAction;
};
type EkoApiRequest = {
  message: string;
  mode?: 'chat' | 'approval';
  decision?: 'approve' | 'reject';
  conversationId?: string;
  pendingActionIds?: string[];
  suggestion?: {
    id: string;
    title: string;
    meta: string;
    approvalCopy: string;
    approval?: EkoApiResponse['approval'];
  };
  revision?: string;
  clientContext?: {
    path: string;
    title: string;
    recentHistory?: Array<{
      role: 'user' | 'eko' | 'action';
      text: string;
    }>;
  };
};
type EkoApiResponse = {
  reply: string;
  provider?: string;
  model?: string;
  intent?: 'answer' | 'clarification' | 'details_needed' | 'approval_required' | 'executed' | 'rejected';
  approval?: {
    kind?: 'issue.create' | 'issue.update' | 'generic';
    title?: string;
    copy?: string;
    draft?: {
      title?: string;
      status?: string;
      priority?: string;
      dueDate?: string;
    };
  };
  /**
   * Mirrors AgentWriteTarget in src/api-server/agent/tool-contract.ts —
   * present only on `executed` responses that changed one task. Drives the
   * post-write receipt row; UI choreography metadata only, never a write path.
   */
  target?: {
    kind: 'task';
    taskId: string;
    taskNumber?: number | null;
    name: string;
    action: 'create' | 'status' | 'assignee' | 'priority' | 'dueDate';
  };
  /** Staged writes awaiting approval, keyed server-side by conversationId. */
  pendingActions?: Array<{ id: string; toolId: string; summary: string }>;
  /** Results of an approval decision — one entry per approved pendingActionId. */
  executed?: Array<{ pendingActionId: string; ok: boolean; reply: string; target?: EkoApiResponse['target'] }>;
};
type WriteReceipt = {
  target: NonNullable<EkoApiResponse['target']>;
  /** The executed reply this receipt belongs to — hides the row once a newer response replaces demoResponse. */
  reply: string;
};
type PendingWriteDraft = {
  title: string;
  status: string;
  priority: string;
  dueDate: string;
};
type WriteDetailsStep = 'title' | 'status' | 'priority' | 'dueDate' | 'review';
type SuggestionStats = Record<string, { count: number; lastUsed: number }>;
type ChatHistoryItem = {
  id: string;
  role: 'user' | 'eko' | 'action';
  text: string;
};

const emptyPendingWriteDraft: PendingWriteDraft = {
  title: '',
  status: '',
  priority: '',
  dueDate: '',
};
const writeStatusOptions = ['Todo', 'In Progress', 'In Review', 'Backlog'];
const writePriorityOptions = ['Urgent', 'High', 'Medium', 'Low'];
const writeDueDateOptions = ['Today', 'Tomorrow', 'Next week', 'No date'];
const writeDetailsSteps: Array<{ id: WriteDetailsStep; label: string }> = [
  { id: 'title', label: 'Name' },
  { id: 'status', label: 'Status' },
  { id: 'priority', label: 'Priority' },
  { id: 'dueDate', label: 'Due' },
  { id: 'review', label: 'Review' },
];
/* ─────────────────────────────────────────────────────────
 * CAPSULE SKINS — the redesign's single status surface.
 *
 * One pill, tinted by phase, lit from its bottom edge. It replaces
 * BOTH the old header (wordmark / online dot / close) and the old
 * status strip, and it grows vertically to fit unbounded, model-
 * generated approval copy rather than truncating it.
 *
 * Gradients are ported verbatim from the Paper source — the oklab
 * interpolation hints (the bare `58.6%,` stops) are load-bearing:
 * they hold the glow against the pill's bottom edge instead of
 * letting it bleed to the vertical middle. Do not "simplify" them
 * into two-stop gradients.
 * ───────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────
 * TRACE CHIP SKINS — read off Paper's "Workflow trace" frame.
 *
 * Both chips are 18px with a HALF-pixel ring and a vertical gradient.
 * They are box-shadow rings rather than Paper's `border: 0.5px solid`
 * for one reason: a real sub-pixel border participates in layout and
 * rounds to 0 or 1 device pixels depending on DPR, so the chip's edge
 * flickers between displays. An inset shadow draws the same 0.5px at
 * the same colour without touching the box.
 *
 * There is no `failed` skin on the board — Paper's error board reuses
 * the running blue chip. That is a design gap, not an instruction: a
 * spinner still spinning under an error capsule reads as "working".
 * The red skin below extends the language rather than copying it.
 * ───────────────────────────────────────────────────────── */
const TRACE_CHIP = {
  done: {
    ring: 'inset 0 0 0 0.5px rgba(255,255,255,0.16)',
    glow: 'linear-gradient(in oklab 180deg, oklab(100% 0 0 / 8%) 0%, oklab(59.4% 0 0 / 8%) 100%)',
    ink: 'rgba(255,255,255,0.43)',
  },
  active: {
    ring: 'inset 0 0 0 0.5px #0582f6',
    glow: 'linear-gradient(in oklab 180deg, oklab(28.8% -0.025 -0.060 / 30%) 0.04%, oklab(52.7% -0.052 -0.136 / 30%) 73.69%)',
    ink: 'rgba(0,134,255,0.96)',
  },
  failed: {
    ring: 'inset 0 0 0 0.5px #ff6150',
    glow: 'linear-gradient(in oklab 180deg, oklab(28.8% 0.060 0.025 / 30%) 0.04%, oklab(52.7% 0.136 0.052 / 30%) 73.69%)',
    ink: 'rgba(255,136,120,0.96)',
  },
} as const;

const CAPSULE_SKIN = {
  neutral: {
    ring: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
    glow: 'linear-gradient(in oklab 180deg, oklab(0% 0 0 / 7.5%) 0%, oklab(0% 0 0 / 9.9%) 18.36%, 58.6%, oklab(59.7% -0.046 -0.216 / 15%) 82.94%, 89.48%, oklab(75.6% 0.089 0.154 / 15%) 100%)',
    ink: 'rgba(255,255,255,0.66)',
  },
  approval: {
    ring: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
    glow: 'linear-gradient(in oklab 180deg, oklab(0% 0 0 / 30%) 0.12%, 31.37%, oklab(3% 0.002 0.006 / 30%) 38.67%, 81.9%, oklab(70.5% 0.045 0.131 / 30%) 100%)',
    ink: 'rgba(255,211,156,0.66)',
  },
  error: {
    ring: 'inset 0 0 0 1px rgba(145,78,69,0.10)',
    glow: 'linear-gradient(in oklab 180deg, oklab(0% 0 0 / 30%) 0.12%, 31.37%, oklab(3% 0.002 0.006 / 30%) 38.67%, 66.86%, oklab(39.1% 0.084 0.046 / 23%) 100%)',
    ink: 'rgba(255,97,80,0.66)',
  },
} as const;

type CapsuleTone = keyof typeof CAPSULE_SKIN;

/* ToneLayers mounts every tone at once, so it wants the gradients alone — the ring and ink
   still come from the active skin, because those two ARE interpolable and can just be
   animated on the element itself. */
const CAPSULE_GLOWS: Record<string, string> = Object.fromEntries(
  Object.entries(CAPSULE_SKIN).map(([tone, skin]) => [tone, skin.glow]),
);

/* The tray FRAME carries two skins, and which one it wears is a signal, not decoration.
   Paper draws the suggestion board (5SJ-0) with a lit bottom rim — a blue that rolls
   into warm across the last 11% — and a BLUE drop shadow under the panel. Every other
   board (6SN-0) is the same shape in grey. So the tray literally warms up when EKO has
   something to offer, and cools back to grey once the conversation is underway and the
   panel is just holding a transcript.

   Both are one linear-gradient with matched stop positions, and both shadows have the
   same structure — which is what lets them CROSSFADE and interpolate rather than snap.
   Values read from Paper via get_computed_styles, not from a screenshot. */
const FRAME_SKIN = {
  neutral: {
    gradient:
      'linear-gradient(in oklab 180deg, oklab(0% 0 0) 0%, 90.03%, oklab(47.3% 0 0 / 30%) 100%)',
    shadow: 'inset 0 0 0 1px rgba(255,255,255,0.18), 0 18px 52px -34px rgba(78,78,78,0.72)',
  },
  suggestions: {
    gradient:
      'linear-gradient(in oklab 180deg, oklab(0% 0 0) 0%, 80.32%, oklab(45% -0.034 -0.118 / 30%) 89.22%, oklab(50.3% 0.059 0.102 / 30%) 100%)',
    shadow: 'inset 0 0 0 1px rgba(255,255,255,0.18), 0 18px 52px -34px rgba(24,119,252,0.72)',
  },
} as const;

const FRAME_GRADIENTS: Record<string, string> = Object.fromEntries(
  Object.entries(FRAME_SKIN).map(([tone, skin]) => [tone, skin.gradient]),
);

/* The collapsed dock's ring is OUTSET where the tray's is inset, so this one cannot
   interpolate with the two above — it snaps. That is invisible: it only ever changes on
   the dock↔tray morph, where the whole box is already changing shape. */
const DOCK_SHADOW = '0 0 0 1px rgba(255,255,255,0.18), 0 10px 28px -18px rgba(0,0,0,0.78)';

/* The composer owns its own text, and that is the whole point of it being a component.

   The value used to be `useState` in the tray root, which meant every character the user
   typed re-rendered the entire tray — all ~2,900 lines of it: every Motion element, the
   dot-matrix loader, the suggestion list, the full chat history — and re-ran Motion's
   projection over the lot. Measured against the PRODUCTION bundle at 4x CPU throttle, not
   the dev build: EVERY keystroke missed the frame budget. Median 40ms, worst 64ms, and not
   one of 54 characters came in under 16ms. That is the "occasional lag" — it isn't
   occasional at all, it is every key, and it gets worse exactly when the tray is busiest
   (typing a follow-up while the loader is still animating), which is what made it feel
   intermittent.

   Nothing outside this form ever read the value: the send button disables on `isThinking`,
   never on emptiness, and the submit handler already guarded the empty string itself. So
   the text has no business in the root. It lives here, and the root hears about it exactly
   once — on submit. A keystroke now re-renders an input and a button.

   Deliberately NOT memo'd: `onSubmit` is rebuilt on every root render, so a memo boundary
   would never actually skip, and pretending otherwise is worse than not having one. It
   doesn't matter — the root no longer renders while you type, and when it does render (a
   state morph) this leaf SHOULD re-render, because that is how `disabled` arrives.

   Keep the string here. The moment something outside needs the live value (a character
   count, a slash-command menu, disable-send-when-empty), lift the DERIVED fact — not the
   string — or the whole tree is back on the keystroke path. */
function TrayComposer({
  inputRef,
  disabled,
  onSubmit,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  disabled: boolean;
  onSubmit: (prompt: string) => void;
}) {
  const [value, setValue] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = value.trim();
    if (!prompt || disabled) return;
    onSubmit(prompt);
    setValue('');
  }

  return (
    <div className="sticky bottom-0 z-20 order-9 px-3 pb-3 pt-3">
      <form
        onSubmit={handleSubmit}
        /* Neutral ground, not navy: the blue now belongs to EKO's own voice (its
           bubbles, its running trace step). The field the user types into shouldn't
           wear the agent's colour. */
        className="flex h-9 w-full items-center gap-2 rounded-full bg-[rgba(24,24,24,0.28)] px-3.5 text-left text-[12px] font-medium leading-[16px] text-white/58 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-xl transition-[background-color,box-shadow,transform] duration-150 ease-out focus-within:bg-white/[0.11] focus-within:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14),inset_0_1px_0_rgba(255,255,255,0.09)]"
      >
        <input
          ref={inputRef}
          aria-label="Ask EKO"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Speak to EKO"
          disabled={disabled}
          className="min-w-0 flex-1 bg-transparent text-[12px] font-medium leading-[16px] text-white/78 outline-none placeholder:text-white/48 disabled:cursor-not-allowed disabled:text-white/38"
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={disabled}
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-white/50 transition-[background-color,color,opacity,transform] duration-150 ease-out hover:bg-white/10 hover:text-white active:scale-[0.96] disabled:pointer-events-none disabled:opacity-38"
        >
          <Send className="size-3.5" aria-hidden />
        </button>
      </form>
    </div>
  );
}

/* The cycling "working" label, and its clock, live down here for the same reason the
   composer's text does — and this one is the more expensive mistake of the two.

   The index used to be `useState` in the tray root, advanced by a `setInterval`. So every
   THINKING_STEP_MS (2s), for the ENTIRE ~60s an agent run takes, the whole tray re-rendered
   just to swap three words — around thirty full re-renders per run, each one re-running
   Motion's projection over every layout element in the tray while the dot-matrix loader was
   mid-animation. Measured: one dropped frame per tick, on the tick, for a solid minute.

   That is the "occasional" lag. It was never occasional and it was never random — it was
   periodic, once every two seconds, but only while EKO was working, which is exactly when
   you are watching the tray and not touching it.

   The clock belongs to the thing it drives. The root no longer knows this index exists, and
   the row unmounts when the run ends, so the next run starts from rest for free. */
function ThinkingLabel({ reduceMotion }: { reduceMotion: boolean }) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setStepIndex((i) => (i + 1) % THINKING_STEPS.length);
    }, THINKING_STEP_MS);
    return () => window.clearInterval(id);
  }, []);

  const label = THINKING_STEPS[stepIndex];

  return (
    <span className="flex items-center gap-2">
      <DotMatrixAgentLoader state="thinking" className="size-5 shrink-0 text-[#d7e8ff]" />
      {/* Grid overlay: invisible ghosts reserve the widest label so the row width is
          stable across messages (no pulse); the live label crossfades over them as the
          loop advances. */}
      <span className="relative grid min-h-[15px] flex-none">
        {THINKING_STEPS.map((step) => (
          <span
            key={`ghost-${step}`}
            aria-hidden
            className="invisible col-start-1 row-start-1 whitespace-nowrap eko-shimmer-text"
          >
            {step}
          </span>
        ))}
        <AnimatePresence initial={false}>
          <motion.span
            key={label}
            className="col-start-1 row-start-1 whitespace-nowrap eko-shimmer-text"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, filter: 'blur(2px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, filter: 'blur(2px)' }}
            transition={
              reduceMotion ? { duration: 0.12 } : { type: 'spring', visualDuration: 0.2, bounce: 0 }
            }
          >
            {label}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  );
}

/* Crossfading two OPAQUE layers does not give you an opaque surface. Alpha composites as
   `a_top + a_bottom * (1 - a_top)`, so two layers passing each other through 0.5 land at
   0.75 — a 25% hole straight through the panel to the page behind it. Both FRAME_SKIN
   gradients start at `oklab(0% 0 0)`, fully opaque black, so the old keyed-crossfade
   turned the tray to GLASS for the length of every tone change. The panel visibly went
   translucent and came back, which is a large part of why the states read as being loaded
   out and back in rather than moving.

   So the tones do not crossfade. Every tone is mounted at once; the incoming one sits on
   top and dissolves in OVER the outgoing one, which holds at full opacity underneath until
   it is covered, and only then clears. Composite alpha is 1 at every instant — only the
   colour travels. The `isolate` wrapper keeps this z-order private, so the layers can
   never paint over the tray's content. */
function ToneLayers({
  skins,
  active,
  transition,
  wrapperClassName,
  layerClassName,
}: {
  skins: Record<string, string>;
  active: string;
  transition: Transition;
  wrapperClassName: string;
  layerClassName: string;
}) {
  /* The outgoing layer clears the instant the incoming one has fully covered it — no
     sooner, or the hole opens; no later, and it would have to be re-faded on the way back. */
  const hold = typeof transition.duration === 'number' ? transition.duration : 0.34;

  return (
    <span aria-hidden className={cn('isolate', wrapperClassName)}>
      {Object.entries(skins).map(([tone, gradient]) => {
        const lit = tone === active;
        return (
          <motion.span
            key={tone}
            className={layerClassName}
            style={{ backgroundImage: gradient, zIndex: lit ? 1 : 0 }}
            initial={false}
            animate={{ opacity: lit ? 1 : 0 }}
            transition={lit ? transition : { duration: 0, delay: hold }}
          />
        );
      })}
    </span>
  );
}

/* Past any real scrollHeight, and `scrollTop` clamps to the scrollable range — so this
   pins the scroller to the bottom without reading geometry back out of the browser. */
const SCROLL_PIN = 1e7;

/* Cancelling a staged write is an OUTCOME, not an answer: something changed (the request
   was dropped) and the only place that fact exists is the capsule. It rides in
   `demoResponse` because every path that starts new work already clears that field, so the
   note cannot outlive its turn — but the capsule matches this exact string rather than
   "demoResponse is non-empty", so a future reply landing in the same field can never be
   mistaken for a cancellation. */
const WRITE_CANCELLED_NOTE = 'Cancelled. No approval request was prepared.';

function shouldDemoFail(value: string) {
  return /\b(error|fail|offline|timeout)\b/i.test(value);
}

/* The component's ONLY network call. Kept at module scope — it closes over nothing,
   so re-creating it per render bought us nothing but a new identity every frame. */
async function requestEko(input: EkoApiRequest): Promise<EkoApiResponse> {
  const response = await fetch('/api/agent/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : 'EKO request failed.';
    throw new Error(message);
  }

  if (!body || typeof body !== 'object' || typeof (body as { reply?: unknown }).reply !== 'string') {
    throw new Error('EKO returned an invalid response.');
  }

  return body as EkoApiResponse;
}

const EKO_OPEN_STORAGE_KEY = 'seeko:eko-open';
const EKO_LEARNING_STORAGE_PREFIX = 'seeko:eko-learning';
const EKO_HISTORY_STORAGE_PREFIX = 'seeko:eko-history';
const MAX_HISTORY_ITEMS = 10;

function readStoredEkoOpen() {
  try {
    return window.sessionStorage.getItem(EKO_OPEN_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeStoredEkoOpen(open: boolean) {
  try {
    window.sessionStorage.setItem(EKO_OPEN_STORAGE_KEY, String(open));
  } catch {
    // EKO still works if storage is blocked; it just won't persist between routes.
  }
}

function hashStorageSegment(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function getLearningStorageKey(userKey?: string) {
  return `${EKO_LEARNING_STORAGE_PREFIX}:${userKey ? hashStorageSegment(userKey) : 'local'}`;
}

function getHistoryStorageKey(userKey?: string) {
  return `${EKO_HISTORY_STORAGE_PREFIX}:${userKey ? hashStorageSegment(userKey) : 'local'}`;
}

function readSuggestionStats(userKey?: string): SuggestionStats {
  try {
    const raw = window.localStorage.getItem(getLearningStorageKey(userKey));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};

    const stats: SuggestionStats = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!suggestions.some((suggestion) => suggestion.id === id)) continue;
      if (!value || typeof value !== 'object') continue;
      const record = value as Record<string, unknown>;
      const count = typeof record.count === 'number' ? record.count : 0;
      const lastUsed = typeof record.lastUsed === 'number' ? record.lastUsed : 0;
      if (count > 0) stats[id] = { count, lastUsed };
    }
    return stats;
  } catch {
    return {};
  }
}

function writeSuggestionStats(userKey: string | undefined, stats: SuggestionStats) {
  try {
    window.localStorage.setItem(getLearningStorageKey(userKey), JSON.stringify(stats));
  } catch {
    // Suggestion learning is a progressive enhancement; EKO still works without it.
  }
}

function readChatHistory(userKey?: string): ChatHistoryItem[] {
  try {
    const raw = window.localStorage.getItem(getHistoryStorageKey(userKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item): ChatHistoryItem | null => {
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        const role = record.role === 'user' || record.role === 'eko' || record.role === 'action' ? record.role : null;
        const text = typeof record.text === 'string' ? record.text.trim() : '';
        const id = typeof record.id === 'string' ? record.id : `${Date.now()}-${Math.random()}`;
        if (!role || !text) return null;
        return { id, role, text: text.slice(0, 420) };
      })
      .filter((item): item is ChatHistoryItem => Boolean(item))
      .slice(-MAX_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

function writeChatHistory(userKey: string | undefined, history: ChatHistoryItem[]) {
  try {
    window.localStorage.setItem(getHistoryStorageKey(userKey), JSON.stringify(history.slice(-MAX_HISTORY_ITEMS)));
  } catch {
    // History is a local convenience. EKO can still answer if storage is blocked.
  }
}

function inferSuggestionId(prompt: string) {
  if (/\b(investor|update|brief|draft|memo|summary)\b/i.test(prompt)) return 'investor-update';
  if (/\b(digest|queue)\b/i.test(prompt)) return 'digest-queue';
  if (/\b(risk|risky|approval|approve|blocked|permission|safe)\b/i.test(prompt)) return 'risky-changes';
  return null;
}

function isApprovalPromptResponse(reply: string) {
  return /^\s*ready for approval\s*:/i.test(reply);
}

function isClarifyingFollowupResponse(reply: string) {
  return /\b(please specify|which item|which task|what would you like|tell me what|i need (?:the|a)|since none|none (?:is|are) currently pending|no .* currently pending)\b/i.test(reply);
}

function shouldOpenApprovalFlow(reply: string) {
  if (isClarifyingFollowupResponse(reply)) return false;
  if (!isApprovalPromptResponse(reply)) return false;
  return true;
}

function shouldOpenApprovalFromResponse(response: EkoApiResponse) {
  // Structured signal wins: any staged write from the tool-use loop opens the
  // card, regardless of how the model phrased its reply. The intent/prose checks
  // below are legacy fallbacks (the current server sends neither).
  if (shouldOpenApprovalCard(response)) return true;
  if (response.intent === 'approval_required' || response.intent === 'details_needed') return true;
  if (response.intent) return false;
  return shouldOpenApprovalFlow(response.reply);
}

function responseNeedsWriteDetails(response: EkoApiResponse) {
  // A staged action is already fully resolved server-side — no slot-fill wizard.
  if (shouldOpenApprovalCard(response)) return false;
  if (response.intent === 'details_needed') return true;
  if (response.intent === 'approval_required') return false;
  return needsInlineWriteDetails(response.reply);
}

function needsInlineWriteDetails(reply: string) {
  return /\b(task name|issue title|\btitle\b|priority|due date|area|assignee|status|please share the|please confirm the task|specify which|which item|what action)\b/i.test(reply);
}

function stripApprovalPrefix(reply: string) {
  return reply.replace(/^\s*ready for approval\s*:\s*/i, '').trim();
}

function normalizeApprovalLabel(value: string) {
  return titleCaseIssue(
    value
      .replace(/\s+/g, ' ')
      .replace(/\b(?:please|confirm|share|provide|tell me|let me know)\b.*$/i, '')
      .replace(/\b(?:so|and)\s+i\s+can\b.*$/i, '')
      .replace(/\s+(?:in|under)\s+\/issues\b/gi, '')
      .replace(/[,;:.!?]+$/g, '')
      .trim(),
  );
}

function getGeneratedApprovalLabel(prompt: string, reply: string) {
  const action = normalizeApprovalLabel(stripApprovalPrefix(reply).split(/[,;]/)[0] ?? '');
  if (action && action.length >= 6) return action.slice(0, 72);

  const promptAction = normalizeApprovalLabel(prompt);
  return promptAction ? promptAction.slice(0, 72) : 'Approval request';
}

function createGeneratedApprovalSuggestion(_prompt: string, reply: string): Suggestion {
  const title = getGeneratedApprovalLabel(_prompt, reply);
  return {
    ...suggestions[2],
    id: 'risky-changes',
    title,
    meta: 'Approval required',
    action: 'Review',
    step: title,
    approvalCopy: reply,
    response: reply,
  };
}

function createGeneratedApprovalSuggestionFromResponse(prompt: string, response: EkoApiResponse): Suggestion {
  const staged = response.pendingActions ?? [];
  // Staged writes carry their own resolved summaries — title from those, not prose.
  const title = staged.length === 1
    ? staged[0].summary
    : staged.length > 1
      ? `${staged.length} changes to review`
      : response.approval?.title || getGeneratedApprovalLabel(prompt, response.reply);
  const copy = response.approval?.copy || response.reply;
  return {
    ...suggestions[2],
    id: 'risky-changes',
    title,
    meta: response.intent === 'details_needed' ? 'Details needed' : 'Approval required',
    action: response.intent === 'details_needed' ? 'Details' : 'Review',
    step: title,
    approvalCopy: copy,
    response: copy,
  };
}

function draftFromResponse(response: EkoApiResponse, _prompt: string): PendingWriteDraft {
  return {
    title: response.approval?.draft?.title ?? '',
    status: response.approval?.draft?.status ?? '',
    priority: response.approval?.draft?.priority ?? '',
    dueDate: response.approval?.draft?.dueDate ?? '',
  };
}

function titleCaseIssue(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.?!]+$/g, '')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function extractQuotedTitle(value: string) {
  const match = value.match(/["“]([^"”]{3,80})["”]/);
  return match ? titleCaseIssue(match[1]) : '';
}

function getInitialWriteDetailsStep(draft: PendingWriteDraft): WriteDetailsStep {
  if (!draft.title.trim()) return 'title';
  if (!draft.status.trim()) return 'status';
  if (!draft.priority.trim()) return 'priority';
  if (!draft.dueDate.trim()) return 'dueDate';
  return 'review';
}

function priorityEdgeClass(option: string, selected: boolean) {
  if (option === 'Urgent') {
    return selected
      ? 'shadow-[0_8px_20px_rgba(8,18,35,0.14),inset_0_0_0_1px_rgba(255,255,255,0.76),inset_0_-2px_14px_rgba(255,112,104,0.36)]'
      : 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1),inset_0_-2px_12px_rgba(255,112,104,0.28)]';
  }
  if (option === 'High') {
    return selected
      ? 'shadow-[0_8px_20px_rgba(8,18,35,0.14),inset_0_0_0_1px_rgba(255,255,255,0.76),inset_0_-2px_14px_rgba(255,183,82,0.34)]'
      : 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1),inset_0_-2px_12px_rgba(255,183,82,0.24)]';
  }
  if (option === 'Medium') {
    return selected
      ? 'shadow-[0_8px_20px_rgba(8,18,35,0.14),inset_0_0_0_1px_rgba(255,255,255,0.76),inset_0_-2px_14px_rgba(85,156,255,0.32)]'
      : 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1),inset_0_-2px_12px_rgba(85,156,255,0.22)]';
  }
  return selected
    ? 'shadow-[0_8px_20px_rgba(8,18,35,0.14),inset_0_0_0_1px_rgba(255,255,255,0.76),inset_0_-2px_14px_rgba(135,231,177,0.26)]'
    : 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1),inset_0_-2px_12px_rgba(135,231,177,0.18)]';
}

/* Seeds the tray's initial state so every phase can be looked at side by side.
   It is INITIAL state only — the component runs its real code paths from there.
   Nothing here fetches: /api/agent/chat is reachable only from approveAction,
   rejectAction and submitPrompt, all of which need a click. So a seeded tray
   that is never clicked cannot reach the live agent. */
export type AgentCompanionPreview = {
  /* Every other specimen seeds an OPEN tray, so the collapsed dock had no way to
     appear on the state sheet — it was the one state shipping unreviewed. */
  collapsed?: boolean;
  phase?: AgentPhase;
  approvalStatus?: ApprovalStatus;
  suggestionId?: Suggestion['id'];
  approvalCopy?: string;
  response?: string;
  error?: AgentError;
  chat?: ChatHistoryItem[];
  steps?: string[];
  receipt?: WriteReceipt;
};

export function AgentCompanion({
  userKey,
  preview,
}: {
  userKey?: string;
  preview?: AgentCompanionPreview;
}) {
  const previewSuggestion = preview?.suggestionId
    ? suggestions.find((item) => item.id === preview.suggestionId) ?? null
    : null;

  const [open, setOpen] = useState(preview ? !preview.collapsed : false);
  const [activeSuggestion, setActiveSuggestion] = useState<Suggestion | null>(previewSuggestion);
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>(
    preview?.approvalStatus ?? 'pending',
  );
  const [phase, setPhase] = useState<AgentPhase>(preview?.phase ?? 'idle');
  const [revisedRequest, setRevisedRequest] = useState('');
  const [generatedApprovalCopy, setGeneratedApprovalCopy] = useState(preview?.approvalCopy ?? '');
  const [activeApproval, setActiveApproval] = useState<EkoApiResponse['approval'] | null>(null);
  const [pendingWriteDraft, setPendingWriteDraft] = useState<PendingWriteDraft>(emptyPendingWriteDraft);
  const [writeDetailsStep, setWriteDetailsStep] = useState<WriteDetailsStep>('title');
  const [demoResponse, setDemoResponse] = useState(preview?.response ?? '');
  const [writeReceipt, setWriteReceipt] = useState<WriteReceipt | null>(preview?.receipt ?? null);
  const [agentError, setAgentError] = useState<AgentError | null>(preview?.error ?? null);
  const [editError, setEditError] = useState('');
  const [lastPrompt, setLastPrompt] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>(preview?.chat ?? []);
  const [workflowSteps, setWorkflowSteps] = useState<string[]>(preview?.steps ?? []);
  const [conversationStarted, setConversationStarted] = useState(Boolean(preview?.chat?.length));
  const [storageHydrated, setStorageHydrated] = useState(false);
  const [suggestionStats, setSuggestionStats] = useState<SuggestionStats>({});
  const [actionFeedback, setActionFeedback] = useState<'approve' | 'reject' | null>(null);
  /* A ref, not state: these ids are never drawn — they only ride along on the NEXT
     request so the server can match a decision to the actions it staged. As state,
     every response paid for a re-render that changed no pixel. */
  const pendingActionIdsRef = useRef<string[]>([]);
  const reduceMotion = useReducedMotion();

  /* `preview` is normally a SEED — read once, into initial state, and never again. The
     morph harness needs it to also be a DRIVER: /eko-preview swaps this object to step
     ONE tray between states, which is the only way the transitions between them can
     actually be watched. Eight separately-mounted trays can only ever show eight end
     frames — they cannot show a handover, which is exactly what was being judged.

     Compared by identity, so the specimen objects must stay module-level constants. This
     drives local state only; nothing here can reach the network. */
  const previewRef = useRef(preview);
  useEffect(() => {
    if (!preview || previewRef.current === preview) return;
    previewRef.current = preview;
    setOpen(!preview.collapsed);
    setPhase(preview.phase ?? 'idle');
    setApprovalStatus(preview.approvalStatus ?? 'pending');
    setActiveSuggestion(
      preview.suggestionId ? suggestions.find((item) => item.id === preview.suggestionId) ?? null : null,
    );
    setGeneratedApprovalCopy(preview.approvalCopy ?? '');
    setDemoResponse(preview.response ?? '');
    setWriteReceipt(preview.receipt ?? null);
    setAgentError(preview.error ?? null);
    setChatHistory(preview.chat ?? []);
    setWorkflowSteps(preview.steps ?? []);
    setConversationStarted(Boolean(preview.chat?.length));
  }, [preview]);
  /* Lazy, not `useRef(newConversationId())` — that form mints a fresh id on EVERY
     render and throws all but the first away.

     This does write a ref during render, which is normally forbidden. It is React's
     own lazy-init idiom and safe for the one reason that matters: the write is
     guarded and idempotent, so a replayed or discarded render lands on the same id
     rather than starting a second conversation. */
  const conversationIdRef = useRef<string>('');
  if (!conversationIdRef.current) conversationIdRef.current = newConversationId();
  const decisionTimerRef = useRef<number | null>(null);
  const companionRootRef = useRef<HTMLDivElement | null>(null);
  const trayScrollRef = useRef<HTMLDivElement | null>(null);
  const trayHeaderRef = useRef<HTMLDivElement | null>(null);
  const trayEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLInputElement | null>(null);
  /* Set by ⌘E and read once the tray is mounted. A ref rather than state because the
     caret is not a render: flipping this must not re-draw the tray mid-morph. */
  const pendingComposerFocusRef = useRef(false);
  const promptRequestRef = useRef(0);
  const titleId = useId();
  /* Motion resolves layoutId GLOBALLY, not per component instance. Every shared
     element here morphs within one tray (dock icon → capsule icon, approval card →
     receipt), so the ids must be scoped to the instance — otherwise two mounted
     trays are read as ONE shared element and Motion parks all but the winner at
     opacity 0 and flies it off-screen. That is exactly what /eko-preview does. */
  const layout = {
    icon: `studio-companion-icon-${titleId}`,
    eventSurface: `eko-event-surface-${titleId}`,
    writeStep: `eko-write-details-active-step-${titleId}`,
  };
  const personalizedSuggestions = [...suggestions].sort((a, b) => {
    const aStats = suggestionStats[a.id];
    const bStats = suggestionStats[b.id];
    const countDelta = (bStats?.count ?? 0) - (aStats?.count ?? 0);
    if (countDelta !== 0) return countDelta;
    const recencyDelta = (bStats?.lastUsed ?? 0) - (aStats?.lastUsed ?? 0);
    if (recencyDelta !== 0) return recencyDelta;
    return suggestions.findIndex((item) => item.id === a.id) - suggestions.findIndex((item) => item.id === b.id);
  });
  const visibleSuggestions = personalizedSuggestions.slice(0, 2);
  const hasApproval = Boolean(activeSuggestion && phase === 'approval');
  const hasError = phase === 'error' && Boolean(agentError);
  const shouldCollectWriteDetails =
    hasApproval
    && approvalStatus === 'editing'
    && Boolean(generatedApprovalCopy)
    // The wizard collects title/status/priority/due — an issue.create shape.
    // Opening it for delete/update/generic approvals silently converts the
    // request into a create draft ("remove the task" ends up creating one).
    && (!activeApproval || activeApproval.kind === 'issue.create')
    && !/\b(delete|remove)\b/i.test(activeSuggestion?.title ?? '')
    && (activeSuggestion?.meta === 'Details needed' || needsInlineWriteDetails(generatedApprovalCopy));
  const selectedCardDuplicatesApproval = Boolean(
    hasApproval
    && activeSuggestion
    && (activeApproval?.copy ?? (generatedApprovalCopy || activeSuggestion.approvalCopy))
      ?.toLowerCase()
      .includes(activeSuggestion.title.toLowerCase()),
  );
  const writeDetailsStepIndex = Math.max(
    0,
    writeDetailsSteps.findIndex((step) => step.id === writeDetailsStep),
  );
  const writeDetailsStepMeta =
    writeDetailsStep === 'title'
      ? {
          title: 'Name the issue',
          detail: 'Use the exact task name EKO should prepare.',
          value: pendingWriteDraft.title,
          complete: Boolean(pendingWriteDraft.title.trim()),
        }
      : writeDetailsStep === 'status'
        ? {
            title: 'Choose status',
            detail: 'Where should the issue appear once approved?',
            value: pendingWriteDraft.status,
            complete: Boolean(pendingWriteDraft.status.trim()),
          }
      : writeDetailsStep === 'priority'
        ? {
            title: 'Set priority',
            detail: 'Help EKO rank this against the active work queue.',
            value: pendingWriteDraft.priority,
            complete: Boolean(pendingWriteDraft.priority.trim()),
          }
      : writeDetailsStep === 'dueDate'
        ? {
            title: 'Set due window',
            detail: 'Pick a lightweight timing signal for the approval.',
            value: pendingWriteDraft.dueDate,
            complete: Boolean(pendingWriteDraft.dueDate.trim()),
          }
      : {
          title: 'Review request',
          detail: 'EKO will prepare this as a gated approval, not write it yet.',
          value: 'Ready',
          complete: true,
        };
  const isThinking = phase === 'thinking';
  const isCommitting = phase === 'committing';
  const traceCompact =
    phase === 'approval' || phase === 'committing' || phase === 'complete' || phase === 'error';
  const expanded = open;
  const showTray = open;
  const hasSelectedAction = Boolean(activeSuggestion);
  /* The last EKO bubble used to be dropped whenever its text was already on screen
     somewhere else — back when the event surface printed the whole reply. It no
     longer does: the capsule carries a short outcome and the receipt names the task,
     so the bubble is the ONLY place the full answer is written. Dropping it left a
     read-only answer with nowhere to be read. */
  const visibleChatHistory = chatHistory;
  const activeStep = activeSuggestion?.step ?? (lastPrompt ? `You asked: ${lastPrompt}` : 'Checking dashboard context');
  const shouldShowWorkflowTrace = Boolean(activeSuggestion || workflowSteps.length);
  const currentSteps = [
    ...workflowSteps,
    ...(shouldShowWorkflowTrace && (activeSuggestion || phase === 'thinking' || phase === 'committing')
      ? [activeStep]
      : []),
  ]
    .filter((step, index, steps) => step && steps.indexOf(step) === index)
    // Drop steps that are a case-insensitive substring of another step —
    // keep the longer one (e.g. "Assign X" vs "Approval requested: Assign X").
    .filter((step, _index, steps) =>
      !steps.some(
        (other) =>
          other !== step
          && other.toLowerCase() !== step.toLowerCase()
          && other.toLowerCase().includes(step.toLowerCase()),
      ),
    );
  const hasUserChat = chatHistory.some((item) => item.role === 'user');
  const latestUserPrompt =
    [...chatHistory].reverse().find((item) => item.role === 'user')?.text ?? lastPrompt;
  const inferredChatSuggestion = latestUserPrompt ? inferSuggestionId(latestUserPrompt) : null;
  const contextualChatSuggestions =
    hasUserChat && !activeSuggestion && inferredChatSuggestion && phase !== 'thinking' && phase !== 'committing'
      ? suggestions.filter((item) => item.id === inferredChatSuggestion)
      : [];
  // While an action flow is live, its "Approval requested:" receipt already
  // shows in the selected card / approval card — hide the duplicate history
  // row (display-only; stored history is untouched) until the flow resolves.
  const actionFlowLive =
    Boolean(activeSuggestion)
    && (phase === 'thinking' || phase === 'approval' || phase === 'committing');
  const visibleChatRows: Array<ChatHistoryItem & { pending?: boolean }> = [
    ...visibleChatHistory.filter(
      (item) =>
        !(
          actionFlowLive
          && item.role === 'action'
          && activeSuggestion
          && item.text.toLowerCase().includes(activeSuggestion.title.toLowerCase())
        ),
    ),
    ...(isThinking && !shouldShowWorkflowTrace
      ? [{
          id: 'eko-thinking-row',
          role: 'eko' as const,
          /* Empty on purpose: `pending` rows render <ThinkingLabel/>, which owns the live
             word and its clock. Putting the current label here would drag the tick back
             into the root's render — the whole point was to get it out. */
          text: '',
          pending: true,
        }]
      : []),
  ];
  const hasConversationStarted = hasUserChat || conversationStarted || Boolean(lastPrompt);
  const showSuggestions = phase === 'idle' && !hasConversationStarted && chatHistory.length === 0;
  const SelectedIcon = activeSuggestion?.icon;
  const statusLine =
    phase === 'idle'
      /* Idle does not always mean "fresh". Chat history is restored from storage on
         reload while `phase` resets to idle — so a returning user saw the capsule
         pitch suggestions above a conversation they had already had. The capsule
         only advertises the suggestions when the suggestions are actually on screen;
         once there is a conversation it just reports that nothing is running.

         The count is read off the list rather than hardcoded to "2" — the string and
         the array could disagree, and the string would win. */
      ? showSuggestions
        ? `${suggestions.length} suggestion${suggestions.length === 1 ? '' : 's'}`
        : 'Ready'
      : phase === 'error'
        ? agentError?.title ?? 'Something went wrong'
      : phase === 'thinking'
        ? 'Thinking through next action'
        : phase === 'approval'
          ? shouldCollectWriteDetails
            ? 'Details needed before approval'
          : approvalStatus === 'editing'
            ? 'Revision requested'
            : 'Approval required before write'
          : phase === 'committing'
            ? approvalStatus === 'approved'
              ? 'Approving action'
              : 'Denying action'
          : shouldCollectWriteDetails
            ? 'Details needed before approval'
          : approvalStatus === 'editing'
            ? 'Revision requested'
          : approvalStatus === 'answered'
            ? 'Answer ready.'
            : approvalStatus === 'approved'
            ? 'Action approved. Draft is ready.'
            : 'Denied. Dashboard unchanged.';
  const approvalCopy =
    shouldCollectWriteDetails
      ? 'Add the issue details below. This write stays gated until you review and approve it.'
    : approvalStatus === 'editing'
      ? 'Tell EKO what to revise below. This action stays gated until you approve it.'
    : generatedApprovalCopy
      ? generatedApprovalCopy
      : revisedRequest
        ? `Revised request: ${revisedRequest}`
        : activeSuggestion?.approvalCopy;
  const agentIconState: AgentIconState =
    phase === 'thinking'
      ? 'thinking'
      : phase === 'error'
        ? 'error'
      : phase === 'committing'
        ? 'working'
      : phase === 'approval'
        ? 'permission'
        : phase === 'complete'
          ? 'finished'
          : 'idle';
  /* The capsule swallows the status strip AND the approval card, so its copy
     has to carry whatever those two used to say. Approval leans on the full
     `approvalCopy` (model-generated, unbounded) — the pill grows rather than
     clamping the description of a write the user is about to authorise. */
  const capsuleTone: CapsuleTone =
    phase === 'error'
      ? 'error'
      : hasApproval || approvalStatus === 'editing' || shouldCollectWriteDetails
        ? 'approval'
        : 'neutral';
  const capsuleSkin = CAPSULE_SKIN[capsuleTone];
  /* The capsule carries the OUTCOME, never the essay. Every board in the redesign
     puts a short phrase here — "Approval could not run", "Create an investor-safe
     update from blocked tasks." — and lets EKO's paragraph live in the chat bubble
     underneath. So a settled turn gets a written sentence, not a status label
     ("Answer ready."), and not the model's prose, which has no length bound and
     would clamp mid-word.

     A read-only answer has no outcome to carry at all — nothing was written, and the
     answer itself is already on screen in the bubble. So it doesn't get a phrase; it
     rests. See `capsuleResting`. */
  const capsuleCopy =
    phase === 'error'
      ? agentError?.title ?? 'Something went wrong'
      : hasApproval && approvalCopy
        ? approvalCopy
        : isThinking
          ? 'Thinking through permissions and context'
          : phase === 'complete' && approvalStatus === 'rejected'
            ? 'Rejected. No dashboard changes were made.'
            : phase === 'complete' && approvalStatus === 'approved'
              ? writeReceipt
                ? 'Approved. The dashboard is updated.'
                : 'Approved.'
              : phase === 'complete' && demoResponse === WRITE_CANCELLED_NOTE
                ? WRITE_CANCELLED_NOTE
                : statusLine;
  /* Every capsule state now aligns left behind its icon — error included. Centring the
     error made it the one line in the tray that broke the spine the icon sets, and once
     the copy wrapped to two lines the centred text read as a banner rather than as the
     capsule's own sentence. */
  /* At rest the capsule has nothing to report, so it stops being a pill and becomes just
     the mark. Two ways to get there, and they are the same fact:

     - Idle with a conversation already on screen. "Ready" was a word that filled the
       space without informing anyone.
     - A settled read-only answer. "Answer ready." announces a thing the user is already
       looking at — the answer is in the bubble directly below it. Nothing was written,
       so there is no outcome to carry, and a pill that only restates its own arrival is
       the same empty word as "Ready".

     A settled WRITE is not resting: "Approved. The dashboard is updated." / "Rejected. No
     dashboard changes were made." / the cancellation note each report something that
     happened OFF screen, which is exactly what the capsule is for.

     Idle BEFORE a conversation is not resting either: the capsule is still pitching the
     suggestions sitting right under it, and that line is doing work. */
  const capsuleResting =
    (phase === 'idle' && !showSuggestions)
    || (phase === 'complete'
      && approvalStatus === 'answered'
      && demoResponse !== WRITE_CANCELLED_NOTE);
  /* Same flag that decides whether the capsule is pitching suggestions. The frame and
     the capsule light up together or not at all — one signal, two surfaces. */
  const frameTone: keyof typeof FRAME_SKIN = showSuggestions ? 'suggestions' : 'neutral';
  const frameSkin = FRAME_SKIN[frameTone];
  /* The decision row lives in the pinned header, not the scroller — an
     Approve button for a live DB write must never be scrollable out of view. */
  const showActionRow = (hasApproval && !shouldCollectWriteDetails) || hasError;

  /* ONE spring for every `layout` and `layoutId` on this surface, and that is not a
     tidiness preference — it is the fix for the jitter.

     Motion animates a layout change by snapping the element's real box to its final
     size and then counter-transforming it back, frame by frame. A child inside a
     layout-animating parent is therefore drawn at `parentProgress ∘ childProgress`.
     The shell ran at 820/64, the capsule inside it at 430/42, and the swapped region
     inside THAT at 460/40 with a 50ms head start — three curves, three settle times.
     So during every state change the capsule was still travelling after the frame
     around it had stopped, and the region was still travelling after the capsule had.
     Children visibly slid against their own container. That is the "jitter": not a
     dropped frame, but three springs disagreeing about where a box is.

     Overdamped on purpose (damping 46 > 2√(520·0.72) ≈ 38.7): a panel that carries an
     Approve button for a live DB write should settle, not wobble. */
  const layoutTransition = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 520, damping: 46, mass: 0.72 };
  const surfaceTransition = layoutTransition;
  const dockTransition = layoutTransition;
  const fadeTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.11, ease: [0.22, 1, 0.36, 1] as const };
  /* The body's three faces (suggestions ↔ selected card ↔ trace) hand over IN SEQUENCE:
     one AnimatePresence, `mode="wait"`, exit fully before enter. See THE BODY SWAP.

     Two earlier attempts at this pair both failed, in opposite directions, and it is worth
     saying why so nobody splits the difference again. The first ran a 70ms exit and delayed
     the enter by 100ms: for a tenth of a second there was nothing on the glass at all — a
     HOLE — and then the next state appeared, already in place. The second removed the delay
     entirely, which put the exit and the enter on top of each other and printed both layouts
     at once. Neither is a timing problem. Both were symptoms of the regions living in
     separate presence trees, where the only two options ARE a hole or an overlap, because
     nothing sequences them.

     One tree sequences them, and the frame does the rest: the exiting face stays in flow, so
     the panel holds its height until the swap commits and then springs to the new one. The
     handover is covered by the frame's own movement instead of by a gap or a blend.

     Exit is short and accelerating (Emil: exits are faster and softer than enters). The enter
     is the SAME spring as every layout animation here, so the face settles exactly when the
     frame around it does, and an interrupted change redirects from wherever it is. */
  /* 90ms, and the number is load-bearing. `mode="wait"` buys sequence at the cost of a gap:
     for the length of the exit the frame is holding its old height with nothing in it. At
     130ms that gap was two clear frames of empty panel — the "loaded out, loaded in" reading
     again, just cleaner than before. At 90ms the old face is gone before the eye resolves the
     emptiness, and the frame's own spring is still travelling when the new face arrives, so
     the movement is continuous across the seam. Do not lengthen this to make the exit more
     visible; the exit is not meant to be watched. */
  const swapExitTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.09, ease: [0.4, 0, 1, 1] as const };
  const swapEnterTransition = layoutTransition;
  /* Tone travel (neutral → amber → red). Slower than the body swap and with no delay:
     colour is the tray's slowest-moving signal, and it should feel like the surface warming
     rather than a new surface arriving. This is NOT a crossfade — see ToneLayers. */
  const toneTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.34, ease: [0.22, 1, 0.36, 1] as const };
  /* THE OPEN. The panel is one box that grows out of the dock's bottom-right corner
     under a layout spring, with `overflow-hidden` clipping everything to it. That box
     is the whole problem: while it is small its clip window is small, so its top-left
     edge sweeps up-and-left across the interior as it grows. Anything already opaque
     inside gets wiped in by that edge — a hard geometric reveal riding on a soft spring,
     which is the "spawned from the left" the eye catches.

     The interior does not fight the clip; it hides under it. Both interior layers —
     the gradient fill AND the tray content (whose rows and composer carry their own
     dark backgrounds) — ride THIS one curve, so they rise together as a single surface
     instead of the content popping to full opacity first and the fill chasing it in.
     Fading is the mask: the ease-in-out holds the interior near-invisible through the
     small-box phase where the clip cuts hardest, then brings it up only once the box is
     nearly full and the clip has nothing left to cut. ease-in-out, not the ease-out the
     other enters use — an ease-out is already at speed on frame one, so it would be
     opaque exactly when the clip is at its worst, which is the impression to remove.

     One constant for both layers is the fix, not tidiness: the artifact was them being
     on DIFFERENT clocks (fill on this curve, content on the fast morph-enter), so the
     content led and the fill lagged. Locked to one curve, nothing can lead or lag. */
  const panelRevealTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.32, ease: [0.65, 0, 0.35, 1] as const };
  const approvalTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.16, ease: [0.22, 1, 0.36, 1] as const };
  const drawerTransition = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 520, damping: 34, mass: 0.72 };
  // Dock ↔ tray is one continuous surface: both content layers crossfade IN
  // PLACE while the container morphs. Enter starts immediately (no delay) so
  // the surface never reads as an empty shell mid-morph; exit lingers through
  // most of the travel. Both layers carry `layout` so Motion counter-scales
  // them against the container's morph — nothing scale-distorts.
  const morphExitTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const };
  const morphEnterTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.16, ease: [0.22, 1, 0.36, 1] as const };
  // The tray is a large surface: on close its content must dissolve WITH the
  // collapse (gentler curve, a beat longer than the dock's exit) or the
  // shrinking panel reads as an empty grey shell.
  const trayExitTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.26, ease: [0.4, 0, 0.2, 1] as const };
  const pulseTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const };
  const writeDetailsDrawerClass =
    writeDetailsStep === 'review'
      ? 'min-h-[424px]'
      : writeDetailsStep === 'status' || writeDetailsStep === 'priority' || writeDetailsStep === 'dueDate'
        ? 'min-h-[386px]'
        : 'min-h-[318px]';
  const writeDetailsBodyClass =
    writeDetailsStep === 'review'
      ? 'min-h-[166px]'
      : writeDetailsStep === 'title'
        ? 'min-h-[58px]'
        : 'min-h-[128px]';

  /* ⌘E (⌃E off Mac) summons EKO from anywhere in the dashboard and lands the caret in
     the composer, so the shortcut costs one chord and not a chord plus a click. The
     listener is unconditional — it is the only way IN, so unlike Escape below it must
     be live while the tray is closed.

     Already open, it does NOT re-open: openCompanion() clears the conversation, and a
     user reaching for the chord mid-thread wants the caret, not a wipe. So an open tray
     only takes focus. */
  useEffect(() => {
    if (preview) return;

    function onShortcut(event: KeyboardEvent) {
      if (event.key !== 'e' && event.key !== 'E') return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      event.preventDefault();
      if (open) {
        focusComposer();
        return;
      }
      /* The composer does not exist yet — the tray mounts on this state change. Leave a
         note for the effect below, which runs once it does. */
      pendingComposerFocusRef.current = true;
      openCompanion();
    }

    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preview]);

  /* The other half of the chord: the tray is now mounted, so the caret has somewhere to
     go. Deferred a frame because the tray enters under a layout animation, and focusing
     an element the browser still considers off-screen makes it scroll the page to chase
     it. One frame in, the box is where it belongs. */
  useEffect(() => {
    if (!open) {
      pendingComposerFocusRef.current = false;
      return;
    }
    if (!pendingComposerFocusRef.current) return;

    /* The flag is cleared INSIDE the frame, not before scheduling it. StrictMode mounts
       this effect twice — mount, clean up, mount again — so clearing it up front meant
       the cleanup cancelled the only frame ever scheduled and the second pass saw a
       spent flag and did nothing. The caret never moved. Consumed on fire, the second
       pass still has a live flag and re-schedules. */
    const frame = window.requestAnimationFrame(() => {
      pendingComposerFocusRef.current = false;
      focusComposer();
    });
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* The redesign has no close button — the `×` in the header is gone, and the one
     that remains is Deny, not Close. So these two ARE the exit. Without them the
     tray is a trap: it covers the bottom-right of every page with no way back to
     the dock. Both are ignored while a decision is committing, so neither a stray
     key nor a stray click can walk away from an in-flight write. */
  useEffect(() => {
    if (!open || preview) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || isCommitting) return;
      event.preventDefault();
      closeCompanion();
    }

    function onPointerDown(event: PointerEvent) {
      if (isCommitting) return;
      const root = companionRootRef.current;
      if (!root || root.contains(event.target as Node)) return;
      closeCompanion();
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isCommitting, preview]);

  useEffect(() => {
    // Under preview the phase is the specimen — don't let it tick forward.
    if (preview || !activeSuggestion || phase !== 'thinking') return;

    const timer = window.setTimeout(() => {
      setPhase('approval');
      setDemoResponse(activeSuggestion.response);
    }, reduceMotion ? 0 : 650);

    return () => window.clearTimeout(timer);
  }, [activeSuggestion, phase, reduceMotion, preview]);

  useEffect(() => {
    if (!actionFeedback) return;

    const timer = window.setTimeout(() => setActionFeedback(null), reduceMotion ? 0 : 900);
    return () => window.clearTimeout(timer);
  }, [actionFeedback, reduceMotion]);

  useEffect(() => {
    return () => {
      if (decisionTimerRef.current !== null) window.clearTimeout(decisionTimerRef.current);
    };
  }, []);

  /* Storage is bypassed under `preview`, in both directions: reading would clobber
     the seeded state, and writing would leak fixture chat into the real user's
     history. The QA harness must not be able to touch what the dashboard persists. */
  useEffect(() => {
    if (preview) return;
    const storedOpen = readStoredEkoOpen();
    if (storedOpen && !open) {
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (preview) return;
    writeStoredEkoOpen(open);
  }, [open, preview]);

  useEffect(() => {
    if (preview) return;
    setSuggestionStats(readSuggestionStats(userKey));
    setChatHistory(readChatHistory(userKey));
    setStorageHydrated(true);
  }, [userKey, preview]);

  useEffect(() => {
    if (!storageHydrated || preview) return;
    writeSuggestionStats(userKey, suggestionStats);
  }, [storageHydrated, suggestionStats, userKey, preview]);

  useEffect(() => {
    if (!storageHydrated || preview) return;
    writeChatHistory(userKey, chatHistory);
  }, [chatHistory, storageHydrated, userKey, preview]);

  useEffect(() => {
    if (!open || !hasConversationStarted) return;
    const tray = trayScrollRef.current;
    if (!tray) return;

    /* Write-only, and that is the whole point. This used to be
       `tray.scrollTop = tray.scrollHeight` — a geometry READ — inside a rAF loop that
       runs for 550ms after every state change, i.e. across the entire morph. Reading
       scrollHeight right after Motion has invalidated styles forces a synchronous
       layout, so the loop paid for a full relayout on every single frame of every
       transition (Chrome's trace: 152ms of forced reflow, the top offender on the
       page, and the reason the states stuttered rather than glided).

       scrollTop clamps to the scrollable range, so assigning a value past the end pins
       the scroller to the bottom without ever asking the browser where the bottom is. */
    const lockToBottom = () => {
      tray.scrollTop = SCROLL_PIN;
    };

    lockToBottom();
    if (reduceMotion) return;

    // Hold the lock while entering surfaces spring to size, or the growing
    // approval card slides under the sticky composer mid-animation.
    let frame = 0;
    const startedAt = performance.now();
    const tick = () => {
      lockToBottom();
      if (performance.now() - startedAt < 550) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [open, hasConversationStarted, reduceMotion, visibleChatHistory.length, demoResponse, phase, shouldCollectWriteDetails, writeDetailsStep]);

  useLayoutEffect(() => {
    if (!open) return;
    const tray = trayScrollRef.current;
    const header = trayHeaderRef.current;
    if (!tray || !header) return;

    /* The header contains the capsule, so its height changes on every state that grows
       the copy to two lines or drops the decision row in. The observer therefore fires
       mid-morph, and it used to read `offsetHeight` and rewrite three properties every
       time — including two mask strings — whether or not the number had actually moved.
       Layout invalidated, layout forced, repeat (84ms of reflow in the trace).

       Guarded on change and deferred to the next frame: the write no longer happens
       inside the observer's own layout pass, so it cannot force a second one. The
       inset lags by a frame, which nothing can see — the header is an overlay and the
       content beneath it is masked out before it reaches the header's edge. */
    let lastInset = -1;
    let insetFrame = 0;

    const syncHeaderInset = () => {
      insetFrame = 0;
      const inset = header.offsetHeight;
      if (inset === lastInset) return;
      lastInset = inset;
      tray.style.paddingTop = `${inset}px`;
      // The header's backdrop-blur scrims cannot veil the chat bubbles: the tray
      // container's own backdrop-filter makes it a backdrop root, and Chromium's
      // nested backdrop-filters only sample the page BEHIND that root — never
      // sibling content painted inside it (verified live; bubbles stay legible
      // even with the container filter disabled). So veil at the source: mask
      // the scroller so its content dissolves before it reaches the header.
      const mask = `linear-gradient(to bottom, transparent ${Math.max(0, inset - 30)}px, black ${inset + 10}px)`;
      tray.style.maskImage = mask;
      tray.style.webkitMaskImage = mask;
    };

    const scheduleHeaderInset = () => {
      if (insetFrame) return;
      insetFrame = window.requestAnimationFrame(syncHeaderInset);
    };

    syncHeaderInset();
    const observer = new ResizeObserver(scheduleHeaderInset);
    observer.observe(header);
    return () => {
      observer.disconnect();
      if (insetFrame) window.cancelAnimationFrame(insetFrame);
    };
  }, [open]);

  function cancelDecisionTimer() {
    if (decisionTimerRef.current !== null) {
      window.clearTimeout(decisionTimerRef.current);
      decisionTimerRef.current = null;
    }
  }

  /* `select()` and not a bare `focus()`: if a half-typed prompt is still sitting in the
     field, the chord should leave the user able to just type — which means the old text
     has to be selected, so the first keystroke replaces it rather than appending to it.
     On the empty field (the common case) it is a no-op that still places the caret.

     Silent when the field is missing or disabled — mid-write, and during the write-details
     wizard, there is no composer to speak into, and a thrown ref is not worth the chord. */
  function focusComposer() {
    const input = composerRef.current;
    if (!input || input.disabled) return;
    input.focus();
    input.select();
  }

  function openCompanion() {
    promptRequestRef.current += 1;
    cancelDecisionTimer();
    setOpen(true);
    setActiveSuggestion(null);
    setApprovalStatus('pending');
    setActionFeedback(null);
    setPhase('idle');
    /* No composer to clear: this only ever runs from the dock (⌘E on an OPEN tray takes
       focus instead of re-opening — see the shortcut), so the field is unmounted right now
       and TrayComposer will mount with an empty string of its own. */
    setRevisedRequest('');
    setGeneratedApprovalCopy('');
    setActiveApproval(null);
    setPendingWriteDraft(emptyPendingWriteDraft);
    setWriteDetailsStep('title');
    setWriteDetailsStep('title');
    setDemoResponse('');
    setAgentError(null);
    setEditError('');
    setLastPrompt('');
    setWorkflowSteps([]);
  }

  function closeCompanion() {
    promptRequestRef.current += 1;
    cancelDecisionTimer();
    setOpen(false);
  }

  function selectSuggestion(item: Suggestion) {
    promptRequestRef.current += 1;
    cancelDecisionTimer();
    rememberSuggestion(item.id);
    appendHistory({ role: 'action', text: `Requested: ${item.title}` });
    setWorkflowSteps([`Requested: ${item.title}`]);
    setConversationStarted(true);
    setActiveSuggestion(item);
    setApprovalStatus('pending');
    setActionFeedback(null);
    setDemoResponse('');
    setAgentError(null);
    setEditError('');
    setPhase('thinking');
    setRevisedRequest('');
    setGeneratedApprovalCopy('');
    setActiveApproval(null);
    setPendingWriteDraft(emptyPendingWriteDraft);
    setWriteDetailsStep('title');
  }

  function rememberSuggestion(id: string | null) {
    if (!id) return;
    setSuggestionStats((current) => {
      const existing = current[id] ?? { count: 0, lastUsed: 0 };
      return {
        ...current,
        [id]: {
          count: existing.count + 1,
          lastUsed: Date.now(),
        },
      };
    });
  }

  function appendHistory(item: Omit<ChatHistoryItem, 'id'>) {
    const text = item.text.trim();
    if (!text) return;
    setChatHistory((current) => [
      ...current,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: item.role,
        text: text.slice(0, 420),
      },
    ].slice(-MAX_HISTORY_ITEMS));
  }

  /* The failure is a STATE, not a thing EKO said. It belongs to the capsule (which turns
     red and carries the title) and to the trace step that broke — both of which are on
     screen the moment this runs.

     It used to also append the title as a chat bubble, which was wrong twice over: it
     restated the capsule verbatim one gap below it, and because Retry re-enters this
     function, five attempts stacked five identical "Approval could not run" bubbles in a
     transcript that is supposed to record the conversation, not the retries. Dismissing
     the error then left the ghosts behind, since chat history outlives the error state.

     The transcript keeps what was actually said. Nothing was. */
  function failAgent(error: AgentError) {
    cancelDecisionTimer();
    setConversationStarted(true);
    setAgentError(error);
    setPhase('error');
  }

  function buildApiRequest(message: string, overrides: Partial<EkoApiRequest> = {}): EkoApiRequest {
    const hasSuggestionOverride = Object.prototype.hasOwnProperty.call(overrides, 'suggestion');

    return {
      message,
      conversationId: conversationIdRef.current,
      clientContext: {
        path: window.location.pathname,
        title: document.title,
        recentHistory: chatHistory.slice(-6).map((item) => ({
          role: item.role,
          text: item.text,
        })),
      },
      ...overrides,
      suggestion: hasSuggestionOverride ? overrides.suggestion : (activeSuggestion
        ? {
            id: activeSuggestion.id,
            title: activeSuggestion.title,
            meta: activeSuggestion.meta,
            approvalCopy: generatedApprovalCopy || activeSuggestion.approvalCopy,
            approval: activeApproval ?? undefined,
          }
        : undefined),
    };
  }

  async function approveAction() {
    if (!activeSuggestion) return;
    const approvalMessage = generatedApprovalCopy || revisedRequest || activeSuggestion.approvalCopy;
    cancelDecisionTimer();
    setActionFeedback('approve');
    setAgentError(null);
    setApprovalStatus('approved');
    setPhase('committing');
    setDemoResponse('');

    try {
      if (shouldDemoFail(revisedRequest)) {
        setApprovalStatus('pending');
        failAgent({
          title: 'Approval could not run',
          message: 'EKO stopped before writing changes. Your approval was not applied.',
          action: 'approve',
        });
        return;
      }

      const response = await requestEko(
        buildApiRequest(approvalMessage, {
          mode: 'approval',
          decision: 'approve',
          pendingActionIds: pendingActionIdsRef.current,
          suggestion: undefined,
        }),
      );
      /* Stays 'approved' — it used to flip to 'answered' the moment the API came
         back, which quietly destroyed the outcome. 'answered' means "a read-only
         question got an answer, and there is no write to name", so the capsule
         falls back to the reply's lead line for it. Collapsing a decided write into
         that bucket meant the capsule echoed EKO's whole paragraph — the same
         sentence already sitting in the chat bubble right below it — instead of
         saying "Approved. The dashboard is updated.". The decision row does not
         come back: it is gated on `phase === 'approval'`, and phase is 'complete'. */
      setApprovalStatus('approved');
      setPhase('complete');
      setDemoResponse(response.reply);
      // Read-only bus signal for ALL executed writes (deletes included, with
      // no target): consumers revalidate loader data — no mutation rides this.
      const target = executedTarget(response as unknown as import('@/lib/eko-agent-client').EkoChatResponse);
      const didExecute = (response.executed ?? []).some((e) => e.ok);
      if (didExecute) {
        emitEkoEvent({
          type: 'write-executed',
          target: target ? { id: target.taskId, taskNumber: target.taskNumber ?? undefined, name: target.name } : undefined,
        });
      }
      // Post-write receipt: executed writes return the changed task so the
      // tray can offer a "view it on the board" deep link (bus spotlight).
      setWriteReceipt(
        target
          ? {
              target: {
                kind: 'task',
                taskId: target.taskId,
                taskNumber: target.taskNumber ?? null,
                name: target.name,
                action: target.action as 'create' | 'status' | 'assignee' | 'priority' | 'dueDate',
              },
              reply: response.reply,
            }
          : null,
      );
      appendHistory({ role: 'eko', text: response.reply });
      setActiveSuggestion(null);
      setGeneratedApprovalCopy('');
      setActiveApproval(null);
      setRevisedRequest('');
      setPendingWriteDraft(emptyPendingWriteDraft);
      setWriteDetailsStep('title');
      setWorkflowSteps((steps) => (steps.length ? [...steps, 'Approval saved'].slice(-4) : steps));
    } catch (error) {
      setApprovalStatus('pending');
      failAgent({
        title: 'Approval could not run',
        message: error instanceof Error ? error.message : 'EKO stopped before writing changes.',
        action: 'approve',
      });
    }
  }

  /**
   * Receipt deep-link: park a spotlight for the changed card on the EKO bus,
   * then ask the shell to navigate if the board isn't already on screen. The
   * bus carries UI choreography only — the write already happened upstream.
   */
  function viewWriteReceipt() {
    if (!writeReceipt) return;
    const { taskId, taskNumber, name } = writeReceipt.target;
    requestEkoSpotlight({ id: taskId, taskNumber: taskNumber ?? undefined, name });
    if (window.location.pathname !== '/issues') {
      emitEkoEvent({ type: 'navigate', path: '/issues' });
    }
  }

  async function rejectAction() {
    if (!activeSuggestion) return;
    const approvalMessage = generatedApprovalCopy || revisedRequest || activeSuggestion.approvalCopy;
    cancelDecisionTimer();
    setActionFeedback('reject');
    setAgentError(null);
    setApprovalStatus('rejected');
    setPhase('committing');
    setDemoResponse('');

    try {
      const response = await requestEko(
        buildApiRequest(approvalMessage, {
          mode: 'approval',
          decision: 'reject',
          revision: approvalMessage || undefined,
        }),
      );
      /* Same reason as the approve path: this must stay 'rejected'. This is the state
         the capsule was explicitly corrected to carry — "Rejected. No dashboard changes
         were made." — and flipping to 'answered' here meant that sentence only ever
         appeared in /eko-preview, which seeds the status directly. The real deny flow
         showed EKO's reply instead. */
      setApprovalStatus('rejected');
      setPhase('complete');
      setDemoResponse(response.reply);
      appendHistory({ role: 'eko', text: response.reply });
      setActiveSuggestion(null);
      setGeneratedApprovalCopy('');
      setActiveApproval(null);
      setRevisedRequest('');
      setPendingWriteDraft(emptyPendingWriteDraft);
      setWriteDetailsStep('title');
      setWorkflowSteps((steps) => (steps.length ? [...steps, 'Denied'].slice(-4) : steps));
    } catch (error) {
      setApprovalStatus('pending');
      failAgent({
        title: 'Rejection could not save',
        message: error instanceof Error ? error.message : 'EKO stopped before saving the rejection.',
        action: 'reject',
      });
    }
  }

  function submitWriteDetails() {
    if (!activeSuggestion) return;
    const title = pendingWriteDraft.title.trim();
    if (!title) {
      setEditError('Add a task name before continuing.');
      return;
    }

    const details = [
      `Task name: ${title}`,
      pendingWriteDraft.status.trim() ? `Status: ${pendingWriteDraft.status.trim()}` : null,
      pendingWriteDraft.priority.trim() ? `Priority: ${pendingWriteDraft.priority.trim()}` : null,
      pendingWriteDraft.dueDate.trim() && pendingWriteDraft.dueDate !== 'No date' ? `Due date: ${pendingWriteDraft.dueDate.trim()}` : null,
    ].filter(Boolean).join('. ');

    setEditError('');
    setRevisedRequest(details);
    const approvalCopy = `Create ${title}${pendingWriteDraft.status.trim() ? ` with status ${pendingWriteDraft.status.trim()}` : ''}${pendingWriteDraft.priority.trim() ? ` as ${pendingWriteDraft.priority.trim()} priority` : ''}${pendingWriteDraft.dueDate.trim() && pendingWriteDraft.dueDate !== 'No date' ? ` due ${pendingWriteDraft.dueDate.trim()}` : pendingWriteDraft.dueDate.trim() === 'No date' ? ' with no due date' : ''}.`;
    setGeneratedApprovalCopy(approvalCopy);
    setActiveApproval({
      kind: 'issue.create',
      title: `Create ${title}`,
      copy: approvalCopy,
      draft: {
        title,
        status: pendingWriteDraft.status.trim(),
        priority: pendingWriteDraft.priority.trim(),
        dueDate: pendingWriteDraft.dueDate.trim(),
      },
    });
    appendHistory({ role: 'action', text: `Details added: ${title}` });
    setWorkflowSteps((steps) => [...steps, `Details added: ${title}`].slice(-4));
    setApprovalStatus('pending');
  }

  function advanceWriteDetails() {
    if (!writeDetailsStepMeta.complete) {
      setEditError(
        writeDetailsStep === 'title'
          ? 'Add an issue title before continuing.'
          : `Choose ${writeDetailsStepMeta.title.toLowerCase()} before continuing.`,
      );
      return;
    }

    setEditError('');
    const nextStep = writeDetailsSteps[writeDetailsStepIndex + 1]?.id;
    if (!nextStep || writeDetailsStep === 'review') {
      submitWriteDetails();
      return;
    }
    setWriteDetailsStep(nextStep);
  }

  function selectWriteDetail(field: Exclude<WriteDetailsStep, 'title' | 'review'>, value: string) {
    setEditError('');
    setPendingWriteDraft((draft) => ({ ...draft, [field]: value }));
    const nextStep = writeDetailsSteps[writeDetailsSteps.findIndex((step) => step.id === field) + 1]?.id;
    if (nextStep) {
      window.setTimeout(() => setWriteDetailsStep(nextStep), reduceMotion ? 0 : 110);
    }
  }

  function cancelWriteDetails() {
    cancelDecisionTimer();
    setActionFeedback(null);
    setEditError('');
    setApprovalStatus('answered');
    setPhase('complete');
    setDemoResponse(WRITE_CANCELLED_NOTE);
    /* An 'action' row, not an 'eko' one. EKO did not say this — the user hit Cancel,
       and the transcript should read as the record of that, the same way "Requested: X"
       and "Details added: X" do. Filing it as EKO speech also printed the sentence
       TWICE on screen: the capsule carries the outcome, and an identical bubble landed
       right under it. The capsule speaks; the chat logs. */
    appendHistory({ role: 'action', text: 'Cancelled the write request' });
    setActiveSuggestion(null);
    setGeneratedApprovalCopy('');
    setActiveApproval(null);
    setRevisedRequest('');
    setPendingWriteDraft(emptyPendingWriteDraft);
    setWriteDetailsStep('title');
    setWorkflowSteps([]);
  }

  function retryFailedAction() {
    if (!agentError) return;
    const action = agentError.action;
    const promptToRetry = lastPrompt;
    setAgentError(null);

    if (action === 'approve') {
      void approveAction();
      return;
    }
    if (action === 'reject') {
      void rejectAction();
      return;
    }
    if (action === 'prompt') {
      void runPrompt(promptToRetry);
      return;
    }
    if (action === 'select' && activeSuggestion) {
      selectSuggestion(activeSuggestion);
      return;
    }

    setPhase(activeSuggestion ? 'approval' : 'idle');
  }

  function dismissError() {
    setAgentError(null);
    setConversationStarted(true);
    setApprovalStatus('answered');
    setPhase(activeSuggestion && approvalStatus === 'pending' ? 'approval' : 'complete');
  }

  async function runPrompt(prompt: string) {
    // /clear is a tray command, never a chat message: chat state lives here in
    // the browser, so sending it to the backend gets a fabricated "Cleared."
    // while every bubble stays. Resets to the same state as a first open.
    if (/^\/(clear|reset)\b/i.test(prompt.trim())) {
      promptRequestRef.current += 1;
      conversationIdRef.current = newConversationId();
      pendingActionIdsRef.current = [];
      setChatHistory([]);
      setActiveSuggestion(null);
      setRevisedRequest('');
      setGeneratedApprovalCopy('');
      setActiveApproval(null);
      setPendingWriteDraft(emptyPendingWriteDraft);
      setWriteDetailsStep('title');
      setWorkflowSteps([]);
      setApprovalStatus('pending');
      setActionFeedback(null);
      setAgentError(null);
      setDemoResponse('');
      setLastPrompt('');
      setConversationStarted(false);
      setPhase('idle');
      return;
    }

    const hasVisibleApprovalCard = Boolean(activeSuggestion && phase === 'approval');
    if (confirmationRoute(prompt, { hasVisibleApprovalCard }) === 'approve-visible-card') {
      if (approvalStatus === 'pending' && !shouldCollectWriteDetails) {
        void approveAction();
        return;
      }
      if (shouldCollectWriteDetails || approvalStatus === 'editing') {
        // Keep the pending approval gated — don't round-trip "yes" to the
        // backend and spawn a duplicate approval.
        appendHistory({
          role: 'eko',
          text: 'Finish the details above, then approve — EKO will not write anything until you do.',
        });
        return;
      }
    }

    // A bare "yes" with no visible approval card is NOT deflected here — it flows to
    // the server, which threads the conversation history so EKO acts on the offer it
    // made last turn and stages the writes (still behind the approval gate).

    setActiveSuggestion(null);
    setRevisedRequest('');
    setGeneratedApprovalCopy('');
    setActiveApproval(null);
    setPendingWriteDraft(emptyPendingWriteDraft);
    setWriteDetailsStep('title');
    setWorkflowSteps([]);

    if (shouldDemoFail(prompt)) {
      failAgent({
        title: 'Could not answer',
        message: 'The request failed before EKO changed anything. Try again or revise the prompt.',
        action: 'prompt',
      });
      return;
    }

    setApprovalStatus('answered');
    setActionFeedback(null);
    setAgentError(null);
    setPhase('thinking');
    setDemoResponse('');
    const requestId = promptRequestRef.current + 1;
    promptRequestRef.current = requestId;

    try {
      const response = await requestEko(
        buildApiRequest(prompt, {
          mode: 'chat',
          suggestion: undefined,
        }),
      );
      if (requestId !== promptRequestRef.current) return;
      if (shouldOpenApprovalFromResponse(response)) {
        const generatedSuggestion = createGeneratedApprovalSuggestionFromResponse(prompt, response);
        const inferredDraft = draftFromResponse(response, prompt);
        setActiveSuggestion(generatedSuggestion);
        pendingActionIdsRef.current = response.pendingActions?.map((p) => p.id) ?? [];
        setGeneratedApprovalCopy(response.approval?.copy || response.reply);
        setActiveApproval(response.approval ?? null);
        const staged = response.pendingActions ?? [];
        if (staged.length) {
          // One line per staged write; the card renders this as its body.
          setGeneratedApprovalCopy(staged.map((p) => `• ${p.summary}`).join('\n'));
        }
        setPendingWriteDraft(inferredDraft);
        setWriteDetailsStep(getInitialWriteDetailsStep(inferredDraft));
        setApprovalStatus(responseNeedsWriteDetails(response) ? 'editing' : 'pending');
        setPhase('approval');
        setDemoResponse('');
        setWorkflowSteps([`Approval requested: ${generatedSuggestion.title}`]);
        appendHistory({ role: 'action', text: `Approval requested: ${generatedSuggestion.title}` });
      } else {
        setPhase('complete');
        setDemoResponse('');
        appendHistory({ role: 'eko', text: response.reply });
      }
    } catch (error) {
      if (requestId !== promptRequestRef.current) return;
      failAgent({
        title: 'Could not answer',
        message: error instanceof Error ? error.message : 'The request failed before EKO changed anything.',
        action: 'prompt',
      });
    }
  }

  /* Takes the prompt as an argument — it no longer has one to read. TrayComposer holds the
     text and hands it over already trimmed and known non-empty; the guards below stay
     anyway, because this is the seam where a prompt becomes a live agent run. */
  function submitPrompt(prompt: string) {
    if (!prompt) return;
    if (isThinking || isCommitting) return;
    cancelDecisionTimer();
    setConversationStarted(true);
    setLastPrompt(prompt);
    appendHistory({ role: 'user', text: prompt });

    void runPrompt(prompt);
  }

  return (
    <LayoutGroup id="studio-companion">
      <div
        ref={companionRootRef}
        className="pointer-events-none fixed bottom-4 right-4 z-[90] flex flex-col items-end sm:bottom-5 sm:right-5"
      >
        <motion.div
          layout
          data-open={expanded}
          role={showTray ? 'dialog' : undefined}
          aria-labelledby={showTray ? titleId : undefined}
          className={cn(
            'pointer-events-auto relative isolate origin-bottom-right overflow-hidden text-white backdrop-blur-[28px] backdrop-saturate-[1.35] will-change-[filter,transform]',
            expanded
              ? /* The shell is near-opaque black for its top 90% and only turns to
                   glass in the last sliver — so the lift below has almost nothing to
                   act on except the bottom edge, which is the point: the tray reads
                   as a solid object with one lit rim.

                   brightness/contrast are dark-only. Over the light dashboard they
                   push the near-white canvas past clipping and the rim blows out to
                   a white halo; blur + saturate alone hold there. */
                'w-[min(318px,calc(100vw-24px))] rounded-[22px] dark:backdrop-brightness-150 dark:backdrop-contrast-150'
              : /* The dock is TWO frames, not one with a pseudo-element: an outer glass
                   shell (1px pad, 22px radius, --color-glass-dock, the ring + drop) and a
                   real inner pill that carries its own gradient. It used to be a flat
                   `after:` fill, which no gradient can live on — an inline style cannot
                   reach a pseudo-element. So the inner glass is now the button itself.

                   22px outer − 1px pad = 21px inner. Concentric by construction. */
                'rounded-[22px] bg-[rgb(20_33_59/0.34)] p-px',
          )}
          /* The drop shadow is ANIMATED, not styled — it is the other half of the frame's
             tone. Grey and blue differ only in the colour of one shadow layer, so Motion
             can interpolate straight between them and the panel's cast light warms and
             cools with the gradient instead of switching under it. */
          /* `initial` is spelled out rather than left to default to `animate`. Motion
             only infers the first frame from `animate` when it has nothing else to go
             on, and on this element — which also passes a static `style` — it did not:
             the frame mounted with NO shadow at all and only grew one after the first
             state change. Stating it means the tray wears its skin from frame one. */
          initial={{ boxShadow: expanded ? frameSkin.shadow : DOCK_SHADOW }}
          animate={{ boxShadow: expanded ? frameSkin.shadow : DOCK_SHADOW }}
          transition={{ ...layoutTransition, boxShadow: toneTransition }}
          style={{ transformOrigin: 'calc(100% - 52px) 100%' }}
        >
          {/* The frame's gradient cannot live in `style` and still move. No browser
              interpolates `background-image`, so an inline gradient meant the tray HARD
              CUT from grey to lit the instant suggestions appeared or a conversation
              started. Layering the two gradients is the only way to tween one.

              They are STACKED, not crossfaded — see ToneLayers. These gradients are opaque
              black at the top, so fading one out while the other faded in punched a
              see-through hole in the panel on every tone change. */}
          {/* The fade lives on a wrapper, not inside ToneLayers: the layers underneath are
              mid-argument about which TONE is on top, and that argument depends on their
              opacities summing to an opaque surface at every instant (see ToneLayers). Fading
              the group as a whole leaves that intact — the stack stays opaque relative to
              itself and the whole thing arrives together. */}
          {expanded ? (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-0 z-0 rounded-[22px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={panelRevealTransition}
            >
              <ToneLayers
                skins={FRAME_GRADIENTS}
                active={frameTone}
                transition={toneTransition}
                wrapperClassName="absolute inset-0 rounded-[22px]"
                layerClassName="absolute inset-0 rounded-[22px]"
              />
            </motion.span>
          ) : null}
          <AnimatePresence initial={false} mode="popLayout">
            {showTray ? (
              <motion.div
                key="studio-companion-tray"
                layout
                /* `relative z-[1]` puts the tray in front of the gradient layer above it,
                   which is absolutely positioned and would otherwise paint over static
                   content regardless of DOM order. */
                className="relative z-[1]"
                /* Enters on `panelRevealTransition`, NOT the fast morph-enter the dock
                   pill uses to snap back on close: this content is being clipped by the
                   growing box, so it must rise on the SAME slow ease-in-out as the fill
                   behind it (see THE OPEN) or it leads the fill and the clip edge shows.
                   Blur is a second mask on the same seam — the clip edge crosses a
                   still-soft surface, not a crisp one. */
                initial={reduceMotion ? { opacity: 1 } : { opacity: 0, filter: 'blur(2px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)', transition: panelRevealTransition }}
                exit={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, filter: 'blur(2px)', transition: trayExitTransition }
                }
                transition={dockTransition}
              >
              {/* Undecorated on purpose. The tray's whole surface is TWO things, and
                  both already live on the shell above: one linear gradient (black for
                  the top 90%, lifting to a 30%-alpha grey only in the last sliver) and
                  one 1px inset white ring.

                  This div used to stack eight radial gradients, a second inset ring, and
                  a bottom vignette on top of that. None of it exists in the design, and
                  the vignette actively fought the shell — it DARKENED the bottom edge
                  that the shell's gradient exists to light. The tray is a solid black
                  object with one lit rim, not glass. */}
              <div className="relative">
                {/* The header lives OUTSIDE the scroller: macOS elastic overscroll
                    bounces the scroller's contents at the compositor level (sticky
                    included), so an in-flow header detaches from the tray's top edge
                    on a hard fling. As an overlay it holds while content rubber-bands
                    beneath it; the scroller gets matching padding-top via ResizeObserver. */}
                {/* The paint is Paper's, verbatim. It only ever LOOKED like a grey cap
                    because of two things underneath it, both now gone: the invented
                    radial gradients on the tray (see above), and a `bg-wash-8` veil on
                    the two blur layers below — which in dark mode is oklch(1 0 0 / 0.11),
                    WHITE at 11%, stacked twice. Against a genuinely black tray this
                    gradient reads the way it does on the board.

                    The blur layers themselves have no equivalent in Paper and are kept
                    on purpose: Paper's board does not scroll, and this one does. They
                    are what keep the capsule legible when a chat bubble slides under it.
                    They blur but no longer tint — the capsule and buttons carry their own
                    backgrounds, so nothing needed veiling on top of the blur. */}
                <div
                  ref={trayHeaderRef}
                  style={{
                    backgroundImage:
                      'linear-gradient(in oklab 180deg, oklab(17.3% 0 0 / 35%) -0.02%, 18.03%, oklab(28.6% -0.007 -0.047 / 35%) 28.12%, oklab(28.6% -0.007 -0.047 / 0%) 86.87%)',
                  }}
                  className="absolute inset-x-0 top-0 z-[2] isolate px-4 pb-5 pt-3.5 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:-z-10 before:h-[calc(100%+34px)] before:backdrop-blur-[32px] before:[mask-image:linear-gradient(to_bottom,black_0%,black_64%,rgba(0,0,0,0.48)_84%,transparent_100%)] before:[-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_64%,rgba(0,0,0,0.48)_84%,transparent_100%)] after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:-z-10 after:h-[78%] after:backdrop-blur-[56px] after:[mask-image:linear-gradient(to_bottom,black_0%,rgba(0,0,0,0.9)_46%,rgba(0,0,0,0.24)_82%,transparent_100%)] after:[-webkit-mask-image:linear-gradient(to_bottom,black_0%,rgba(0,0,0,0.9)_46%,rgba(0,0,0,0.24)_82%,transparent_100%)]">
                {/* The wordmark is gone from the design, but role="dialog" still
                    needs an accessible name — aria-labelledby points here. */}
                <h2 id={titleId} className="sr-only">
                  EKO
                </h2>

                {/* ─── STATUS CAPSULE ───────────────────────────────────────
                    One pill carrying what the wordmark row + status strip + approval
                    card used to carry. `layout` lets it grow into long approval copy
                    instead of clamping it. */}
                <motion.div
                  layout
                  aria-live="polite"
                  transition={surfaceTransition}
                  /* The ring is ANIMATED, not styled. A box-shadow is interpolable, so
                     handing it to Motion lets neutral→amber→red ease instead of snap. */
                  animate={{ boxShadow: capsuleSkin.ring }}
                  className={cn(
                    /* 999px — Paper's value. I had reasoned this down to a fixed 16px on
                       the theory that a full round would curve the ends in past the text
                       once the capsule grew to two lines. The board says otherwise: it
                       draws the two-line pill fully round, and it is the roundness that
                       makes it read as a pill rather than a small card.

                       That full round is also what makes the resting morph work: a
                       one-line pill is exactly 36px tall (py-2 + a 20px row), so
                       collapsing to a 36px square under the same 999px radius is a
                       circle of the pill's own height. Only the width animates — the
                       pill closes around the mark instead of being swapped for it. */
                    'relative mx-auto mt-2 flex max-w-full items-center overflow-hidden rounded-full',
                    capsuleResting ? 'size-9 justify-center' : 'w-[228px] gap-2 px-3 py-2',
                  )}
                >
                  {/* The tone lives on its own stacked layer, and this is not a flourish —
                      it is the only way the tone can move at all. `glow` is a gradient, and
                      no browser interpolates background-image: assigning it inline meant the
                      capsule SNAPPED from neutral to amber to red, which is most of what
                      "pasted in and out" was. Stacked, not crossfaded, for the same reason
                      the frame is — see ToneLayers. */}
                  <ToneLayers
                    skins={CAPSULE_GLOWS}
                    active={capsuleTone}
                    transition={toneTransition}
                    wrapperClassName="pointer-events-none absolute inset-0 z-0 rounded-full"
                    layerClassName="absolute inset-0 rounded-full"
                  />
                  {/* Carries the dock↔tray shared-element morph: the dock's icon chip
                      flies into the capsule. Deleting the old header orphaned this id.

                      `relative` is required now: the tone layer above is positioned, and a
                      positioned sibling paints over static content no matter the DOM order. */}
                  <motion.span
                    layoutId={layout.icon}
                    transition={dockTransition}
                    className="relative flex shrink-0 items-center justify-center transition-[color] duration-200 ease-out"
                    style={{ color: capsuleSkin.ink }}
                  >
                    <AnimatePresence initial={false} mode="popLayout">
                      <motion.span
                        key={phase === 'error' ? 'alert' : 'matrix'}
                        initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
                        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
                        transition={reduceMotion ? { duration: 0 } : { type: 'spring', duration: 0.3, bounce: 0 }}
                        className="flex items-center justify-center"
                      >
                        {phase === 'error' ? (
                          <CircleAlert className="size-4" aria-hidden />
                        ) : (
                          <DotMatrixAgentLoader state={agentIconState} className="size-5" />
                        )}
                      </motion.span>
                    </AnimatePresence>
                  </motion.span>
                  {/* Two lines, hard. The capsule sits above the scroller and pushes
                      everything below it down, so an unbounded sentence would eat the
                      chat. Nothing is lost: the approval copy is code-templated and
                      already short, and a model reply is only ever summarised here —
                      its full text stays in the EKO bubble underneath. */}
                  {/* `popLayout` is load-bearing, not decoration: an exiting child that
                      stays in flow would hold the pill open at 228px for the whole fade,
                      and the circle would only appear once the text had already gone.
                      Popped out of flow, the width closes WHILE the copy fades — which
                      is the difference between a morph and a swap. */}
                  {/* Keyed by the SENTENCE, not by a constant. With a fixed key the span
                      persisted across every phase and React just rewrote its text node —
                      so the capsule's line, the one thing the eye is actually on, hard-cut
                      from "Thinking through permissions" to "Approval required" with no
                      transition at all. Keying on the copy makes each new sentence a new
                      element, so `layout` can re-measure the pill around them.

                      This one ROLLS. It cannot `mode="wait"` like the body does, because
                      `capsuleResting` flips the pill to a 36px circle on the same render —
                      an in-flow sentence would be crushed against the closing wall on its
                      way out, which is the whole reason `popLayout` is here. But at the old
                      ±3px the two sentences occupied the same 16px line and simply dissolved
                      through each other, which at capsule size reads as a smear. At ±14 they
                      pass instead: the old line leaves through the top of the pill's clip
                      while the new one rises from the bottom, so the eye tracks one line
                      being replaced rather than two being blended. */}
                  <AnimatePresence initial={false} mode="popLayout">
                    {capsuleResting ? null : (
                      <motion.span
                        key={capsuleCopy}
                        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, filter: 'blur(3px)' }}
                        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -14, filter: 'blur(3px)' }}
                        transition={
                          reduceMotion
                            ? { duration: 0.12 }
                            : { type: 'spring', duration: 0.32, bounce: 0 }
                        }
                        className="relative min-w-0 line-clamp-2 whitespace-pre-line text-[12px] font-medium leading-4 transition-[color] duration-200 ease-out [text-wrap:pretty]"
                        style={{ color: capsuleSkin.ink }}
                      >
                        {capsuleCopy}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {/* The circle still has to say something to a screen reader — the
                      capsule is the aria-live region, and going silent would strand it. */}
                  {capsuleResting ? <span className="sr-only">{statusLine}</span> : null}
                </motion.div>

                {/* ─── DECISION ROW ─────────────────────────────────────────
                    Approve/Deny (and Retry/Dismiss) move OUT of the scroller and into
                    the pinned header: the button that authorises a live DB write must
                    never be scrollable out of view. `×` IS Deny — same handler, same
                    telemetry, icon instead of a word. */}
                <AnimatePresence initial={false} mode="popLayout">
                  {showActionRow ? (
                    <motion.div
                      key="eko-action-row"
                      layout
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 4, filter: 'blur(2px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: swapEnterTransition }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(2px)' }}
                      transition={swapExitTransition}
                      className={cn(
                        /* pt-2.5, not py-1. The capsule and the buttons are two
                           separate decisions — read this, then choose — and 4px of air
                           welded them into one blob. The bottom stays tight so the pair
                           still groups against the chat below it. */
                        'relative flex items-center justify-center px-[34px] pb-1 pt-2.5',
                        hasError ? 'gap-1.5' : 'gap-1',
                      )}
                    >
                      <motion.button
                        type="button"
                        onClick={hasError ? retryFailedAction : approveAction}
                        disabled={isCommitting}
                        whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                        animate={actionFeedback === 'approve' ? { scale: [1, 1.04, 1] } : { scale: 1 }}
                        transition={pulseTransition}
                        style={{
                          backgroundImage:
                            'linear-gradient(in oklab 180deg, oklab(0% 0 0 / 8%) 0%, oklab(86.8% 0 0 / 8%) 100%)',
                          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03)',
                        }}
                        className={cn(
                          'flex h-8 w-[97px] shrink-0 items-center justify-center gap-[3px] rounded-[12px] p-[3px] text-[12px] font-medium leading-4 text-white/66 transition-[filter,opacity] duration-150 ease-out hover:brightness-125 disabled:pointer-events-none',
                          approvalStatus === 'approved' ? 'text-[#b6f0d0]' : '',
                          isCommitting && approvalStatus !== 'approved' ? 'opacity-45' : '',
                        )}
                      >
                        {hasError ? (
                          <RotateCcw className="size-[13px] shrink-0 text-[#c7c7c7]" aria-hidden />
                        ) : (
                          <Check className="size-[13px] shrink-0 text-[#c7c7c7]" aria-hidden />
                        )}
                        {hasError ? 'Retry' : approvalStatus === 'approved' ? 'Approved' : 'Approve'}
                      </motion.button>
                      <motion.button
                        type="button"
                        onClick={hasError ? dismissError : rejectAction}
                        disabled={isCommitting}
                        aria-label={hasError ? 'Dismiss error' : 'Deny action'}
                        whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                        animate={actionFeedback === 'reject' ? { scale: [1, 1.04, 1] } : { scale: 1 }}
                        transition={pulseTransition}
                        className={cn(
                          'relative flex size-8 shrink-0 items-center justify-center rounded-[12px] bg-[#00000014] text-[rgb(181_179_177_/_0.7)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)] transition-[background-color,color,transform] duration-150 ease-out hover:bg-white/[0.08] hover:text-white/85 disabled:pointer-events-none',
                          // 32px visual, 40px hit area — this is the Deny button.
                          "before:absolute before:left-1/2 before:top-1/2 before:size-10 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
                          approvalStatus === 'rejected' ? 'bg-white/[0.12] text-white' : '',
                          isCommitting && approvalStatus !== 'rejected' ? 'opacity-45' : '',
                        )}
                      >
                        <X className="size-3.5" aria-hidden />
                      </motion.button>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                </div>

                {/* layoutScroll: layout-animated children (trace rows) measure
                    against this scroller; without it, auto-scroll during a
                    layout pass strands rows at a stale transform offset,
                    overlapping the selected-action card above. */}
                <motion.div
                  layoutScroll
                  ref={trayScrollRef}
                  className="relative z-[1] flex max-h-[min(760px,calc(100vh-32px))] flex-col overflow-y-auto [overflow-anchor:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >

                {/* ─── THE BODY SWAP ────────────────────────────────────────
                    Suggestions, the selected-action card and the workflow trace are the
                    three MUTUALLY EXCLUSIVE faces of the tray's body — the predicates
                    below already guarantee only one can be true. They used to live in two
                    SEPARATE AnimatePresence trees, and that is what made the states read as
                    "loaded in and out": presence trees cannot coordinate with each other, so
                    the exit of one and the entrance of the other ran CONCURRENTLY, printing
                    two complete layouts over each other at half opacity in the same box.
                    `mode="wait"` cannot fix that from inside one tree — it only sequences a
                    tree's own children. They have to be the same tree.

                    So they are one tree now, keyed by which face is showing, and it WAITS:
                    the outgoing face leaves before the incoming one arrives, and they are
                    never on screen together. `popLayout` is deliberately not used here — it
                    pulls the exiting face out of flow, which collapses the frame into the
                    gap and is what left the visible HOLE the last attempt at this hit. In
                    flow, the frame holds its height through the exit and then springs to the
                    new one (the tray root carries `layout`), so the panel reshapes around
                    the swap in one continuous move. */}
                <AnimatePresence initial={false} mode="wait">
                  {showSuggestions ? (
                    <motion.div
                      key="suggestions"
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 10, filter: 'blur(3px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: swapEnterTransition }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, filter: 'blur(3px)' }}
                      transition={swapExitTransition}
                      className="relative z-[1] order-1 px-3 pb-2"
                    >
                      <div className="flex items-center justify-between px-1 pb-1">
                        <p className="text-[11px] font-semibold uppercase leading-4 text-white/54">
                          Suggestions
                        </p>
                      </div>

                      <div className="flex flex-col">
                        {visibleSuggestions.map((item) => {
                          const Icon = item.icon;
                          return (
                            <button
                              key={item.title}
                              type="button"
                              aria-label={item.title}
                              aria-pressed={false}
                              onClick={() => selectSuggestion(item)}
                              className="group flex min-h-9 w-full items-center gap-2 rounded-[12px] px-2.5 py-1.5 text-left transition-[background-color,transform] duration-150 ease-out hover:bg-white/[0.11] active:scale-[0.99]"
                            >
                              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]">
                                <Icon className="size-3.5" aria-hidden />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-medium leading-[17px] text-white/88">
                                  {item.title}
                                </span>
                                <span className="block truncate text-[12px] font-medium leading-4 text-white/50">
                                  {item.meta}
                                </span>
                              </span>
                              <span className="flex w-[58px] shrink-0 items-center justify-end text-[12px] font-medium leading-4 text-[#b8d8ff] opacity-0 transition-[opacity,transform] duration-150 ease-out group-hover:translate-x-0 group-hover:opacity-100">
                                {item.action}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  ) : hasSelectedAction && SelectedIcon && !selectedCardDuplicatesApproval && !shouldShowWorkflowTrace ? (
                    <motion.div
                      key="selected-task"
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 10, filter: 'blur(3px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: swapEnterTransition }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, filter: 'blur(3px)' }}
                      transition={swapExitTransition}
                      className="relative z-[1] order-2 px-3 pb-2"
                    >
                      <div className="flex items-center gap-2 rounded-[14px] bg-white/[0.075] px-3 py-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09)]">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]">
                          <SelectedIcon className="size-3.5" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium leading-[17px] text-white/88">
                            {activeSuggestion.title}
                          </p>
                          <p className="truncate text-[12px] font-medium leading-4 text-white/50">
                            {activeSuggestion.meta}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ) : shouldShowWorkflowTrace ? (
                    <motion.div
                      key="agent-trace"
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 10, filter: 'blur(3px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: swapEnterTransition }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, filter: 'blur(3px)' }}
                      transition={swapExitTransition}
                      /* Paper's trace frame: 12px inline, 4px top, 8px bottom. */
                      className="relative z-[1] order-3 px-3 pb-2 pt-1"
                    >
                      <motion.div layout transition={surfaceTransition} className="relative flex flex-col gap-0.5">
                        {currentSteps.map((step, index) => {
                          const active = index === currentSteps.length - 1;
                          const finished = phase === 'complete';
                          const failed = phase === 'error' && active;
                          /* Paper's trace rows are the step name and nothing else — no
                             "In progress" / "Complete" sub-label. The chip already says
                             which state the row is in (spinner, check, alert) and the
                             capsule says it in words; a third copy is just noise. */
                          const rowCompact = traceCompact && (!active || finished);
                          const chipSkin =
                            failed
                              ? TRACE_CHIP.failed
                              : active && !finished && !rowCompact
                                ? TRACE_CHIP.active
                                : TRACE_CHIP.done;

                          return (
                            <motion.div
                              key={step}
                              /* No `layout` here: it would share the transform
                                 channel with the y enter animation, and an
                                 interrupted pass strands the row offset into
                                 the card above. The list only appends at the
                                 tail, so the enter animation covers it. */
                              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 5, filter: 'blur(2px)' }}
                              animate={{
                                opacity: rowCompact ? 0.62 : active ? 1 : 0.78,
                                y: 0,
                                filter: 'blur(0px)',
                              }}
                              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -3, filter: 'blur(2px)' }}
                              transition={traceCompact ? approvalTransition : fadeTransition}
                              className={cn(
                                'relative overflow-hidden grid items-center px-1.5 py-1',
                                'grid-cols-[28px_1fr] gap-2',
                                rowCompact ? 'min-h-7' : active ? 'min-h-10' : 'min-h-8',
                              )}
                            >
                              <span className="relative flex h-full items-center justify-center">
                                <span
                                  style={{ backgroundImage: chipSkin.glow, boxShadow: chipSkin.ring }}
                                  className={cn(
                                    'relative z-[1] flex shrink-0 items-center justify-center rounded-full transition-[width,height] duration-150 ease-out',
                                    rowCompact ? 'size-[16px]' : 'size-[18px]',
                                  )}
                                >
                                  {/* Paper draws the check at 12px and the spinner at 14px —
                                      the running step's glyph is deliberately the larger of
                                      the two inside the same 18px chip. */}
                                  {failed ? (
                                    <CircleAlert className="size-3.5" style={{ color: chipSkin.ink }} aria-hidden />
                                  ) : active && !finished ? (
                                    <LoaderCircle
                                      className="size-3.5 motion-safe:animate-spin"
                                      style={{ color: chipSkin.ink }}
                                      aria-hidden
                                    />
                                  ) : (
                                    <Check className="size-3" style={{ color: chipSkin.ink }} aria-hidden />
                                  )}
                                </span>
                              </span>
                              <span className="min-w-0">
                                {/* A settled step is white at 35% — Paper's #FFFFFF59 — and the
                                    row carries a further 0.78 opacity on top of that. It is much
                                    quieter than it looks like it should be, and that is the
                                    point: the trace is a receipt of what already happened, so
                                    only the step still running is allowed to be legible at a
                                    glance. This was at 78% and every row shouted equally. */}
                                {/* No shimmer on the running row. It used to carry
                                    `eko-shimmer-text`, which hard-sets a white `color` and so
                                    painted this label white over the blue below it. The class
                                    was mine, not the board's — and the row does not need it:
                                    the chip's spinner is already the liveness signal, so a
                                    pulsing label under a spinning chip says the same thing
                                    twice. Paper draws this as a flat #348FF8BD. */}
                                <span
                                  className={cn(
                                    'relative block truncate text-[12.5px] font-medium leading-4',
                                    failed
                                      ? 'text-[#ff9b8e]'
                                      : rowCompact
                                        ? 'text-white/35'
                                        : active && !finished
                                          ? 'text-[#348ff8]/[0.74]'
                                          : 'text-white/35',
                                  )}
                                >
                                  {step}
                                </span>
                              </span>
                            </motion.div>
                          );
                        })}
                      </motion.div>

                      {/* The thinking pill that used to sit here is gone: the redesign
                          moves it into the header, and the capsule IS it now — same
                          dot-matrix icon, same copy, same pill. Leaving this one would
                          put the identical sentence on screen twice. */}
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <AnimatePresence initial={false}>
                  {visibleChatRows.length ? (
                    <motion.div
                      key="eko-history"
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 4, filter: 'blur(2px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: swapEnterTransition }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(2px)' }}
                      transition={swapExitTransition}
                      className="relative z-[1] order-4 px-3 pb-2 pt-3"
                    >
                      {visibleChatRows.map((item, index) => {
                        const prev = index > 0 ? visibleChatRows[index - 1] : null;
                        // Chat grouping rhythm: tight within one speaker's run, a
                        // clear beat at each turn boundary — the widest gap before a
                        // new user question. 'action' + 'eko' are EKO's response side,
                        // so they stay grouped; only user↔EKO is a real turn change.
                        const sameSide = prev ? (prev.role === 'user') === (item.role === 'user') : false;
                        const gapClass = !prev
                          ? ''
                          : sameSide
                            ? prev.role === item.role
                              ? 'mt-1'
                              : 'mt-1.5'
                            : item.role === 'user'
                              ? 'mt-[18px]'
                              : 'mt-3';
                        return (
                        <motion.div
                          key={item.id}
                          layout
                          initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 3 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -2 }}
                          transition={fadeTransition}
                          className={cn(
                            'flex',
                            gapClass,
                            item.role === 'user' ? 'justify-end' : 'justify-start',
                          )}
                        >
                          {/* EKO's side is a blue oklch ramp lit from its bottom edge —
                              the same light direction as the capsule, so the tray reads
                              as one lit object. Your side stays a flat neutral: the user
                              isn't a state, so it doesn't get a state colour. */}
                          <div
                            style={
                              item.role === 'eko'
                                ? {
                                    backgroundImage:
                                      'linear-gradient(in oklch 180deg, oklch(21% 0.0001 262.4 / 22%) 0%, 89.36%, oklch(47.2% 0.125 262.4 / 22%) 100%)',
                                  }
                                : undefined
                            }
                            className={cn(
                              /* 253px and a HALF-pixel ring, both straight off the board.
                                 The ring was at a full 1px, which is what gave the bubbles
                                 a harder edge than Paper's — at 8% white the difference
                                 between 0.5px and 1px is the whole character of the edge.
                                 The width was a percentage, which drifts with the tray's
                                 padding instead of holding the drawn measure. */
                              'max-w-[253px] rounded-[13px] px-2.5 py-1.5 text-[11.5px] font-medium leading-[15px] shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.08)]',
                              item.role === 'user'
                                ? 'bg-[#7c7c7c]/[0.14] text-white/82'
                                : item.role === 'action'
                                  ? 'bg-[#ffce52]/[0.10] text-[#ffe6a3]/82'
                                  : item.pending
                                    ? 'text-white/74'
                                    : 'text-white/68',
                            )}
                          >
                            <span className="mb-0.5 block text-[10px] font-semibold uppercase leading-3 tracking-[0.02em] text-white/38">
                              {item.role === 'user' ? 'You' : item.role === 'action' ? 'Action' : 'EKO'}
                            </span>
                            {item.pending ? (
                              <ThinkingLabel reduceMotion={Boolean(reduceMotion)} />
                            ) : (
                              // pre-line: EKO separates points with line breaks (per its prompt);
                              // render them as breaks instead of collapsing to one paragraph.
                              <span className="block whitespace-pre-line text-pretty break-words">{item.text}</span>
                            )}
                          </div>
                        </motion.div>
                        );
                      })}
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <AnimatePresence initial={false}>
                  {contextualChatSuggestions.length ? (
                    <motion.div
                      key="eko-context-suggestions"
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 4, filter: 'blur(2px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -3, filter: 'blur(2px)' }}
                      transition={fadeTransition}
                      className="relative z-[1] order-5 px-3 pb-2"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        {contextualChatSuggestions.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => selectSuggestion(item)}
                            className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white/[0.08] px-2.5 text-[11px] font-medium leading-3 text-white/68 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09)] transition-[background-color,color,transform] duration-150 ease-out hover:bg-white/[0.12] hover:text-white/82 active:scale-[0.96]"
                          >
                            <item.icon className="size-3" aria-hidden />
                            {item.action} next
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                {/* The approval and error cards that used to live here are gone —
                    the capsule + decision row in the header carry both now. What's
                    left is the completion surface: EKO's reply and the write receipt. */}
                <AnimatePresence initial={false} mode="popLayout">
                  {writeReceipt && writeReceipt.reply === demoResponse && !hasApproval && !hasError ? (
                    <motion.div
                      key="eko-event"
                      // No `layout`: mounting alongside the trace compaction makes the
                      // group correction spring the card up from below — straight through
                      // the sticky composer. The inner layoutId surface still morphs.
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8, filter: 'blur(3px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, filter: 'blur(2px)' }}
                      transition={surfaceTransition}
                      className="relative z-[1] order-6 px-3 pb-2.5"
                    >
                      {/* No card. This used to be a 15px surface with its own fill, ring,
                          12px of padding and a backdrop-blur — a container around a
                          container, since the receipt row already IS a bounded surface with
                          its own ring. Paper sets the row straight on the tray.

                          What survives is the write-landed pulse, because it was never the
                          card's decoration — it is the only confirmation that a real DB
                          write committed. It is now a ring that flares on the row's own
                          radius and decays to nothing, so it exists for ~600ms and leaves no
                          container behind. */}
                      <motion.div
                        layoutId={layout.eventSurface}
                        layout
                        animate={
                          phase === 'complete' && !reduceMotion
                            ? {
                                boxShadow: [
                                  '0 0 0 1px rgba(255,206,82,0.28)',
                                  approvalStatus === 'approved' || approvalStatus === 'answered'
                                    ? '0 0 0 1px rgba(126,188,255,0.44), 0 0 24px rgba(78,161,255,0.18)'
                                    : '0 0 0 1px rgba(255,178,168,0.38), 0 0 24px rgba(212,80,62,0.14)',
                                  '0 0 0 1px rgba(78,161,255,0), 0 0 0 rgba(78,161,255,0)',
                                ],
                              }
                            : { boxShadow: '0 0 0 1px rgba(78,161,255,0), 0 0 0 rgba(78,161,255,0)' }
                        }
                        transition={phase === 'complete' ? pulseTransition : surfaceTransition}
                        className="rounded-[12px]"
                        aria-live="polite"
                      >
                        <AnimatePresence initial={false} mode="popLayout">
                            <motion.div
                              key="response-content"
                              layout
                              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 4, filter: 'blur(2px)' }}
                              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -3, filter: 'blur(2px)' }}
                              transition={approvalTransition}
                              className="min-w-0"
                            >
                              {/* The reply itself now lives in the capsule — this
                                  surface is the receipt only. Repeating the text here
                                  is the redundancy the capsule was meant to remove. */}
                              {writeReceipt && writeReceipt.reply === demoResponse ? (
                                <button
                                  type="button"
                                  onClick={viewWriteReceipt}
                                  aria-label={`View ${writeReceipt.target.name} on the board`}
                                  style={{
                                    backgroundImage:
                                      'linear-gradient(in oklab 180deg, oklab(34% 0 0 / 5.5%) 0.62%, 64.41%, oklab(78% 0 0 / 15%) 100%)',
                                  }}
                                  /* The row is lit from BELOW — 5.5% at the top rising to 15%
                                     at the bottom edge. It was a flat 5.5% wash, which is the
                                     top stop alone, so the row sat flat against the tray while
                                     every other surface here (dock, capsule, tray) carries the
                                     same bottom-lit rim. `hover` only lifts the overlay so the
                                     gradient survives the interaction. */
                                  className="group relative flex min-h-9 w-full items-center gap-2 overflow-clip rounded-[12px] px-2.5 py-1.5 text-left shadow-[inset_0_0_0_1px_#FFFFFF14] transition-transform duration-150 ease-out before:pointer-events-none before:absolute before:inset-0 before:bg-white/0 before:transition-[background-color] before:duration-150 before:ease-out hover:before:bg-white/[0.06] active:scale-[0.99]"
                                >
                                  {/* Radial, not flat: white at 8% in the middle falling to a
                                      BLUE 19% at the rim — the chip glows outward. And the
                                      check is #008AE8 at 2.5 stroke, a saturated blue; it was
                                      #b8d8ff, the pale ink colour, which is what made the
                                      receipt read as disabled next to the trace's live blue. */}
                                  <span
                                    style={{
                                      backgroundImage:
                                        'radial-gradient(ellipse 50% 50% at 50% 50% in oklab, oklab(100% 0 0 / 8%) 0%, 86.76%, oklab(56.6% -0.048 -0.180 / 19%) 100%)',
                                    }}
                                    className="relative flex size-6 shrink-0 items-center justify-center rounded-full border-[0.5px] border-solid border-[#FEFEFE0D] bg-origin-border text-[#008AE8F7]"
                                  >
                                    <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                                  </span>
                                  <span className="relative min-w-0 flex-1">
                                    <span className="block truncate text-[13px] font-medium leading-[17px] text-[#AFAFAFE0]">
                                      {writeReceipt.target.name}
                                    </span>
                                    <span className="block truncate text-[12px] font-medium leading-4 text-white/50">
                                      {writeReceipt.target.action === 'create'
                                        ? 'Created'
                                        : writeReceipt.target.action === 'status'
                                          ? 'Status updated'
                                          : writeReceipt.target.action === 'assignee'
                                            ? 'Reassigned'
                                            : writeReceipt.target.action === 'priority'
                                              ? 'Priority updated'
                                              : 'Due date updated'}
                                      {writeReceipt.target.taskNumber != null
                                        ? ` · #${writeReceipt.target.taskNumber}`
                                        : ''}
                                    </span>
                                  </span>
                                  {/* Always on, not hover-revealed. It is the only thing
                                      telling you the receipt is a link, and a hover-only
                                      affordance simply does not exist on a touch screen.
                                      Paper draws it at rest too — at #B7B7B7, a flat grey. */}
                                  <span className="relative flex w-[58px] shrink-0 items-center justify-end text-[12px] font-medium leading-4 text-[#B7B7B7] transition-[color] duration-150 ease-out group-hover:text-[#008AE8]">
                                    View
                                  </span>
                                </button>
                              ) : null}
                            </motion.div>
                        </AnimatePresence>
                      </motion.div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <AnimatePresence initial={false}>
                  {shouldCollectWriteDetails ? (
                    <motion.form
                      key="write-details-drawer"
                      layout
                      onSubmit={(event) => {
                        event.preventDefault();
                        advanceWriteDetails();
                      }}
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 46, scale: 0.985, filter: 'blur(5px)' }}
                      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.99, filter: 'blur(3px)' }}
                      transition={drawerTransition}
                      style={{ transformOrigin: '50% 100%' }}
                      aria-label="Issue details drawer"
                      className={cn(
                        'sticky bottom-0 z-30 order-7 mt-auto flex max-h-[min(560px,calc(100dvh-112px))] flex-col overflow-y-auto rounded-t-[26px] bg-[rgba(24,34,52,0.68)] px-4 pb-10 pt-4 shadow-[0_-22px_56px_rgba(8,16,31,0.26),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_0_0_1px_rgba(255,255,255,0.12)] backdrop-blur-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                        writeDetailsDrawerClass,
                      )}
                    >
                      <div className="mb-2 flex items-center gap-1 rounded-full bg-white/[0.055] p-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
                        {writeDetailsSteps.map((step, index) => {
                          const active = step.id === writeDetailsStep;
                          const complete = index < writeDetailsStepIndex;
                          return (
                            <button
                              key={step.id}
                              type="button"
                              onClick={() => {
                                if (index <= writeDetailsStepIndex || complete) {
                                  setEditError('');
                                  setWriteDetailsStep(step.id);
                                }
                              }}
                              className={cn(
                                'relative h-7 min-w-0 flex-1 rounded-full px-1.5 text-[10.5px] font-semibold leading-3 transition-[color,opacity] duration-150 ease-out',
                                active ? 'text-[#14213b]' : complete ? 'text-white/72' : 'text-white/36',
                              )}
                            >
                              {active ? (
                                <motion.span
                                  layoutId={layout.writeStep}
                                  transition={approvalTransition}
                                  className="absolute inset-0 rounded-full bg-white shadow-[0_8px_18px_rgba(8,18,35,0.14)]"
                                />
                              ) : null}
                              <span className="relative z-[1] truncate">{step.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="pt-2">
                        <div>
                          <p className="text-[12.5px] font-semibold leading-4 text-white/92">
                            {writeDetailsStepMeta.title}
                          </p>
                          <p className="mt-0.5 text-[11.5px] font-medium leading-4 text-white/58">
                            {writeDetailsStepMeta.detail}
                          </p>
                        </div>
                      </div>

                      <div className={cn('mt-4', writeDetailsBodyClass)}>
                        <AnimatePresence initial={false} mode="popLayout">
                          {writeDetailsStep === 'title' ? (
                            <motion.div
                              key="write-title-step"
                              layout
                              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, x: 18, filter: 'blur(3px)' }}
                              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -14, filter: 'blur(3px)' }}
                              transition={approvalTransition}
                            >
                              <label className="sr-only" htmlFor="eko-write-title">
                                Issue title
                              </label>
                              <input
                                id="eko-write-title"
                                value={pendingWriteDraft.title}
                                onChange={(event) => {
                                  setEditError('');
                                  setPendingWriteDraft((draft) => ({ ...draft, title: event.target.value }));
                                }}
                                placeholder="Issue title"
                                className="h-12 w-full rounded-[16px] bg-white/[0.08] px-3 text-[13px] font-medium leading-4 text-white/88 outline-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.11),inset_0_1px_0_rgba(255,255,255,0.08)] placeholder:text-white/42 focus:bg-white/[0.12] focus:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18),inset_0_1px_0_rgba(255,255,255,0.1)]"
                              />
                            </motion.div>
                          ) : writeDetailsStep === 'review' ? (
                            <motion.div
                              key="write-review-step"
                              layout
                              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, x: 18, filter: 'blur(3px)' }}
                              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -14, filter: 'blur(3px)' }}
                              transition={approvalTransition}
                              className="grid gap-1.5"
                            >
                              {[
                                ['Name', pendingWriteDraft.title || 'Not set'],
                                ['Status', pendingWriteDraft.status || 'Not set'],
                                ['Priority', pendingWriteDraft.priority || 'Not set'],
                                ['Due', pendingWriteDraft.dueDate || 'No date'],
                              ].map(([label, value]) => (
                                <button
                                  key={label}
                                  type="button"
                                  onClick={() => setWriteDetailsStep(label === 'Name' ? 'title' : label === 'Due' ? 'dueDate' : label.toLowerCase() as WriteDetailsStep)}
                                  className="grid grid-cols-[74px_1fr] items-center rounded-[13px] bg-white/[0.07] px-2.5 py-1.5 text-left shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] transition-[background-color] duration-150 ease-out hover:bg-white/[0.1]"
                                >
                                  <span className="text-[10.5px] font-semibold uppercase leading-3 tracking-[0.08em] text-white/38">
                                    {label}
                                  </span>
                                  <span className="truncate text-right text-[12.5px] font-medium leading-4 text-white/84">
                                    {value}
                                  </span>
                                </button>
                              ))}
                            </motion.div>
                          ) : (
                            <motion.div
                              key={`write-${writeDetailsStep}-step`}
                              layout
                              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, x: 18, filter: 'blur(3px)' }}
                              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -14, filter: 'blur(3px)' }}
                              transition={approvalTransition}
                              className="grid grid-cols-2 gap-2.5"
                            >
                              {(writeDetailsStep === 'status'
                                ? writeStatusOptions
                                : writeDetailsStep === 'priority'
                                  ? writePriorityOptions
                                  : writeDueDateOptions
                              ).map((option) => {
                                const selected =
                                  writeDetailsStep === 'status'
                                    ? pendingWriteDraft.status === option
                                    : writeDetailsStep === 'priority'
                                      ? pendingWriteDraft.priority === option
                                      : pendingWriteDraft.dueDate === option;
                                return (
                                  <button
                                    key={option}
                                    type="button"
                                    onClick={() => selectWriteDetail(writeDetailsStep as Exclude<WriteDetailsStep, 'title' | 'review'>, option)}
                                    className={cn(
                                      'min-h-12 rounded-[15px] px-3 text-[12.5px] font-semibold leading-4 transition-[background-color,box-shadow,color,transform] duration-150 ease-out active:scale-[0.96]',
                                      selected
                                        ? cn('bg-white text-[#14213b]', writeDetailsStep === 'priority' ? priorityEdgeClass(option, true) : 'shadow-[0_8px_20px_rgba(8,18,35,0.14)]')
                                        : cn('bg-white/[0.075] text-white/70 hover:bg-white/[0.12] hover:text-white/88', writeDetailsStep === 'priority' ? priorityEdgeClass(option, false) : 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]'),
                                    )}
                                  >
                                    {option}
                                  </button>
                                );
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {editError ? (
                        <p className="mt-2 text-[11.5px] font-medium leading-4 text-[#ffd2cc]">
                          {editError}
                        </p>
                      ) : null}
                      <div className="mt-auto flex shrink-0 items-center gap-3 pb-1 pt-8">
                        {writeDetailsStepIndex > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setEditError('');
                              setWriteDetailsStep(writeDetailsSteps[writeDetailsStepIndex - 1]?.id ?? 'title');
                            }}
                            className="h-9 rounded-full bg-white/[0.08] px-3.5 text-[12.5px] font-medium leading-4 text-white/68 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)] transition-[background-color,color] duration-150 ease-out hover:bg-white/[0.13] hover:text-white/84"
                          >
                            Back
                          </button>
                        ) : null}
                        <motion.button
                          type="submit"
                          disabled={!writeDetailsStepMeta.complete}
                          whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                          className="h-9 rounded-full bg-white px-3.5 text-[12.5px] font-semibold leading-4 text-[#14213b] transition-[background-color,opacity,transform] duration-150 ease-out hover:bg-[#f5f5f5] disabled:pointer-events-none disabled:opacity-42"
                        >
                          {writeDetailsStep === 'review' ? 'Prepare approval' : 'Continue'}
                        </motion.button>
                        <button
                          type="button"
                          onClick={cancelWriteDetails}
                          className="h-9 rounded-full px-2.5 text-[12.5px] font-medium leading-4 text-white/58 transition-[background-color,color] duration-150 ease-out hover:bg-white/[0.1] hover:text-white/78"
                        >
                          Cancel
                        </button>
                      </div>
                    </motion.form>
                  ) : null}
                </AnimatePresence>

                <div ref={trayEndRef} className="order-8 h-px" />

                {!shouldCollectWriteDetails ? (
                  <TrayComposer
                    inputRef={composerRef}
                    disabled={isThinking || isCommitting}
                    onSubmit={submitPrompt}
                  />
                ) : null}
                </motion.div>
              </div>
              </motion.div>
          ) : !expanded ? (
            <motion.button
              key="studio-companion-dock"
              layout
              type="button"
              aria-expanded="false"
              aria-label="Open EKO"
              onClick={openCompanion}
              whileTap={reduceMotion ? undefined : { scale: 0.96 }}
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, filter: 'blur(1px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)', transition: morphEnterTransition }}
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, filter: 'blur(1px)', transition: morphExitTransition }
              }
              transition={dockTransition}
              style={{
                backgroundImage:
                  'linear-gradient(in oklab 180deg, oklab(0% 0 0 / 40%) 0%, 8.64%, oklab(21.8% -0.009 -0.051 / 40.9%) 29.59%, 64.02%, oklab(53.4% -0.044 -0.100 / 50%) 78.48%, 84.04%, oklab(65.7% 0.018 0.062 / 50%) 87.48%, oklab(77.2% 0.081 0.143 / 50%) 100%)',
              }}
              /* 42px tall, 13px inline, 21px radius — Paper's inner glass, verbatim.
                 The two insets are NOT a symmetric bevel: #ACACAC38 is a grey top edge and
                 #FFFFFF33 is a WHITE bottom one. The old rule darkened the bottom (black at
                 20%), which is what flattened the pill — the gradient's warm bottom stop
                 and that lit bottom rim are the same idea, and one was cancelling the other. */
              className="relative z-[2] flex h-[42px] items-center gap-2 rounded-[21px] px-[13px] text-[13px] font-medium leading-[17px] text-white/80 shadow-[inset_0_1px_0_#ACACAC38,inset_0_-1px_0_#FFFFFF33]"
            >
              <motion.span
                layoutId={layout.icon}
                /* rgb(70 70 70 / 12%) — a DARK wash, not `white/12`. On the dock's own
                   gradient a white chip floats off the surface; the grey sits into it.
                   The ring is a half-pixel, so it reads as an edge rather than a border. */
                className="relative z-[2] flex size-7 shrink-0 items-center justify-center rounded-full bg-[rgb(70_70_70/0.12)] text-[#DADADA] shadow-[inset_0_0_0_0.5px_#FFFFFF24]"
                transition={dockTransition}
              >
                <DotMatrixAgentLoader state="idle" className="size-5" />
              </motion.span>
              {/* "EKO", not "Ask EKO" — and always shown. The whole dock is 90px wide;
                  there is no viewport it needs hiding on. */}
              <span className="relative z-[2]">EKO</span>
            </motion.button>
          ) : null}
          </AnimatePresence>
        </motion.div>
      </div>
    </LayoutGroup>
  );
}

/* Static coordinate table — hoisted out of the loader so it is not rebuilt on
   every frame of the animation it drives. */
const ACTIVE_DOTS_BY_STATE: Record<AgentIconState, Array<[number, number, number]>> = {
  idle: [
    [17, 17, 0],
    [28, 17, 90],
    [39, 17, 180],
    [17, 28, 270],
    [28, 28, 360],
    [39, 28, 450],
    [17, 39, 540],
    [28, 39, 630],
    [39, 39, 720],
  ],
  thinking: [
    [28, 6, 0],
    [17, 17, 90],
    [28, 17, 180],
    [39, 17, 270],
    [6, 28, 360],
    [17, 28, 450],
    [28, 28, 540],
    [39, 28, 630],
    [50, 28, 720],
    [17, 39, 810],
    [28, 39, 900],
    [39, 39, 990],
    [28, 50, 1080],
  ],
  working: [
    [6, 17, 0],
    [17, 17, 80],
    [28, 17, 160],
    [39, 17, 240],
    [50, 17, 320],
    [17, 28, 400],
    [28, 28, 480],
    [39, 28, 560],
    [6, 39, 640],
    [17, 39, 720],
    [28, 39, 800],
    [39, 39, 880],
    [50, 39, 960],
  ],
  finished: [
    [6, 28, 0],
    [17, 39, 80],
    [28, 50, 160],
    [28, 39, 240],
    [39, 28, 320],
    [50, 17, 400],
  ],
  permission: [
    [28, 6, 0],
    [17, 17, 80],
    [28, 17, 160],
    [39, 17, 240],
    [17, 28, 320],
    [28, 28, 400],
    [39, 28, 480],
    [17, 39, 560],
    [39, 39, 640],
    [28, 50, 720],
  ],
  error: [
    [17, 17, 0],
    [39, 17, 90],
    [28, 28, 180],
    [17, 39, 270],
    [39, 39, 360],
  ],
};

function DotMatrixAgentLoader({
  className,
  state = 'thinking',
}: {
  className?: string;
  state?: AgentIconState;
}) {
  const baseId = useId().replace(/:/g, '');
  const dimId = `${baseId}-dim`;
  const litId = `${baseId}-lit`;
  const stateClass = `agent-dotmatrix-${state}`;
  const stateTitle =
    state === 'error'
      ? 'Error'
    : state === 'permission'
      ? 'Permission required'
      : state === 'finished'
        ? 'Finished'
        : state === 'working'
          ? 'Working'
          : state === 'idle'
            ? 'Idle'
            : 'Thinking';
  const activeDots = ACTIVE_DOTS_BY_STATE[state];

  return (
    <svg
      className={cn('agent-dotmatrix', stateClass, className)}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 56 56"
      role="img"
      aria-label={stateTitle}
    >
      <title>{stateTitle}</title>
      <desc>Dot matrix status indicator for EKO.</desc>
      <defs>
        <circle id={dimId} r="2.4" fill="currentColor" opacity="0.11" />
        <circle id={litId} r="3.1" fill="currentColor" />
      </defs>
      <style>
        {`
          .agent-dotmatrix .agent-dotmatrix-lit {
            opacity: 0.32;
            transform-box: fill-box;
            transform-origin: center;
            animation: agent-dotmatrix-idle 2200ms cubic-bezier(0.65, 0, 0.35, 1) infinite both;
          }
          .agent-dotmatrix-thinking .agent-dotmatrix-lit {
            animation-name: agent-dotmatrix-thinking;
            animation-duration: 980ms;
          }
          .agent-dotmatrix-working .agent-dotmatrix-lit {
            animation-name: agent-dotmatrix-working;
            animation-duration: 1100ms;
          }
          .agent-dotmatrix-finished .agent-dotmatrix-lit {
            animation-name: agent-dotmatrix-finished;
            animation-duration: 1650ms;
          }
          .agent-dotmatrix-permission .agent-dotmatrix-lit {
            animation-name: agent-dotmatrix-permission;
            animation-duration: 1450ms;
          }
          .eko-shimmer-text {
            color: rgba(255,255,255,0.82);
            text-shadow:
              0 1px 0 rgba(255,255,255,0.08),
              0 0 0 rgba(255,255,255,0);
            animation: eko-shimmer-text 2600ms ease-in-out infinite;
          }
          @keyframes agent-dotmatrix-idle {
            0%, 100% { opacity: 0.22; transform: scale(0.82); }
            48% { opacity: 0.58; transform: scale(1); }
          }
          @keyframes agent-dotmatrix-thinking {
            0% { opacity: 0.12; transform: scale(0.76); }
            35% { opacity: 1; transform: scale(1.04); }
            64% { opacity: 0.22; transform: scale(0.86); }
            100% { opacity: 0.12; transform: scale(0.76); }
          }
          @keyframes agent-dotmatrix-working {
            0%, 100% { opacity: 0.2; transform: translateY(0) scale(0.82); }
            42% { opacity: 0.95; transform: translateY(-1px) scale(1); }
            68% { opacity: 0.38; transform: translateY(0) scale(0.9); }
          }
          @keyframes agent-dotmatrix-finished {
            0%, 100% { opacity: 0.34; transform: scale(0.88); }
            45% { opacity: 0.88; transform: scale(1.04); }
          }
          @keyframes agent-dotmatrix-permission {
            0%, 100% { opacity: 0.28; transform: scale(0.84); }
            35% { opacity: 0.92; transform: scale(1); }
            70% { opacity: 0.42; transform: scale(0.9); }
          }
          @keyframes eko-shimmer-text {
            0%, 100% {
              color: rgba(255,255,255,0.76);
              text-shadow:
                0 1px 0 rgba(255,255,255,0.06),
                0 0 0 rgba(255,255,255,0);
            }
            42% {
              color: rgba(255,255,255,0.96);
              text-shadow:
                0 1px 0 rgba(255,255,255,0.16),
                0 0 16px rgba(216,235,255,0.24);
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .agent-dotmatrix .agent-dotmatrix-lit {
              animation: none;
              opacity: 0.45;
            }
            .eko-shimmer-text {
              animation: none;
            }
            .eko-shimmer-text {
              color: rgba(255,255,255,0.84);
              background: none;
              text-shadow: 0 1px 0 rgba(255,255,255,0.08);
            }
          }
        `}
      </style>
      {[6, 17, 28, 39, 50].map((y) =>
        [6, 17, 28, 39, 50].map((x) => <use key={`${x}-${y}`} href={`#${dimId}`} x={x} y={y} />),
      )}
      {activeDots.map(([x, y, delay]) => (
        <use
          key={`${x}-${y}-${delay}`}
          className="agent-dotmatrix-lit"
          href={`#${litId}`}
          x={x}
          y={y}
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </svg>
  );
}
