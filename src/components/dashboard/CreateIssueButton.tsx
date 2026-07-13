/**
 * CreateIssueButton — the framed "+ Create" pill in the studio header.
 *
 * It opens the full New-issue composer (CreateTaskComposer, the centered modal
 * with title + description + property pills), replacing QuickCreateMorph, which
 * expanded the pill in place into a cramped quick-add form. The two surfaces
 * were rival answers to the same question: the morph could set status/priority/
 * department but not area, deadline, or a description, so "Create" from the
 * header and "+" from a column produced different issues from the same intent.
 * One composer, reached from both.
 *
 * The pill KEEPS the morph's CSS shell (.create-morph-anchor > .t-morph >
 * .create-morph-plus) pinned at data-open="false". That's not laziness: those
 * rules carry the closed pill's surface, radius, shadow, hover and 0.96 active
 * scale, and the anchor reserves its width in the header's flex row. Rebuilding
 * them in Tailwind would fork the pill's look from the geometry the header row
 * is laid out around.
 *
 * Off the board (/docs, /activity) no composer is listening, so the request is
 * parked and we navigate to /issues, where the board claims it on mount — see
 * create-issue-bus.ts.
 */

'use client';

import { Plus } from 'lucide-react';
import { useRouter } from '@/lib/react-router-adapters';
import { requestCreateIssue } from '@/lib/create-issue-bus';

export function CreateIssueButton({
  className = '',
  onOpen,
}: {
  className?: string;
  /** Fired when the composer is summoned — lets the header close its menus. */
  onOpen?: () => void;
}) {
  const router = useRouter();

  function handleClick() {
    onOpen?.();
    const delivered = requestCreateIssue();
    if (!delivered) router.push('/issues');
  }

  return (
    <div className={`create-morph-anchor ${className}`}>
      <div className="t-morph create-morph" data-open="false">
        <button
          type="button"
          data-testid="Create issue"
          className="t-morph-plus create-morph-plus"
          aria-label="Create"
          onClick={handleClick}
        >
          <Plus className="size-[15px]" strokeWidth={2.25} aria-hidden />
          <span>Create</span>
        </button>
      </div>
    </div>
  );
}
