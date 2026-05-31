export function DashboardHero({ greeting, name }: { greeting: string; name: string }) {
  return (
    <header className="mt-16 flex justify-center px-20">
      <h1 className="text-[30px] font-semibold leading-[1.2] text-foreground">
        {greeting}, {name}
      </h1>
    </header>
  );
}
