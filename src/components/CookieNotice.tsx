'use client';

import { lazy, Suspense, useState } from 'react';

/* This is a NOTICE, not a consent request — a legal-review decision
 * (2026-07-04). The workspace sets only strictly-necessary cookies (auth
 * session, payments passkey session, 5-minute passkey challenge), which are
 * exempt from consent under ePrivacy/PECR. An Accept/Decline pair here would
 * be an illusory choice — declining can't unset cookies the site needs to
 * function — which is exactly the deceptive pattern EDPB Guidelines 03/2022
 * and the FTC dark-patterns report flag. So: one acknowledgement button, and
 * the copy says plainly that these cookies can't be switched off. If a
 * non-essential cookie (analytics etc.) is ever added, this must become a
 * real consent flow — do not just reword this card. */
const STORAGE_KEY = 'seeko-cookie-notice-ack';

function isAcknowledged(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    // Storage blocked (private mode / hardened browser): show the notice;
    // the acknowledgement just won't persist across visits.
    return false;
  }
}

/* The card is the ONLY thing in the entry's import graph that reaches `motion`
 * (~40 KB gzip) — every other consumer already sits behind a lazy route. Left
 * as a static import it was downloaded and parsed before first paint on EVERY
 * visit, including the overwhelming majority where isAcknowledged() is true and
 * the component renders nothing at all.
 *
 * So the split is a gate, not merely a deferral. This module stays eager and
 * costs a localStorage read; the dynamic import below is only ever reached on a
 * visit that will actually show the notice. A returning visitor never fetches
 * the chunk. A first-time visitor fetches it after paint, which is right for a
 * card that deliberately waits 600ms before animating in anyway.
 *
 * Rollup places `motion` in a chunk shared with the lazy routes, so this costs
 * no duplication. */
const CookieNoticeCard = lazy(() =>
  import('./CookieNoticeCard').then((mod) => ({ default: mod.CookieNoticeCard }))
);

export function CookieNotice() {
  // Read once, at mount. This answers "has this browser ever acknowledged?",
  // which cannot change during the visit — dismissal is the card's business.
  const [acknowledged] = useState(isAcknowledged);

  if (acknowledged) return null;

  return (
    <Suspense fallback={null}>
      <CookieNoticeCard
        onAcknowledge={() => {
          try {
            localStorage.setItem(STORAGE_KEY, new Date().toISOString());
          } catch {
            // Non-fatal — the card still dismisses for this visit.
          }
        }}
      />
    </Suspense>
  );
}
