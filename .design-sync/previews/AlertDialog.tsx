import * as React from 'react';
import {
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from 'seeko-studio';

// AlertDialog is a controlled overlay (open / onOpenChange). The root renders a
// `position: fixed inset-0` backdrop + centered panel — it is NOT portaled to
// <body>, so with open={true} it shows inside the capture viewport. To guarantee
// every cell shows a styled, in-card confirmation panel regardless of how the
// fixed overlay clips, the composed cells render AlertDialogContent + its
// sub-parts DIRECTLY inside the dark Surface (skipping the fixed wrapper).
//
// AlertDialogContent uses motion initial={{ opacity: 0, scale: 0.95 }}; the static
// capture freezes at frame 0, so the panel + its text would be invisible.
// ForceVisible injects an !important stylesheet that overrides motion's
// (non-important) inline opacity/transform so the resting state is shown.
let fvId = 0;
const ForceVisible: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const cls = React.useMemo(() => `ds-fv-${++fvId}`, []);
  return (
    <div className={cls}>
      <style>{`.${cls} *{opacity:1 !important;transform:none !important;}`}</style>
      {children}
    </div>
  );
};

const Surface: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      background: 'var(--color-background, #1a1a1a)',
      color: 'var(--color-foreground, #f0f0f0)',
      fontFamily: 'var(--font-outfit), system-ui, sans-serif',
      padding: 24,
      borderRadius: 12,
      position: 'relative',
      minHeight: 220,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <ForceVisible>{children}</ForceVisible>
  </div>
);

// Inner panel composed inline — guaranteed visible in-card destructive confirm.
export const DeleteConfirm = () => (
  <Surface>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete task DIH-204?</AlertDialogTitle>
        <AlertDialogDescription>
          This permanently removes &ldquo;Implement combat hit-detection&rdquo; from Main Game.
          This action cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive">Delete</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </Surface>
);

// A non-destructive confirm variant.
export const DiscardChanges = () => (
  <Surface>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
        <AlertDialogDescription>
          You have edits to this Fighting Club task that haven&rsquo;t been saved. Leaving now
          will lose them.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Keep editing</AlertDialogCancel>
        <AlertDialogAction>Discard</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </Surface>
);

// Destructive confirm — removing a teammate from the studio.
export const RemoveMember = () => (
  <Surface>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Remove from studio?</AlertDialogTitle>
        <AlertDialogDescription>
          This revokes access to all Main Game and Fighting Club tasks and docs. Their
          completed work stays attributed.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive">Remove</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </Surface>
);
