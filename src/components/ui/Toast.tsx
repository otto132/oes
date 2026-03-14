'use client';

import Link from 'next/link';
import { useStore } from '@/lib/store';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
} as const;

const colorMap = {
  success: {
    bg: 'bg-emerald-500/[.06]',
    border: 'border-emerald-500/[.12]',
    icon: 'text-emerald-400',
    bar: 'bg-emerald-400',
  },
  error: {
    bg: 'bg-red-500/[.06]',
    border: 'border-red-500/[.12]',
    icon: 'text-red-400',
    bar: 'bg-red-400',
  },
  info: {
    bg: 'bg-blue-500/[.06]',
    border: 'border-blue-500/[.12]',
    icon: 'text-blue-400',
    bar: 'bg-blue-400',
  },
} as const;

export default function ToastContainer() {
  const toasts = useStore(s => s.toasts);
  const removeToast = useStore(s => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => {
        const Icon = iconMap[toast.type];
        const colors = colorMap[toast.type];
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto toast-slide-in flex items-start gap-2 px-3 py-2.5 rounded-md border ${colors.bg} ${colors.border} backdrop-blur-sm shadow-lg shadow-black/20 max-w-[320px] min-w-[240px] relative overflow-hidden`}
          >
            <Icon size={14} className={`${colors.icon} shrink-0 mt-[1px]`} />
            <span className="text-sm text-[var(--text)] leading-snug flex-1">
              {toast.message}
              {toast.action && (
                <>
                  {' '}
                  <Link
                    href={toast.action.href}
                    onClick={() => removeToast(toast.id)}
                    className="underline decoration-dotted hover:decoration-solid"
                  >
                    {toast.action.label}
                  </Link>
                </>
              )}
            </span>
            <button
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 text-[var(--muted)] hover:text-[var(--sub)] transition-colors mt-[1px]"
            >
              <X size={12} />
            </button>
            {/* Progress bar — shrinks over 5s then disappears */}
            <div className={`absolute bottom-0 left-0 h-[2px] ${colors.bar} opacity-40 ${toast.action ? 'toast-progress-long' : 'toast-progress'}`} />
          </div>
        );
      })}
    </div>
  );
}
