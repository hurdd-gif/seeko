/**
 * Ambient type declaration for the `cssstudio` package, which ships no types.
 *
 * CSS Studio is a dev-only visual CSS editor (see src/components/dev/css-studio.tsx).
 * Only the surface we actually use is declared here.
 */
declare module "cssstudio" {
  /** Boots the in-app CSS Studio overlay. Dev-only; never called in production. */
  export function startStudio(options?: Record<string, unknown>): void;

  /** Event names CSS Studio blocks on the host page while editing. */
  export const HOST_BLOCKED_EVENTS: readonly string[];
}
