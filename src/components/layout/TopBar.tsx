'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useSession } from 'next-auth/react';
import NotificationDropdown from '@/components/layout/NotificationDropdown';

const titles: Record<string, string> = {
  '/': 'Home', '/queue': 'Approval Queue', '/signals': 'Signals', '/leads': 'Leads',
  '/accounts': 'Accounts', '/pipeline': 'Pipeline', '/inbox': 'Inbox', '/tasks': 'Tasks', '/settings': 'Settings',
};

export default function TopBar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const title = titles[pathname] || (pathname.startsWith('/accounts/') ? 'Account' : pathname.startsWith('/pipeline/') ? 'Opportunity' : 'Eco-Insight');
  const initials = session?.user?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) ?? '?';

  return (
    <header className="fixed top-0 left-0 md:left-[220px] right-0 h-12 bg-elevated/80 backdrop-blur-sm border-b border-border flex items-center gap-3 px-4 md:px-6 z-20">
      <span className="text-[12.5px] font-medium text-sub">{title}</span>
      <div className="flex items-center gap-1.5 ml-auto">
        <button className="inline-flex items-center gap-1 px-2.5 py-[5px] text-[12px] font-medium rounded-md bg-brand text-[#09090b] hover:brightness-110 transition-all">
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} /><span className="hidden md:inline">New</span>
        </button>
        <NotificationDropdown />
        <div className="hidden md:flex w-7 h-7 rounded-md bg-surface border border-border text-sub items-center justify-center text-[10px] font-semibold cursor-pointer hover:border-border-strong transition-colors">{initials}</div>
      </div>
    </header>
  );
}
