'use client';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useRef, useCallback } from 'react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Fires after 300ms of inactivity. Use for filtering / API calls. */
  onDebouncedChange?: (value: string) => void;
  /** Debounce delay in ms (default 300) */
  debounceMs?: number;
  placeholder?: string;
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  onDebouncedChange,
  debounceMs = 300,
  placeholder = 'Search...',
  className,
}: SearchInputProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (next: string) => {
      onChange(next);
      if (onDebouncedChange) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => onDebouncedChange(next), debounceMs);
      }
    },
    [onChange, onDebouncedChange, debounceMs],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClear = useCallback(() => {
    onChange('');
    if (onDebouncedChange) {
      if (timerRef.current) clearTimeout(timerRef.current);
      onDebouncedChange('');
    }
  }, [onChange, onDebouncedChange]);

  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted)]" />
      <input
        className={cn(
          'w-full pl-8 py-1.5 text-[12.5px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 transition-colors',
          value ? 'pr-7' : 'pr-2.5',
        )}
        placeholder={placeholder}
        value={value}
        onChange={e => handleChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-[var(--hover)] text-[var(--muted)] hover:text-[var(--text)] transition-colors"
          aria-label="Clear search"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
