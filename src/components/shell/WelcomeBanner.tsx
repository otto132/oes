'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Building2, Mail, Signal, TrendingUp, X } from 'lucide-react';

const DISMISSED_KEY = 'eco-welcome-dismissed';

const steps = [
  { icon: Building2, title: 'Add your first account', description: 'Import or create accounts to get started', href: '/accounts', color: 'text-brand' },
  { icon: Mail, title: 'Connect Outlook', description: 'Link your email for AI classification', href: '/settings', color: 'text-info' },
  { icon: Signal, title: 'Review signals', description: 'AI-detected market signals await', href: '/signals', color: 'text-purple' },
  { icon: TrendingUp, title: 'Set up pipeline', description: 'Track your deals from contact to close', href: '/pipeline', color: 'text-warn' },
];

export function WelcomeBanner({ name }: { name: string }) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISSED_KEY) === 'true');
  }, []);

  if (dismissed) return null;

  return (
    <div className="rounded-lg bg-[var(--elevated)] border border-[var(--brand-border)] p-5 mb-4 relative">
      <button onClick={() => { setDismissed(true); localStorage.setItem(DISMISSED_KEY, 'true'); }} className="absolute top-3 right-3 p-1 rounded-md hover:bg-[var(--hover)] text-[var(--muted)] transition-colors">
        <X className="w-4 h-4" />
      </button>
      <h2 className="text-[16px] font-semibold mb-1">Welcome to Eco-Insight, <span className="text-brand">{name}</span></h2>
      <p className="text-[12px] text-[var(--muted)] mb-4">Get started by completing these steps to set up your CRM.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {steps.map(s => (
          <Link key={s.href} href={s.href} className="rounded-lg bg-[var(--surface)] border border-[var(--border)] p-3 hover:border-[var(--border-strong)] transition-colors group">
            <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
            <div className="text-[12px] font-medium group-hover:text-brand transition-colors">{s.title}</div>
            <div className="text-[10px] text-[var(--muted)] mt-0.5">{s.description}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
