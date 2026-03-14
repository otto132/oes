'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Shield, Signal, Target, Building2, TrendingUp, Inbox, CheckSquare, Settings, Search, Sun, Moon, LogOut } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { useBadgeCounts } from '@/lib/queries/badge-counts';

const sections = [
  { label: 'Core', items: [
    { href: '/', label: 'Home', icon: Home },
    { href: '/queue', label: 'Approval Queue', icon: Shield, badgeKey: 'queue' },
    { href: '/signals', label: 'Signals', icon: Signal, badgeKey: 'signals' },
  ]},
  { label: 'CRM', items: [
    { href: '/leads', label: 'Leads', icon: Target, badgeKey: 'leads' },
    { href: '/accounts', label: 'Accounts', icon: Building2 },
    { href: '/pipeline', label: 'Pipeline', icon: TrendingUp },
    { href: '/inbox', label: 'Inbox', icon: Inbox, badgeKey: 'inbox' },
  ]},
  { label: 'Workflow', items: [
    { href: '/tasks', label: 'Tasks', icon: CheckSquare, badgeKey: 'tasks' },
  ]},
  { label: 'System', items: [
    { href: '/settings', label: 'Settings', icon: Settings },
  ]},
];

export default function Sidebar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useStore();
  const { data: badges } = useBadgeCounts();
  const { data: session } = useSession();
  const me = {
    id: session?.user?.id ?? '',
    name: session?.user?.name ?? '',
    initials: session?.user?.name ? session.user.name.split(/\s+/).map(p => p[0]).join('').toUpperCase().slice(0, 2) : '??',
    role: session?.user?.role ?? '',
    color: 'green',
  };

  const badgeCounts: Record<string, number> = {
    queue: badges?.queue ?? 0,
    signals: badges?.signals ?? 0,
    leads: badges?.leads ?? 0,
    inbox: badges?.inbox ?? 0,
    tasks: badges?.tasks ?? 0,
  };

  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[220px] bg-elevated border-r border-border hidden md:flex flex-col z-30">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 h-12 border-b border-border">
        <div className="w-6 h-6 rounded-md bg-brand flex items-center justify-center flex-shrink-0">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
        </div>
        <div className="text-[13px] font-semibold text-text tracking-tight">Eco-Insight</div>
      </div>

      {/* Search */}
      <div className="px-3 py-2.5">
        <button
          onClick={() => useStore.getState().openPalette()}
          className="flex items-center gap-2 w-full px-2.5 py-[6px] rounded-md bg-surface border border-border text-muted hover:border-border-strong transition-colors cursor-pointer"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="flex-1 text-[12px] text-left">Search…</span>
          <kbd className="text-[10px]">⌘K</kbd>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2">
        {sections.map(sec => (
          <div key={sec.label} className="py-1.5">
            <div className="px-2.5 pb-1 text-3xs font-semibold tracking-[0.08em] uppercase text-muted">{sec.label}</div>
            {sec.items.map(item => {
              const active = isActive(item.href);
              const badge = item.badgeKey ? badgeCounts[item.badgeKey] : 0;
              return (
                <Link key={item.href} href={item.href} className={cn(
                  'flex items-center gap-2.5 px-2.5 py-[6px] rounded-md text-[12.5px] transition-colors',
                  active ? 'bg-surface text-text font-medium' : 'text-sub hover:bg-hover hover:text-text'
                )}>
                  <item.icon className={cn('w-[15px] h-[15px] flex-shrink-0', active ? 'text-brand' : 'text-muted')} />
                  {item.label}
                  {badge > 0 && (
                    <span className="ml-auto text-[10px] font-semibold text-muted bg-surface border border-border px-1 min-w-[18px] h-[18px] rounded flex items-center justify-center">
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-border flex flex-col gap-2">
        <button onClick={toggleTheme} className="flex items-center gap-1.5 w-full px-2.5 py-[5px] rounded-md text-[11px] text-muted hover:text-sub hover:bg-hover transition-colors">
          {theme === 'dark' ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <button onClick={() => signOut({ callbackUrl: '/login' })} className="flex items-center gap-1.5 w-full px-2.5 py-[5px] rounded-md text-[11px] text-muted hover:text-sub hover:bg-hover transition-colors">
          <LogOut className="w-3 h-3" />
          Sign out
        </button>
        <div className="flex items-center gap-2 px-1">
          <div className="w-7 h-7 rounded-md bg-surface border border-border text-sub flex items-center justify-center text-[10px] font-semibold">{me.initials}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[11.5px] font-medium text-text truncate">{me.name}</div>
            <div className="text-[10px] text-muted truncate">{me.role}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
