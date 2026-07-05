/**
 * Shared non-ready state surface for the full-bleed Paper pages (Docs / Activity
 * / Progress / Tasks). Those pages own `overview-light fixed inset-0` chrome via
 * <LightShell>, so their unauthorized / forbidden / not-found states render on
 * the same bare Paper canvas rather than relying on the shared dashboard shell.
 */
// Bare-canvas composition matching PaperErrorState in routes.tsx: quiet text
// directly on Paper, no card — access states are the absence of content, so
// they get no elevation of their own.
export function PaperState({ title, description }: { title: string; description: string }) {
  return (
    <div className="overview-light fixed inset-0 z-40 flex items-center justify-center bg-[var(--ov-bg)] px-6 antialiased">
      <div className="w-full max-w-md text-center">
        <h1 className="text-balance text-[15px] font-semibold text-[#111]">{title}</h1>
        <p className="mx-auto mt-1.5 max-w-[44ch] text-pretty text-[13px] leading-relaxed text-[#808080]">
          {description}
        </p>
      </div>
    </div>
  );
}
