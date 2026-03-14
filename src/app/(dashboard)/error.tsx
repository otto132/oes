'use client';

import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[DashboardError]', error);
  }, [error]);

  const message =
    error.message && error.message.length > 200
      ? error.message.slice(0, 200) + '\u2026'
      : error.message || 'An unexpected error occurred.';

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="max-w-[400px] w-full rounded-lg border border-[var(--border)] bg-[var(--elevated)] p-6 text-center">
        {/* Warning icon */}
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-danger/[.08] border border-danger/[.12]">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ef4444"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <h2 className="text-lg font-semibold text-[var(--text)] mb-1">
          Something went wrong
        </h2>
        <p className="text-sm text-[var(--sub)] leading-relaxed mb-5">
          {message}
        </p>

        <button
          onClick={reset}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-md bg-brand/[.08] text-brand border border-brand/[.12] hover:bg-brand/[.14] transition-colors cursor-pointer"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
          </svg>
          Try again
        </button>
      </div>
    </div>
  );
}
