'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Shield, TrendingUp, Inbox, CheckSquare, MoreHorizontal, X, Zap, Users, Building2, Calendar, Settings, ShieldCheck, Signal, BarChart3 } from 'lucide-react';
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

const tabs = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/queue', label: 'Queue', icon: Shield, badgeKey: 'queue' as const },
  { href: '/pipeline', label: 'Pipeline', icon: TrendingUp },
  { href: '/inbox', label: 'Inbox', icon: Inbox, badgeKey: 'inbox' as const },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare, badgeKey: 'tasks' as const },
];

const moreItems = [
  { href: '/signals', label: 'Signals', icon: Zap },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/accounts', label: 'Accounts', icon: Building2 },
  { href: '/meetings', label: 'Meetings', icon: Calendar },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/admin', label: 'Admin', icon: ShieldCheck },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { data: bc } = useBadgeCounts();
  const [moreOpen, setMoreOpen] = useState(false);
  const [selected, setSelected] = useState(DEFAULT_TABS);

  useEffect(() => {
    setSelected(getSelectedTabs());
  }, []);

  const badges: Record<string, number> = {
    queue: bc?.queue ?? 0,
    inbox: bc?.inbox ?? 0,
    tasks: bc?.tasks ?? 0,
  };

  const moreActive = moreItems.some(item => pathname.startsWith(item.href));

  return (
    <>
      {/* More menu overlay */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute bottom-[calc(3.5rem+env(safe-area-inset-bottom))] left-2 right-2 bg-[var(--elevated)] border border-[var(--border)] rounded-xl shadow-xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)]">
              <span className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">More</span>
              <button onClick={() => setMoreOpen(false)} className="p-1 rounded-md hover:bg-[var(--hover)] transition-colors text-[var(--muted)]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1 p-2">
              {moreItems.map(item => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      'flex flex-col items-center gap-1 py-3 px-2 rounded-lg transition-colors',
                      active ? 'bg-[var(--brand-dim)] text-brand' : 'text-[var(--sub)] hover:bg-[var(--hover)]'
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="text-2xs font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-elevated/90 backdrop-blur-sm border-t border-border z-30 flex items-center justify-around px-1 pb-[env(safe-area-inset-bottom)]">
        {tabs.map(tab => {
          const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
          const badge = tab.badgeKey ? badges[tab.badgeKey] : 0;
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
        {/* More tab */}
        <button
          onClick={() => setMoreOpen(prev => !prev)}
          className={cn('flex flex-col items-center gap-0.5 py-1.5 px-2.5 rounded-md flex-1 min-w-0', moreActive || moreOpen ? 'text-brand' : 'text-muted')}
        >
          <MoreHorizontal className="w-5 h-5" />
          <span className="text-3xs font-medium">More</span>
        </button>
      </nav>
    </>
  );
}
