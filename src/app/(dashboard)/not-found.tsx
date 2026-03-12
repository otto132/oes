import Link from 'next/link';

export default function DashboardNotFound() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="max-w-[360px] w-full text-center">
        <div className="text-[48px] font-bold text-[var(--muted)] leading-none mb-2">
          404
        </div>
        <h2 className="text-[15px] font-semibold text-[var(--text)] mb-1">
          Page not found
        </h2>
        <p className="text-[12px] text-[var(--sub)] leading-relaxed mb-5">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold rounded-md bg-[var(--surface)] text-[var(--sub)] border border-[var(--border)] hover:text-[var(--text)] hover:border-[var(--border-strong)] transition-colors"
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
            <path d="M19 12H5" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Home
        </Link>
      </div>
    </div>
  );
}
