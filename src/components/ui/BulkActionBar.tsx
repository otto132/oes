'use client';

import { Spinner } from '@/components/ui';

interface BulkAction {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger' | 'brand';
  isPending?: boolean;
}

interface BulkActionBarProps {
  count: number;
  actions: BulkAction[];
  onClear: () => void;
}

export function BulkActionBar({ count, actions, onClear }: BulkActionBarProps) {
  if (count === 0) return null;

  const variantStyles = {
    default: 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--hover)]',
    danger: 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20',
    brand: 'bg-brand text-brand-on hover:brightness-110',
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--elevated)] border border-[var(--border)] shadow-lg backdrop-blur-sm">
      <span className="text-sm font-medium text-[var(--text)] mr-2">{count} selected</span>
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={action.onClick}
          disabled={action.isPending}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-50 ${variantStyles[action.variant ?? 'default']}`}
        >
          {action.isPending && <Spinner className="h-3 w-3" />}{action.label}
        </button>
      ))}
      <button
        onClick={onClear}
        className="ml-1 px-2 py-1 text-2xs text-[var(--muted)] hover:text-[var(--text)] transition-colors"
      >
        Clear
      </button>
    </div>
  );
}
