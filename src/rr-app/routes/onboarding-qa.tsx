import type { OnboardingData } from '@/lib/onboarding-index';
import { OnboardingRouteContent } from './onboarding';

/* No-backend visual-QA preview for the onboarding step, reachable at
 * /onboarding/qa WITHOUT the loader's auth gate. Renders the ORIGINAL
 * <OnboardingForm> (light-ported) inside <LightAuthShell> with seed data, so the
 * true refreshed Paper chrome — logo → "Welcome aboard to SEEKO!" → form — can
 * be screenshot-verified offline. NOT a migration target — deliberately absent
 * from routeInventory (mirrors /admin/external-signing/qa). */
const SEED: OnboardingData = {
  currentUser: { id: 'qa-user', email: 'preview@seeko.studio' },
  profile: {
    id: 'qa-user',
    displayName: 'Avery Quinn',
    avatarUrl: null,
    email: 'preview@seeko.studio',
    onboarded: 0,
  },
};

export function OnboardingQaRoute() {
  return <OnboardingRouteContent data={{ status: 'ready', index: SEED }} />;
}
