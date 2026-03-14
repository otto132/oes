'use client';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SearchInput({ value, onChange, placeholder = 'Search...', className }: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted)]" />
      <input
        className="w-full pl-8 pr-2.5 py-1.5 text-[12.5px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 transition-colors"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}
