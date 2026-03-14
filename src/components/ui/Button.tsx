import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui';
import type { ButtonHTMLAttributes } from 'react';

const variants = {
  primary: 'bg-brand text-brand-on hover:brightness-110',
  secondary: 'bg-[var(--surface)] text-[var(--sub)] border border-[var(--border)] hover:bg-[var(--hover)]',
  danger: 'text-danger bg-danger/[.06] border border-danger/[.10] hover:bg-danger/[.12]',
  ghost: 'text-[var(--sub)] hover:bg-[var(--hover)] hover:text-[var(--text)]',
} as const;

const sizes = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3.5 py-1.5 text-sm',
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', loading, disabled, children, className, ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Spinner className="h-3 w-3" />}
      {children}
    </button>
  );
}
