import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/tasks', label: 'My Tasks' },
  { href: '/areas', label: 'Game Areas' },
  { href: '/team', label: 'Team' },
  { href: '/docs', label: 'Docs' },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return (
    <div className="flex min-h-screen bg-[#0a0a0b]">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 border-r border-zinc-800 flex flex-col py-6 px-4">
        <div className="mb-8">
          <span className="text-sm font-bold text-white tracking-wide">SEEKO</span>
          <span className="text-xs text-zinc-500 block">Studio</span>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto pt-4 border-t border-zinc-800">
          <p className="text-xs text-zinc-600 truncate">{user.email}</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="max-w-5xl mx-auto px-6 py-8 animate-[fadeUp_0.5s_ease-out]">
          {children}
        </div>
      </main>
    </div>
  );
}
