'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Plus, Bell } from 'lucide-react';
import { useBadgeCounts } from '@/lib/queries/badge-counts';
import { useSession } from 'next-auth/react';

const titles: Record<string, string> = {
  '/': 'Home', '/queue': 'Approval Queue', '/signals': 'Signals', '/leads': 'Leads',
  '/accounts': 'Accounts', '/pipeline': 'Pipeline', '/inbox': 'Inbox', '/tasks': 'Tasks', '/settings': 'Settings',
};

export default function TopBar() {
  const pathname = usePathname();
  const { data: badges } = useBadgeCounts();
  const { data: session } = useSession();
  const pendingCount = badges?.queue ?? 0;
  const title = titles[pathname] || (pathname.startsWith('/accounts/') ? 'Account' : pathname.startsWith('/pipeline/') ? 'Opportunity' : 'Eco-Insight');
  const initials = session?.user?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) ?? '?';

  return (
    <header className="fixed top-0 left-0 md:left-[220px] right-0 h-12 bg-elevated/80 backdrop-blur-sm border-b border-border flex items-center gap-3 px-4 md:px-6 z-20">
      <span className="text-[12.5px] font-medium text-sub">{title}</span>
      <div className="flex items-center gap-1.5 ml-auto">
        <button className="inline-flex items-center gap-1 px-2.5 py-[5px] text-[12px] font-medium rounded-md bg-brand text-[#09090b] hover:brightness-110 transition-all">
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} /><span className="hidden md:inline">New</span>
        </button>
        <Link href="/queue" className="relative w-8 h-8 rounded-md flex items-center justify-center text-muted hover:bg-hover hover:text-sub transition-colors">
          <Bell className="w-4 h-4" />
          {pendingCount > 0 && <span className="absolute top-1 right-1 w-[6px] h-[6px] rounded-full bg-brand" />}
        </Link>
        <div className="hidden md:flex w-7 h-7 rounded-md bg-surface border border-border text-sub items-center justify-center text-[10px] font-semibold cursor-pointer hover:border-border-strong transition-colors">{initials}</div>
      </div>
    </header>
  );
}
