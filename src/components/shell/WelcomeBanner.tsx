'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Building2, Mail, Signal, TrendingUp, X, Check } from 'lucide-react';

const DISMISSED_KEY = 'eco-welcome-dismissed';

interface StepDef {
  icon: typeof Building2;
  title: string;
  description: string;
  href: string;
  color: string;
  /** returns true when this step is considered complete */
  isDone: (stats: OnboardingStats) => boolean;
}

export interface OnboardingStats {
  accountCount: number;
  openDeals: number;
  newSignals: number;
}

const steps: StepDef[] = [
  { icon: Building2, title: 'Add your first account', description: 'Import or create accounts to get started', href: '/accounts', color: 'text-brand', isDone: (s) => s.accountCount > 0 },
  { icon: Mail, title: 'Connect Outlook', description: 'Link your email for AI classification', href: '/settings', color: 'text-info', isDone: () => false },
  { icon: Signal, title: 'Review signals', description: 'AI-detected market signals await', href: '/signals', color: 'text-purple', isDone: (s) => s.newSignals === 0 },
  { icon: TrendingUp, title: 'Set up pipeline', description: 'Track your deals from contact to close', href: '/pipeline', color: 'text-warn', isDone: (s) => s.openDeals > 0 },
];

export function WelcomeBanner({ name, stats }: { name: string; stats?: OnboardingStats }) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISSED_KEY) === 'true');
  }, []);

  // Auto-dismiss: once user has at least one account, mark as done
  useEffect(() => {
    if (stats && stats.accountCount > 0 && dismissed === false) {
      setDismissed(true);
      localStorage.setItem(DISMISSED_KEY, 'true');
    }
  }, [stats, dismissed]);

  // While loading from localStorage, render nothing to avoid flash
  if (dismissed === null || dismissed) return null;

  const completedCount = stats ? steps.filter(s => s.isDone(stats)).length : 0;

  return (
    <div className="rounded-lg bg-[var(--elevated)] border border-[var(--brand-border)] p-5 mb-4 relative">
      <button onClick={() => { setDismissed(true); localStorage.setItem(DISMISSED_KEY, 'true'); }} aria-label="Dismiss welcome banner" className="absolute top-3 right-3 p-1 rounded-md hover:bg-[var(--hover)] text-[var(--muted)] transition-colors">
        <X className="w-4 h-4" />
      </button>
      <h2 className="text-[16px] font-semibold mb-1">Welcome to Eco-Insight, <span className="text-brand">{name}</span></h2>
      <p className="text-[12px] text-[var(--muted)] mb-4">
        Get started by completing these steps to set up your CRM.
        {completedCount > 0 && <span className="text-brand ml-1 font-medium">{completedCount}/{steps.length} done</span>}
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {steps.map(s => {
          const done = stats ? s.isDone(stats) : false;
          return (
            <Link key={s.href} href={s.href} className={`rounded-lg bg-[var(--surface)] border p-3 transition-colors group ${done ? 'border-[var(--brand-border)] opacity-70' : 'border-[var(--border)] hover:border-[var(--border-strong)]'}`}>
              <div className="flex items-center gap-1.5 mb-2">
                <s.icon className={`w-5 h-5 ${done ? 'text-brand' : s.color}`} />
                {done && <Check className="w-3.5 h-3.5 text-brand" />}
              </div>
              <div className={`text-[12px] font-medium transition-colors ${done ? 'text-brand' : 'group-hover:text-brand'}`}>{s.title}</div>
              <div className="text-[10px] text-[var(--muted)] mt-0.5">{done ? 'Complete' : s.description}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
