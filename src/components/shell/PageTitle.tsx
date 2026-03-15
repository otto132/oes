'use client';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/queue': 'Approval Queue',
  '/signals': 'Signals',
  '/leads': 'Leads',
  '/accounts': 'Accounts',
  '/pipeline': 'Pipeline',
  '/inbox': 'Inbox',
  '/import': 'Import',
  '/tasks': 'Tasks',
  '/meetings': 'Meetings',
  '/digest': 'Weekly Digest',
  '/settings': 'Settings',
  '/admin': 'Admin',
};

export default function PageTitle() {
  const pathname = usePathname();

  useEffect(() => {
    const base = pathname.split('/').slice(0, 2).join('/') || '/';
    const title = PAGE_TITLES[base] || 'Eco-Insight';
    document.title = `${title} | Eco-Insight`;
  }, [pathname]);

  return null;
}
