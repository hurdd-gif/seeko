import { DitheredShaderCanvas } from '@/components/auth/DitheredShaderCanvas';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh flex bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {/* Left: login panel area */}
      <div className="flex w-full items-center justify-center px-6 md:w-[45%] md:px-12">
        {children}
      </div>

      {/* Right: shader canvas (hidden on mobile) */}
      <div className="hidden md:block md:w-[55%] relative">
        <DitheredShaderCanvas className="absolute inset-0" />
      </div>
    </div>
  );
}
