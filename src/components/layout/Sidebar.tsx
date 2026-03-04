'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  FileText,
  LogOut,
  Activity,
  Bell,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

const NAV = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/tasks', label: 'My Tasks', icon: CheckSquare },
  { href: '/team', label: 'Team', icon: Users },
  { href: '/docs', label: 'Docs', icon: FileText },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(p => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
}

interface SidebarProps {
  email: string;
  displayName?: string;
  avatarUrl?: string;
}

export function Sidebar({ email, displayName, avatarUrl }: SidebarProps) {
  const pathname = usePathname();
  const label = displayName || email;

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2.5 px-4 py-5">
        <div className="flex h-8 w-8 items-center justify-center shrink-0">
          <img src="/seeko-logo.png" alt="SEEKO" className="h-6 w-6 invert" />
        </div>
        <span className="font-semibold text-base tracking-tight text-sidebar-foreground">
          SEEKO
        </span>
      </div>

      <Separator className="bg-sidebar-border" />

      <nav className="flex flex-col gap-0.5 p-2 flex-1 mt-1">
        {NAV.map(({ href, label: navLabel, icon: Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-foreground font-medium'
                  : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
              ].join(' ')}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {navLabel}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-2.5 mb-3">
          <Avatar className="size-8">
            <AvatarImage src={avatarUrl} alt={label} />
            <AvatarFallback className="bg-secondary text-foreground text-[10px]">
              {getInitials(label)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            {displayName && (
              <p className="text-sm font-medium text-sidebar-foreground truncate">{displayName}</p>
            )}
            <p className="text-xs text-muted-foreground truncate">{email}</p>
          </div>
        </div>
        <form action="/auth/signout" method="post">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-xs text-muted-foreground px-0 hover:text-foreground"
            type="submit"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  );
}
