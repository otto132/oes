'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Shield, TrendingUp, Inbox, CheckSquare, Users, Signal, BarChart3, Calendar } from 'lucide-react';
import { useBadgeCounts } from '@/lib/queries/badge-counts';
import { cn } from '@/lib/utils';

const ALL_TABS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/queue', label: 'Queue', icon: Shield, badgeKey: 'queue' as const },
  { href: '/pipeline', label: 'Pipeline', icon: TrendingUp },
  { href: '/inbox', label: 'Inbox', icon: Inbox, badgeKey: 'inbox' as const },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare, badgeKey: 'tasks' as const },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/signals', label: 'Signals', icon: Signal },
  { href: '/accounts', label: 'Accounts', icon: BarChart3 },
  { href: '/meetings', label: 'Meetings', icon: Calendar },
] as const;

const DEFAULT_TABS = ['/', '/queue', '/pipeline', '/inbox', '/tasks'];
const STORAGE_KEY = 'eco-bottom-nav-tabs';

function getSelectedTabs(): string[] {
  if (typeof window === 'undefined') return DEFAULT_TABS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length === 5) return parsed;
    }
  } catch {}
  return DEFAULT_TABS;
}

export function setBottomNavTabs(hrefs: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(hrefs.slice(0, 5)));
}

export { ALL_TABS, DEFAULT_TABS, STORAGE_KEY };

export default function BottomNav() {
  const pathname = usePathname();
  const { data: bc } = useBadgeCounts();
  const [selected, setSelected] = useState(DEFAULT_TABS);

  useEffect(() => {
    setSelected(getSelectedTabs());
  }, []);

  const badges: Record<string, number> = {
    queue: bc?.queue ?? 0,
    inbox: bc?.inbox ?? 0,
    tasks: bc?.tasks ?? 0,
  };

  const tabs = selected
    .map(href => ALL_TABS.find(t => t.href === href))
    .filter(Boolean) as typeof ALL_TABS[number][];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-elevated/90 backdrop-blur-sm border-t border-border z-30 flex items-center justify-around px-1 pb-[env(safe-area-inset-bottom)]">
      {tabs.map(tab => {
        const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
        const badge = 'badgeKey' in tab && tab.badgeKey ? badges[tab.badgeKey] : 0;
        return (
          <Link key={tab.href} href={tab.href} className={cn('flex flex-col items-center gap-0.5 py-1.5 px-2.5 rounded-md flex-1 min-w-0', active ? 'text-brand' : 'text-muted')}>
            <div className="relative">
              <tab.icon className="w-5 h-5" />
              {badge > 0 && <span className="absolute -top-0.5 -right-1.5 min-w-[14px] h-[14px] rounded-full text-3xs font-bold flex items-center justify-center px-[3px] bg-brand text-brand-on">{badge}</span>}
            </div>
            <span className="text-3xs font-medium">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
