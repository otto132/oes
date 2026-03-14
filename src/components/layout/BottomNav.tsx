'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Shield, TrendingUp, Inbox, Menu } from 'lucide-react';
import { useBadgeCounts } from '@/lib/queries/badge-counts';
import { cn } from '@/lib/utils';

const tabs = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/queue', label: 'Queue', icon: Shield, badgeKey: 'queue' as const },
  { href: '/pipeline', label: 'Pipeline', icon: TrendingUp },
  { href: '/inbox', label: 'Inbox', icon: Inbox, badgeKey: 'inbox' as const },
  { href: '/settings', label: 'More', icon: Menu },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { data: bc } = useBadgeCounts();
  const badges: Record<string, number> = {
    queue: bc?.queue ?? 0,
    inbox: bc?.inbox ?? 0,
  };

  return (
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
    </nav>
  );
}
