export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {children}
    </div>
  );
}
