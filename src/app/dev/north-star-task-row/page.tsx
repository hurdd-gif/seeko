/**
 * North-Star B — Editorial task row at the dense pole.
 *
 * Dev-only route to prove the cream/ink/Outfit language at data density.
 * Reference: docs/visual-overhaul/joby-reference.md.
 *
 * Composition rules (less is more, per Joby register):
 *   • No card. No fill. Rows live directly on cream paper.
 *   • Hairline rule between rows, never around them.
 *   • Status reads via type weight + opacity, not color.
 *   • The single amber dot appears only for needs-attention.
 *   • Department is a small uppercase Geist tag — no chroma, no badge fill.
 *   • Dates right-aligned, tabular nums.
 *   • Assignee is a hairline-ring monogram circle, no fill, no avatar URL.
 *
 * No motion on row entrance — entrance animation distracts when scanning
 * dense data. Hover is the only motion: a quiet ink/3 wash on the row,
 * spec'd via exact transition properties.
 */

import type { TaskStatus, Department } from '@/lib/types';

interface MockTask {
  id: string;
  title: string;
  status: TaskStatus;
  assignee: string; // monogram (e.g. "YK")
  department: Department;
  deadline: string; // ISO date
}

const MOCK_TASKS: MockTask[] = [
  { id: 'T-039', title: 'Refactor onboarding flow', status: 'In Progress', assignee: 'YK', department: 'UI/UX', deadline: '2026-05-12' },
  { id: 'T-040', title: 'Investor deck v3 — narrative pass', status: 'Blocked', assignee: 'MR', department: 'Visual Art', deadline: '2026-05-04' },
  { id: 'T-038', title: 'Sign-in copy review', status: 'Complete', assignee: 'JL', department: 'UI/UX', deadline: '2026-04-28' },
  { id: 'T-041', title: 'Tutorial level — combat encounter timing', status: 'In Progress', assignee: 'AS', department: 'Animation', deadline: '2026-05-18' },
  { id: 'T-042', title: 'Character art — bestiary tier 2', status: 'In Review', assignee: 'EM', department: 'Asset Creation', deadline: '2026-05-08' },
  { id: 'T-037', title: 'Build pipeline — fix PR check timeouts', status: 'Complete', assignee: 'JL', department: 'Coding', deadline: '2026-04-22' },
  { id: 'T-043', title: 'Fighting Club — netcode rollback proof of concept', status: 'Blocked', assignee: 'YK', department: 'Coding', deadline: '2026-05-15' },
  { id: 'T-044', title: 'Marketing site — landing copy', status: 'In Progress', assignee: 'MR', department: 'UI/UX', deadline: '2026-05-22' },
  { id: 'T-045', title: 'Asset packaging — atlas optimization', status: 'In Review', assignee: 'AS', department: 'Asset Creation', deadline: '2026-05-10' },
  { id: 'T-036', title: 'Studio NDA template', status: 'Complete', assignee: 'JL', department: 'UI/UX', deadline: '2026-04-15' },
  { id: 'T-046', title: 'Audio direction — combat impacts', status: 'In Progress', assignee: 'EM', department: 'Animation', deadline: '2026-05-25' },
  { id: 'T-047', title: 'Telemetry dashboard — first cut', status: 'In Progress', assignee: 'YK', department: 'Coding', deadline: '2026-05-30' },
];

// Department abbreviations to keep the column rhythm tight at data density.
// Sentence case (not uppercase) — uppercase-tracked metadata reads as
// generic AI chrome. Acronyms (UI/UX) keep their case.
const DEPT_LABEL: Record<string, string> = {
  'Coding': 'Code',
  'Visual Art': 'Art',
  'UI/UX': 'UI',
  'Animation': 'Anim',
  'Asset Creation': 'Assets',
};

function formatDate(iso: string): string {
  const [, m, d] = iso.split('-');
  const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m) - 1];
  return `${month} ${d}`;
}

function TaskRow({ task }: { task: MockTask }) {
  const isDone = task.status === 'Complete';
  const needsAttention = task.status === 'Blocked';

  return (
    <a
      href={`#${task.id}`}
      className="group grid grid-cols-[1rem_1fr_auto_auto_4rem] items-center gap-6 px-3 -mx-3 py-4 rounded-md transition-[background-color] duration-150 ease-out hover:bg-ink/[0.035]"
    >
      {/* Status dot — only renders when needs-attention.
          Sized to read as data, not decoration. Centered in fixed column. */}
      <span className="flex justify-center">
        <span
          aria-hidden={!needsAttention}
          aria-label={needsAttention ? 'needs attention' : undefined}
          className={
            'h-[7px] w-[7px] rounded-full ' +
            (needsAttention ? 'bg-status-warning' : 'bg-transparent')
          }
        />
      </span>

      {/* Title — type weight + opacity carry the status */}
      <span
        className={
          'font-sans text-[0.9375rem] leading-[1.4] truncate ' +
          (isDone
            ? 'text-ink/40 font-normal'
            : 'text-ink font-medium')
        }
      >
        {task.title}
      </span>

      {/* Department — sentence-case ledger code, muted */}
      <span className="font-sans text-[0.8125rem] text-ink/45 hidden md:inline">
        {DEPT_LABEL[task.department] ?? task.department}
      </span>

      {/* Assignee — hairline-ring monogram, no fill */}
      <span
        aria-label={`Assigned to ${task.assignee}`}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full ring-1 ring-inset ring-border font-sans text-[0.625rem] font-medium tracking-[0.04em] text-ink/65"
      >
        {task.assignee}
      </span>

      {/* Deadline — right-aligned, tabular nums, fixed width column */}
      <span className="font-sans text-[0.8125rem] text-ink/55 tabular-nums whitespace-nowrap text-right">
        {formatDate(task.deadline)}
      </span>
    </a>
  );
}

export default function NorthStarTaskRowPage() {
  // Active tasks first (In Progress / In Review / Blocked), Done at the bottom.
  const sorted = [...MOCK_TASKS].sort((a, b) => {
    const aDone = a.status === 'Complete' ? 1 : 0;
    const bDone = b.status === 'Complete' ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return a.deadline.localeCompare(b.deadline);
  });

  const activeCount = MOCK_TASKS.filter((t) => t.status !== 'Complete').length;
  const doneCount = MOCK_TASKS.length - activeCount;

  return (
    <main className="bg-paper text-ink min-h-dvh">
      <div className="mx-auto max-w-[64rem] px-8 sm:px-12 lg:px-16 pt-16 sm:pt-20 pb-24">
        {/* Headline — editorial register, lowercase, sized as signage not poster */}
        <div className="mb-10">
          <h1
            className="font-sans font-medium text-ink text-[clamp(2rem,4vw,2.75rem)] leading-[1.05] tracking-[-0.02em]"
            style={{ textIndent: '-0.02em' }}
          >
            tasks.
          </h1>
          <p className="mt-3 font-sans text-[0.875rem] text-ink/55 tabular-nums">
            {activeCount === 0
              ? 'all clear.'
              : `${activeCount} in motion — ${doneCount} done.`}
          </p>
        </div>

        {/* Task list — hairline rules between rows, no enclosure */}
        <div className="divide-y divide-border border-y border-border">
          {sorted.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      </div>
    </main>
  );
}
